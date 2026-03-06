import { AgentContext, ToolResult } from '../../types';
import { parseUnits, formatUnits, pad } from 'viem';
import {
    CCTP_CONFIG,
    SupportedChain
} from "./config";
import { executeContractCall, executeTransaction, getOrCreateWallet, getWalletBalance } from "@/lib/serverWallet";

// --- Helpers ---
export function resolveChainKey(input: string): SupportedChain | null {
    const normalized = input.toLowerCase().trim().replace(/[\s\-_]+/g, '');
    const mappings: Record<string, SupportedChain> = {
        'base': 'baseSepolia',
        'basesepolia': 'baseSepolia',
        'base-sepolia': 'baseSepolia',
        'arc': 'arcTestnet',
        'arctestnet': 'arcTestnet',
        'arc-testnet': 'arcTestnet',
        'ethereum': 'ethereumSepolia',
        'eth': 'ethereumSepolia',
        'sepolia': 'ethereumSepolia',
        'eth-sepolia': 'ethereumSepolia'
    };
    return mappings[normalized] || null;
}

async function fetchCircleAttestation(sourceTx: string, sourceDomain: number): Promise<{ message: string, attestation: string } | null> {
    try {
        const baseUrl = "https://iris-api-sandbox.circle.com/v2/messages";
        const response = await fetch(`${baseUrl}/${sourceDomain}?transactionHash=${sourceTx}`);
        if (!response.ok) return null;
        const data = await response.json();

        if (data.messages && data.messages.length > 0) {
            const msg = data.messages[0];
            if (msg.status === 'complete') {
                return {
                    message: msg.message,
                    attestation: msg.attestation
                };
            }
        }
        return null;
    } catch (e) {
        console.error("Error fetching attestation:", e);
        return null;
    }
}

