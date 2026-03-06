/**
 * Circle Bridge Adapter
 * 
 * Implements IBridgeAdapter using Circle's CCTP (Cross-Chain Transfer Protocol).
 * Supports both traditional CCTP and Forwarding Service.
 */

import { 
    IBridgeAdapter, 
    BridgeParams, 
    BridgeResult, 
    BridgeFeeEstimate,
    BridgeStatus,
    SupportedChain,
    Attestation,
    TransactionResult
} from '../interfaces';
import { ForwardingBridgeSkill } from '../skills/cross-chain/forwardingBridgeSkill';
import { BridgeSkill } from '../skills/cross-chain/bridgeSkill';
import { CCTP_CONFIG } from '../skills/cross-chain/config';

export class CircleBridgeAdapter implements IBridgeAdapter {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    // ============================================
    // CORE BRIDGE
    // ============================================

    async bridge(params: BridgeParams): Promise<BridgeResult> {
        const { amount, fromChain, toChain, recipient, useForwarding = true } = params;

        // Create context for the skill
        const context = {
            userId: this.userId,
            userAddress: recipient
        };

        // Try Forwarding Service first (if enabled)
        if (useForwarding) {
            const result = await ForwardingBridgeSkill.bridge({
                amount,
                sourceChain: fromChain,
                destinationChain: toChain,
                recipient,
                useForwarding: true
            }, context as any);

            if (result.success) {
                const resultData = result.data as any;
                return {
                    success: true,
                    txHash: resultData?.txHash,
                    message: result.message,
                    fees: resultData?.forwardFee ? {
                        protocolFee: '0',
                        bridgeFee: resultData.forwardFee,
                        totalFee: resultData.forwardFee,
                        estimatedTime: 300
                    } : undefined
                };
            }
        }

        // Fallback to traditional CCTP
        const result = await BridgeSkill.bridgeUSDC({
            amount,
            sourceChain: fromChain,
            destinationChain: toChain,
            recipient
        }, context as any);

        const resultData = result.data as any;
        return {
            success: result.success,
            txHash: resultData?.burnHash,
            message: result.message,
            estimatedTime: 900 // 15 minutes for traditional CCTP
        };
    }

    // ============================================
    // FEE ESTIMATION
    // ============================================

    async estimateFee(params: BridgeParams): Promise<BridgeFeeEstimate> {
        const { fromChain, toChain } = params;
        
        const srcConfig = CCTP_CONFIG[this.normalizeChain(fromChain) as keyof typeof CCTP_CONFIG];
        const destConfig = CCTP_CONFIG[this.normalizeChain(toChain) as keyof typeof CCTP_CONFIG];

        if (!srcConfig || !destConfig) {
            throw new Error(`Unsupported chain pair: ${fromChain} -> ${toChain}`);
        }

        // Try to get fees from Circle API
        try {
            const response = await fetch(
                `https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/${srcConfig.domain}/${destConfig.domain}?forward=true`
            );
            const fees = await response.json();

            if (fees && fees.length > 0) {
                const feeData = fees[0];
                const forwardFeeMicroUSDC = parseFloat(feeData.forwardFee.med);
                
                return {
                    protocolFee: '0',
                    bridgeFee: (forwardFeeMicroUSDC / 1_000_000).toString(),
                    totalFee: (forwardFeeMicroUSDC / 1_000_000).toString(),
                    estimatedTime: 300 // 5 minutes for forwarding
                };
            }
        } catch (error) {
            console.error('[CircleBridgeAdapter] Fee estimation error:', error);
        }

        // Fallback estimate
        return {
            protocolFee: '0',
            bridgeFee: '0.5',
            totalFee: '0.5',
            estimatedTime: 900
        };
    }

    // ============================================
    // STATUS
    // ============================================

    async getBridgeStatus(bridgeId: string): Promise<BridgeStatus> {
        // TODO: Implement with Circle API or local tracking
        return {
            id: bridgeId,
            status: 'pending',
            timestamp: Date.now(),
            amount: '0',
            fromChain: 'unknown',
            toChain: 'unknown'
        };
    }

    // ============================================
    // SUPPORTED CHAINS
    // ============================================

    async getSupportedChains(): Promise<SupportedChain[]> {
        return Object.entries(CCTP_CONFIG).map(([key, config]) => ({
            id: config.chainId,
            name: config.name,
            domain: config.domain,
            rpc: config.rpc,
            explorer: config.explorer,
            usdcAddress: config.usdc
        }));
    }

    async isChainSupported(chainId: number): Promise<boolean> {
        return Object.values(CCTP_CONFIG).some(config => config.chainId === chainId);
    }

    // ============================================
    // ATTESTATION (CCTP)
    // ============================================

    async getAttestation(sourceTxHash: string, sourceDomain: number): Promise<Attestation | null> {
        try {
            const response = await fetch(
                `https://iris-api-sandbox.circle.com/v2/messages/${sourceDomain}?transactionHash=${sourceTxHash}`
            );
            const data = await response.json();

            if (data.messages && data.messages.length > 0) {
                const msg = data.messages[0];
                return {
                    message: msg.message,
                    attestation: msg.attestation
                };
            }
        } catch (error) {
            console.error('[CircleBridgeAdapter] Attestation error:', error);
        }
        return null;
    }

    async receiveMessage(message: string, attestation: string): Promise<TransactionResult> {
        // This would need a wallet adapter to execute
        // For now, return a placeholder
        throw new Error('receiveMessage requires wallet adapter integration');
    }

    // ============================================
    // HELPERS
    // ============================================

    private normalizeChain(chain: string): string {
        const normalized = chain.toLowerCase().trim().replace(/[\s\-_]+/g, '');
        const mappings: Record<string, string> = {
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
        return mappings[normalized] || chain;
    }
}

export default CircleBridgeAdapter;
