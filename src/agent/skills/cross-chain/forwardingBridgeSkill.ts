import { AgentContext, ToolResult } from '../../types';
import { parseUnits, formatUnits, pad } from 'viem';
import { 
    CCTP_CONFIG, 
    SupportedChain,
    TOKEN_MESSENGER_ABI
} from "./config";
import { executeContractCall, executeTransaction, getOrCreateWallet, getWalletBalance } from "@/lib/serverWallet";
import { BridgeSkill } from './bridgeSkill';

// --- Forwarding Service Configuration ---

// Forwarding Service uses TokenMessengerV2 with depositForBurnWithHook function
// The hook data tells Circle to handle the mint automatically

const FORWARDING_SERVICE_HOOK_DATA = 
    "0x636374702d666f72776172640000000000000000000000000000000000000000" as `0x${string}`;

// --- Helpers ---

function resolveChainKey(input: string): SupportedChain | null {
    const normalized = input.toLowerCase().trim().replace(/[\s\-_]+/g, '');
    const mappings: Record<string, SupportedChain> = {
        'base': 'baseSepolia',
        'basesepolia': 'baseSepolia',
        'arc': 'arcTestnet',
        'arctestnet': 'arcTestnet',
        'ethereum': 'ethereumSepolia',
        'eth': 'ethereumSepolia',
        'sepolia': 'ethereumSepolia',
        'arbitrum': 'arbitrumSepolia',
        'arb': 'arbitrumSepolia',
        'optimism': 'optimismSepolia',
        'op': 'optimismSepolia',
        'avalanche': 'avalancheFuji',
        'avax': 'avalancheFuji',
        'polygon': 'polygonAmoy',
        'matic': 'polygonAmoy'
    };
    return mappings[normalized] || null;
}

// --- API for fees ---

async function getForwardingFees(
    sourceDomain: number, 
    destDomain: number
): Promise<{ forwardFee: bigint; protocolFee: bigint; maxFee: bigint } | null> {
    try {
        const response = await fetch(
            `https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/${sourceDomain}/${destDomain}?forward=true`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            }
        );
        
        if (!response.ok) {
            console.error(`[ForwardingBridge] Fee API error: ${response.status}`);
            return null;
        }
        
        const fees = await response.json();
        
        if (!fees || fees.length === 0) {
            return null;
        }
        
        // The API returns fees in micro-USDC (6 decimals), NOT in USDC
        // Example: forwardFee.med = 201615 means 0.201615 USDC
        const feeData = fees[0];
        
        let forwardFeeMicroUSDC = 0;
        if (typeof feeData.forwardFee === 'object') {
            // Format: { low: 201615, med: 201615, high: 201865 } - in micro-USDC
            forwardFeeMicroUSDC = parseFloat(feeData.forwardFee.med);
        } else if (typeof feeData.forwardFee === 'string') {
            forwardFeeMicroUSDC = parseFloat(feeData.forwardFee);
        }
        
        // Parse minimum fee (in cents, convert to USDC micro-units)
        // minimumFee is in cents, so 50 cents = 0.50 USDC = 500,000 micro-USDC
        const minimumFeeCents = parseInt(feeData.minimumFee) || 0;
        const protocolFee = BigInt(minimumFeeCents * 10_000); // Convert cents to micro-USDC
        
        const forwardFee = BigInt(Math.floor(forwardFeeMicroUSDC));
        const maxFee = forwardFee + protocolFee;
        
        console.log(`[ForwardingBridge] Fee API response:`, {
            forwardFeeMicroUSDC,
            forwardFeeUSDC: forwardFeeMicroUSDC / 1_000_000,
            forwardFee: forwardFee.toString(),
            minimumFeeCents,
            protocolFee: protocolFee.toString(),
            maxFee: maxFee.toString()
        });
        
        return { forwardFee, protocolFee, maxFee };
    } catch (error) {
        console.error('[ForwardingBridge] Error getting fees:', error);
        return null;
    }
}

// --- Bridge Skill with Forwarding Support ---