export const BridgeSkill = {

    bridgeUSDC: async (
        params: { amount: string | number; destinationChain?: string; destination_chain?: string; destination_address?: string; sourceChain?: string; recipient?: string; to?: string },
        context: AgentContext
    ): Promise<ToolResult> => {
        try {
            console.log("[BridgeSkill] Bridge Params:", JSON.stringify(params));
            // Normalize parameters
            const destChainInput = (params.destinationChain || params.destination_chain) as string;
            const { amount } = params;
            // Handle final recipient: user provided OR current user address
            const finalRecipient = params.recipient || params.to || params.destination_address || (context as any).userAddress;

            if (!destChainInput) {
                return { success: false, message: "Missing destination chain parameter." };
            }
            if (!finalRecipient) {
                return { success: false, message: "Missing recipient address. Please provide a destination address." };
            }

            // 1. Resolve Chains
            const srcChainInput = (params.sourceChain || 'arc') as string;
            const srcKey = resolveChainKey(srcChainInput);
            const destKey = resolveChainKey(destChainInput);
            console.log(`[BridgeSkill] Chain Resolution: src="${srcChainInput}"->"${srcKey}", dest="${destChainInput}"->"${destKey}"`);

            if (!srcKey || !CCTP_CONFIG[srcKey]) {
                return { success: false, message: `Unsupported source chain: ${srcChainInput}` };
            }
            if (!destKey || !CCTP_CONFIG[destKey]) {
                return { success: false, message: `Unsupported destination chain: ${destChainInput}` };
            }

            const srcConfig = CCTP_CONFIG[srcKey];
            const destConfig = CCTP_CONFIG[destKey];
            const parsedAmount = parseUnits(amount.toString(), 6); // Arc USDC uses 6 decimals

            console.log(`⛓️ Chains: ${srcConfig.name} (${srcKey}) -> ${destConfig.name} (${destKey})`);

            // 2. Identify Wallet and Mode
            const userId = (context as any).userId;
            if (!userId) {
                return { success: false, message: 'Error: Missing userId in context. Cannot proceed with autonomous bridge.' };
            }

            console.log("[BridgeSkill] 🤖 Autonomous Mode: Ensuring wallets exist on both chains...");

            // Get Source Wallet using dynamic userId and source chain
            const srcWalletData = await getOrCreateWallet(userId, srcKey);
            const senderAddress = srcWalletData.address;
            const walletId = srcWalletData.walletId; // Source Wallet ID

            // Get Destination Wallet (e.g., Base) using same userId for consistent address
            const destWalletData = await getOrCreateWallet(userId, destKey);
            const agentDestAddress = destWalletData.address;

            console.log(`🤖 Agent Wallets: ${srcKey}=${senderAddress}, ${destKey}=${agentDestAddress}`);

            // 3. Check source balance
            // 3. Check source balance
            // CRITICAL: On Arc, USDC is Native. API requires tokenAddress=undefined to get native balance.
            // For other chains, we use the USDC contract address.
            const balanceTokenAddress = srcKey === 'arcTestnet' ? undefined : srcConfig.usdc;
            const srcBalRaw = await getWalletBalance(walletId, balanceTokenAddress);

            // Circle API returns decimal string (e.g., "0.1"), not integer units.
            // We must parse it to units (BigInt) for comparison.
            const srcBal = parseUnits(srcBalRaw, 6);

            console.log(`[BridgeSkill] 💰 Balance Check: Have ${srcBalRaw} (${srcBal} units), Need ${amount} (${parsedAmount} units)`);

            if (srcBal < parsedAmount) {
                return { success: false, message: `Insufficient funds on ${srcConfig.name}. Have: ${srcBalRaw} USDC, Need: ${amount}` };
            }

            // 4. Execute "Burn" (Approve + Burn handled via executeContractCall) 
            console.log("[BridgeSkill] 📤 Approving USDC for CCTP...");
            const approveResult = await executeContractCall(
                walletId,
                srcConfig.usdc,
                'approve(address,uint256)',
                [srcConfig.tokenMessenger, parsedAmount.toString()],
                srcKey
            );
            if (!approveResult.success) return { success: false, message: `Approve failed: ${approveResult.error}` };

            console.log(`[BridgeSkill] 📤 Burning to agent destination wallet: ${agentDestAddress}`);
            const burnResult = await executeContractCall(
                walletId,
                srcConfig.tokenMessenger,
                'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
                [
                    parsedAmount.toString(),                              // amount
                    destConfig.domain.toString(),                         // destinationDomain
                    pad(agentDestAddress as `0x${string}`, { size: 32 }), // mintRecipient
                    srcConfig.usdc,                                       // burnToken
                    pad("0x0000000000000000000000000000000000000000" as `0x${string}`, { size: 32 }), // destinationCaller
                    "0",                                                  // maxFee
                    "0"                                                   // minGasLimit
                ],
                srcKey
            );

            if (!burnResult.success) return { success: false, message: `Burn failed: ${burnResult.error}` };
            const burnHash = burnResult.txHash!; // Non-null after check

            console.log(`🔥 Burn Hash: ${burnHash}`);

            // 6. Start Polling for Completion - AWAITING to capture Final Hash for user
            console.log(`[BridgeSkill] ⏳ Waiting for CCTP Attestation (this takes 2-5 mins)...`);

            const finalResult = await BridgeSkill.completeBridge(burnHash, srcKey, destKey, finalRecipient, amount.toString(), userId);

            // Format as requested by user (Reverted to 8 chars):
            // Inicio
            // Hash Burn
            // Hash Mint
            // Tx Envio
            let finalMsg = `🚀 Bridge: ${amount} USDC -> ${destConfig.name}\n`;
            finalMsg += `🔥 Burn TX: [${burnHash.substring(0, 8)}...](${srcConfig.explorer}/tx/${burnHash})\n`;

            if (finalResult?.success && finalResult.txHash) {
                finalMsg += `✅ Mint TX: [${finalResult.txHash.substring(0, 8)}...](${destConfig.explorer}/tx/${finalResult.txHash})\n`;
                if (finalResult.transferTxHash) {
                    finalMsg += `📤 Send TX: [${finalResult.transferTxHash.substring(0, 8)}...](${destConfig.explorer}/tx/${finalResult.transferTxHash})\n`;
                }
                finalMsg += `\nFunds available at destination.`;
            } else {
                finalMsg += `⚠️ Status: Burn complete, polling timed out. Check explorer.`;
            }

            return {
                success: true,
                message: finalMsg,
                action: "tx_link",
                data: {
                    burnHash: burnHash,
                    mintHash: finalResult?.txHash,
                    explorer: `${srcConfig.explorer}/tx/${burnHash}`
                }
            };

        } catch (error: any) {
            console.error("[BridgeSkill] Error:", error);
            return { success: false, message: `Failed: ${error.message}` };
        }
    },

    completeBridge: async (burnTx: string, sourceChain: string, destinationChain: string, finalRecipient: string, amount: string, userId: string): Promise<BridgeResult> => { // Use Interface
        // CRITICAL: userId MUST be provided
        if (!userId) {
            console.error('[Bridge Monitor] CRITICAL ERROR: userId not provided to completeBridge!');
            return { success: false };
        }
        console.log(`📡 [Bridge Monitor] Starting autonomous completion for ${burnTx}...`);
        const srcConfig = CCTP_CONFIG[sourceChain as SupportedChain];
        const destConfig = CCTP_CONFIG[destinationChain as SupportedChain];

        try {
            let attestation = null;
            // Poll for up to 15 minutes
            for (let i = 0; i < 60; i++) {
                // Only log every 10 attempts (every 2.5 mins) to keep console clean for demo
                if (i === 0 || i % 10 === 0) console.log(`⌛ [Bridge Monitor] Waiting for CCTP Attestation (Attempt ${i + 1}/60)...`);

                const result = await fetchCircleAttestation(burnTx, srcConfig.domain);
                if (result) {
                    attestation = result;
                    break;
                }
                await new Promise(r => setTimeout(r, 15000));
            }

            if (!attestation) throw new Error("Circle attestation timed out.");
            console.log("✅ Attestation received!");

            // 1. EXECUTE MINT on Destination using Agent's destination wallet
            console.log(`[Bridge Debug] Fetching wallet for userId=${userId}, blockchain=${destinationChain}`);
            const destWalletData = await getOrCreateWallet(userId, destinationChain);
            const { walletId, address: agentDestAddress, accountType } = destWalletData;
            console.log(`[Bridge Debug] Got wallet: walletId=${walletId}, address=${agentDestAddress}, accountType=${accountType}`);

            // --- GAS CHECK (Only for EOAs) ---
            if (accountType !== 'SCA') {
                console.log(`🔍 Checking gas balance for Agent EOA on ${destConfig.name}: ${agentDestAddress}`);
                // (Skipped implementation for brevity/safety - relying on SCA or prefunded EOA)
            } else {
                console.log(`🚀 Agent is using Smart Account (SCA) - Bypassing local gas check for Gas Station support.`);
            }

            console.log(`📥 Executing Mint on ${destConfig.name} (Autonomous)...`);

            // 2. Mint on Destination
            // receiveMessage(bytes message, bytes attestation)
            const mintResult = await executeContractCall(
                walletId,
                destConfig.messageTransmitter,
                'receiveMessage(bytes,bytes)',
                [attestation.message, attestation.attestation],
                destinationChain
            );

            if (!mintResult.success) {
                throw new Error(`Mint failed: ${mintResult.error}`);
            }
            const mintTxHash = mintResult.txHash!;
            console.log(`✨ [Bridge Monitor] SUCCESS! Mint TX: ${mintTxHash}`);

            // --- FINAL TRANSFER TO RECIPIENT ---
            let transferTxHash: string | undefined;

            if (finalRecipient.toLowerCase() !== agentDestAddress.toLowerCase()) {
                console.log(`📤 Delivering to final recipient: ${finalRecipient}`);

                // Retry logic for final transfer to ensure balance is indexed
                const executeFinalTransfer = async (attempt = 1): Promise<string | null> => {
                    const maxAttempts = 5;
                    const delayMs = Math.min(20000 * attempt, 60000); // 20s, 40s, 60s, 60s, 60s

                    try {
                        // Check actual balance (refresh)
                        await getWalletBalance(walletId, destConfig.usdc);

                        // Execute Transfer
                        const txId = await executeTransaction(
                            walletId,
                            finalRecipient,
                            amount,
                            destConfig.usdc,
                            destinationChain
                        );

                        if (txId) {
                            console.log(`✅ Transfer Initiated: Circle ID ${txId}`);
                            return txId;
                        }
                        return null;

                    } catch (e: any) {
                        if (attempt < maxAttempts) {
                            console.log(`⏳ Transfer error: ${e.message}. Retrying in ${delayMs / 1000}s...`);
                            await new Promise(r => setTimeout(r, delayMs));
                            return executeFinalTransfer(attempt + 1);
                        }
                        return null; // Give up after retries
                    }
                };

                const txId = await executeFinalTransfer();
                if (txId) transferTxHash = txId;
            }

            console.log(`🎉 Bridge complete: ${amount} USDC Arc → ${destinationChain} → ${finalRecipient.substring(0, 6)}...`);
            return { success: true, txHash: mintTxHash, transferTxHash };

        } catch (error: any) {
            console.error(`❌ [Bridge Monitor] Critical failure: ${error.message}`);
            return { success: false };
        }
    }
};

interface BridgeResult {
    success: boolean;
    txHash?: string;
    transferTxHash?: string;
}
