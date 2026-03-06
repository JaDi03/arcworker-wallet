/**
 * Circle Wallet Adapter
 * 
 * Implements IWalletAdapter using Circle's Developer-Controlled Wallets.
 * This adapter bridges the gap between the agent's interface and Circle's SDK.
 */

import { IWalletAdapter, TokenBalance, TransactionResult, Transaction } from '../interfaces';
import { getOrCreateWallet, getWalletBalance, executeTransaction, executeContractCall } from '@/lib/serverWallet';

export interface CircleWalletConfig {
    apiKey?: string;
    walletSetId?: string;
    entitySecret?: string;
}

export class CircleWalletAdapter implements IWalletAdapter {
    private userId: string;
    private chain: string;
    private address: string | null = null;
    private walletId: string | null = null;
    private config: CircleWalletConfig;

    constructor(userId: string, chain: string = 'arcTestnet', config?: CircleWalletConfig) {
        this.userId = userId;
        this.chain = chain;
        this.config = config || {};
    }

    // ============================================
    // IDENTITY
    // ============================================

    async getAddress(): Promise<string> {
        if (this.address) return this.address;
        
        const wallet = await getOrCreateWallet(this.userId, this.chain);
        this.address = wallet.address;
        this.walletId = wallet.walletId;
        return this.address;
    }

    async getChainId(): Promise<number> {
        const chainIds: Record<string, number> = {
            'arcTestnet': 5042002,
            'ethereumSepolia': 11155111,
            'baseSepolia': 84532,
            'arbitrumSepolia': 421614,
            'optimismSepolia': 11155420,
            'avalancheFuji': 43113,
            'polygonAmoy': 80002
        };
        return chainIds[this.chain] || 5042002;
    }

    async getChainName(): Promise<string> {
        const names: Record<string, string> = {
            'arcTestnet': 'Arc Testnet',
            'ethereumSepolia': 'Ethereum Sepolia',
            'baseSepolia': 'Base Sepolia',
            'arbitrumSepolia': 'Arbitrum Sepolia',
            'optimismSepolia': 'Optimism Sepolia',
            'avalancheFuji': 'Avalanche Fuji',
            'polygonAmoy': 'Polygon Amoy'
        };
        return names[this.chain] || this.chain;
    }

    // ============================================
    // BALANCES
    // ============================================

    async getBalance(token?: string): Promise<string> {
        await this.ensureWallet();
        // For Arc, native USDC is used; for others, pass token address
        const balance = await getWalletBalance(this.walletId!, token);
        return balance;
    }

    async getTokenBalances(): Promise<TokenBalance[]> {
        await this.ensureWallet();
        
        // Get USDC balance (native on Arc)
        const usdcBalance = await this.getBalance();
        
        return [{
            address: this.chain === 'arcTestnet' 
                ? '0x3600000000000000000000000000000000000000' 
                : 'native',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            balance: usdcBalance,
            balanceFormatted: usdcBalance,
            usdValue: parseFloat(usdcBalance)
        }];
    }

    // ============================================
    // TRANSACTIONS
    // ============================================

    async sendTransaction(to: string, amount: string, token?: string): Promise<TransactionResult> {
        await this.ensureWallet();
        
        try {
            const txHash = await executeTransaction(
                this.walletId!,
                to,
                amount,
                token,
                this.chain
            );

            return {
                success: true,
                txHash: txHash
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async sendTransactionWithData(to: string, data: string, value?: string): Promise<TransactionResult> {
        await this.ensureWallet();
        
        // For Circle wallets, we use executeContractCall for data transactions
        // This is a simplified implementation
        const result = await executeContractCall(
            this.walletId!,
            to,
            data, // function signature + encoded params
            [],
            this.chain
        );

        return {
            success: result.success,
            txHash: result.txHash,
            error: result.error
        };
    }

    // ============================================
    // CONTRACT CALLS
    // ============================================

    async executeContractCall(
        contractAddress: string,
        functionSignature: string,
        parameters: any[]
    ): Promise<TransactionResult> {
        await this.ensureWallet();
        
        const result = await executeContractCall(
            this.walletId!,
            contractAddress,
            functionSignature,
            parameters,
            this.chain
        );

        return {
            success: result.success,
            txHash: result.txHash,
            error: result.error,
            circleTxId: result.circleTxId
        };
    }

    // ============================================
    // APPROVAL (ERC20)
    // ============================================

    async approve(token: string, spender: string, amount: string): Promise<TransactionResult> {
        return this.executeContractCall(
            token,
            'approve(address,uint256)',
            [spender, amount]
        );
    }

    async getAllowance(token: string, owner: string, spender: string): Promise<string> {
        // This would require a read contract call
        // For now, return a placeholder
        // TODO: Implement with public client
        return '0';
    }

    // ============================================
    // EVENTS (OPTIONAL)
    // ============================================

    onTransaction?(callback: (tx: Transaction) => void): void {
        // TODO: Implement with Circle webhooks or polling
    }

    onBalanceChange?(callback: (balance: TokenBalance) => void): void {
        // TODO: Implement with Circle webhooks or polling
    }

    // ============================================
    // HELPERS
    // ============================================

    private async ensureWallet(): Promise<void> {
        if (!this.address || !this.walletId) {
            const wallet = await getOrCreateWallet(this.userId, this.chain);
            this.address = wallet.address;
            this.walletId = wallet.walletId;
        }
    }

    // Get the internal wallet ID (Circle-specific)
    getWalletId(): string | null {
        return this.walletId;
    }

    // Switch to a different chain
    switchChain(newChain: string): CircleWalletAdapter {
        return new CircleWalletAdapter(this.userId, newChain, this.config);
    }
}

export default CircleWalletAdapter;