export const ForwardingBridgeSkill = {
    name: 'forwardingBridge',
    description: 'Bridge USDC using Circle Forwarding Service (Circle handles mint automatically)',

    /**
     * Bridge USDC using Forwarding Service or Traditional CCTP
     */
    bridge: async (
        params: {
            amount: string | number;
            destinationChain?: string;
            destination_chain?: string;
            sourceChain?: string;
            source_chain?: string;
            recipient?: string;
            to?: string;
            destination_address?: string;
            useForwarding?: boolean; // Force use or skip forwarding
        },
        context: AgentContext
    ): Promise<ToolResult> => {
        
        // Normalize parameters
        const destChainInput = (params.destinationChain || params.destination_chain) as string;
        const srcChainInput = (params.sourceChain || params.source_chain || 'arc') as string;
        const finalRecipient = params.recipient || params.to || params.destination_address || (context as any).userAddress;
        const { amount, useForwarding } = params;

        // Resolve chains
        const srcKey = resolveChainKey(srcChainInput);
        const destKey = resolveChainKey(destChainInput);

        if (!srcKey) {
            return { success: false, message: `Unsupported source chain: ${srcChainInput}` };
        }
        if (!destKey) {
            return { success: false, message: `Unsupported destination chain: ${destChainInput}` };
        }
        if (!finalRecipient) {
            return { success: false, message: 'Missing recipient address' };
        }

        const srcConfig = CCTP_CONFIG[srcKey];
        const destConfig = CCTP_CONFIG[destKey];
        const parsedAmount = parseUnits(amount.toString(), 6);

        const userId = (context as any).userId;
        if (!userId) {
            return { success: false, message: 'Missing userId in context' };
        }

        console.log(`[ForwardingBridge] Attempting bridge: ${amount} USDC from ${srcKey} to ${destKey}`);
        
        // Default: try forwarding first, fallback to traditional
        const shouldUseForwarding = useForwarding !== false; // default true

        if (shouldUseForwarding) {
            console.log(`[ForwardingBridge] Using Forwarding Service...`);
            return await ForwardingBridgeSkill.bridgeWithForwarding(
                userId, srcKey, destKey, amount.toString(), finalRecipient
            );
        } else {
            // Fallback to traditional bridge
            console.log(`[ForwardingBridge] Falling back to traditional CCTP bridge`);
            return await BridgeSkill.bridgeUSDC({
                amount: amount,
                destinationChain: destChainInput,
                sourceChain: srcChainInput,
                recipient: finalRecipient
            }, context);
        }
    },

    /**
     * Execute bridge using Circle Forwarding Service
     * Uses depositForBurnWithHook instead of depositForBurn
     */
    bridgeWithForwarding: async (
        userId: string,
        sourceChain: SupportedChain,
        destChain: SupportedChain,
        amount: string,
        recipient: string
    ): Promise<ToolResult> => {
        
        const srcConfig = CCTP_CONFIG[sourceChain];
        const destConfig = CCTP_CONFIG[destChain];
        
        console.log(`[ForwardingBridge] Using Forwarding Service from ${srcConfig.name} to ${destConfig.name}`);

        try {
            // 1. Get wallet
            const srcWalletData = await getOrCreateWallet(userId, sourceChain);
            const walletId = srcWalletData.walletId;
            const userAddress = srcWalletData.address;

            // 2. Check balance
            const balanceTokenAddress = sourceChain === 'arcTestnet' ? undefined : srcConfig.usdc;
            const srcBalRaw = await getWalletBalance(walletId, balanceTokenAddress);
            const srcBal = parseUnits(srcBalRaw, 6);
            const parsedAmount = parseUnits(amount, 6);

            // 3. Get forwarding fees from API
            console.log(`[ForwardingBridge] Getting forwarding fees from Circle API...`);
            const fees = await getForwardingFees(srcConfig.domain, destConfig.domain);
            
            let totalToBurn: bigint;
            let forwardFeeDisplay = 'unknown';
            
            if (fees) {
                totalToBurn = parsedAmount + fees.maxFee;
                forwardFeeDisplay = formatUnits(fees.maxFee, 6);
                console.log(`[ForwardingBridge] Fees: forward=${forwardFeeDisplay} USDC, total to burn=${formatUnits(totalToBurn, 6)}`);
            } else {
                // Fallback: assume small fee if API fails
                const estimatedFee = BigInt(500000); // 0.5 USDC
                totalToBurn = parsedAmount + estimatedFee;
                forwardFeeDisplay = '0.5 (estimated)';
            }

            if (srcBal < totalToBurn) {
                return {
                    success: false,
                    message: `Insufficient balance. Have: ${srcBalRaw} USDC, Need: ${formatUnits(totalToBurn, 6)} USDC (including fees)`
                };
            }

            // 4. Approve USDC for TokenMessenger
            console.log(`[ForwardingBridge] Approving USDC for transfer...`);
            console.log(`[ForwardingBridge] Approval params: walletId=${walletId}, usdc=${srcConfig.usdc}, tokenMessenger=${srcConfig.tokenMessenger}, amount=${totalToBurn}`);
            
            const approveResult = await executeContractCall(
                walletId,
                srcConfig.usdc,
                'approve(address,uint256)',
                [srcConfig.tokenMessenger, totalToBurn.toString()],
                sourceChain
            );

            console.log(`[ForwardingBridge] Approval result:`, JSON.stringify(approveResult));

            if (!approveResult.success) {
                return {
                    success: false,
                    message: `Approval failed: ${approveResult.error}`
                };
            }

            console.log(`[ForwardingBridge] Approved. Now executing depositForBurnWithHook...`);
            console.log(`[ForwardingBridge] Burn params: walletId=${walletId}, tokenMessenger=${srcConfig.tokenMessenger}, amount=${totalToBurn}, destDomain=${destConfig.domain}, recipient=${recipient}`);

            // 5. Execute depositForBurnWithHook
            // This function includes the hook data that tells Circle to handle mint automatically
            const burnResult = await executeContractCall(
                walletId,
                srcConfig.tokenMessenger,
                'depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes)',
                [
                    totalToBurn.toString(),                    // amount (including fees)
                    destConfig.domain.toString(),              // destinationDomain
                    pad(recipient as `0x${string}`, { size: 32 }), // mintRecipient (bytes32)
                    srcConfig.usdc,                           // burnToken
                    pad("0x0000000000000000000000000000000000000000", { size: 32 }), // destinationCaller (any)
                    fees ? fees.maxFee.toString() : "500000", // maxFee
                    "1000",                                   // minFinalityThreshold (fast)
                    FORWARDING_SERVICE_HOOK_DATA              // hookData
                ],
                sourceChain
            );

            console.log(`[ForwardingBridge] Burn result:`, JSON.stringify(burnResult));

            if (!burnResult.success || !burnResult.txHash) {
                return {
                    success: false,
                    message: `Forwarding bridge failed: ${burnResult.error || 'Unknown error'}`
                };
            }

            const explorerUrl = `${srcConfig.explorer}/tx/${burnResult.txHash}`;

            console.log(`[ForwardingBridge] ✅ Burn transaction sent: ${burnResult.txHash}`);
            console.log(`[ForwardingBridge] Circle will automatically mint USDC on ${destConfig.name}`);

            return {
                success: true,
                message: `🚀 Bridge initiated via Forwarding Service!\n\n` +
                    `📤 Amount: ${amount} USDC\n` +
                    `💰 Fee: ~${forwardFeeDisplay} USDC\n` +
                    `📍 From: ${srcConfig.name}\n` +
                    `📍 To: ${destConfig.name}\n` +
                    `👤 Recipient: ${recipient}\n\n` +
                    `🔗 Burn TX: [${burnResult.txHash.substring(0, 10)}...](${explorerUrl})\n\n` +
                    `⏳ Circle is processing the bridge automatically...\n` +
                    `✨ The mint will be executed on destination without you needing to do anything.`,
                data: {
                    txHash: burnResult.txHash,
                    explorer: explorerUrl,
                    amount,
                    forwardFee: forwardFeeDisplay,
                    sourceChain,
                    destChain,
                    recipient,
                    mode: 'forwarding_service'
                },
                action: 'tx_link'
            };

        } catch (error: any) {
            console.error('[ForwardingBridge] Error:', error);
            return {
                success: false,
                message: `Forwarding bridge failed: ${error.message}`
            };
        }
    }
};

export default ForwardingBridgeSkill;
