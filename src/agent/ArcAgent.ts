/**
 * ARC Agent SDK
 *
 * Main entry point for the agent SDK.
 * Provides a simple interface for integrating AI agents with ARC blockchain.
 */

import {
    AgentConfig,
    IWalletAdapter,
    IBridgeAdapter,
    IDEXAdapter,
    IAIProvider,
    IFaucetAdapter,
    ToolResult,
    AgentContext,
    BridgeFeeEstimate
} from './interfaces';

export * from './interfaces';

/**
 * ARC Agent - Main class for interacting with ARC blockchain via AI
 * 
 * @example
 * ```typescript
 * import { ArcAgent, CircleWalletAdapter, CircleBridgeAdapter } from '@arc/agent-sdk';
 * 
 * const agent = new ArcAgent({
 *   wallet: new CircleWalletAdapter('user-123', 'arcTestnet'),
 *   bridge: new CircleBridgeAdapter('user-123'),
 *   ai: new GeminiProvider(process.env.GEMINI_API_KEY)
 * });
 * 
 * const response = await agent.chat("Send 10 USDC to base");
 * ```
 */
export class ArcAgent {
    private wallet: IWalletAdapter;
    private bridge?: IBridgeAdapter;
    private dex?: IDEXAdapter;
    private ai?: IAIProvider;
    private faucet?: IFaucetAdapter;
    private context: AgentContext;

    constructor(config: AgentConfig) {
        this.wallet = config.wallet;
        this.bridge = config.bridge;
        this.dex = config.dex;
        this.ai = config.ai;
        this.faucet = config.faucet;
        
        // Initialize context
        this.context = {
            userId: 'unknown',
            userAddress: '',
            metadata: {}
        };
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    /**
     * Initialize the agent with user context
     */
    async initialize(userId: string): Promise<void> {
        this.context.userId = userId;
        this.context.userAddress = await this.wallet.getAddress();
        
        // Set AI context if available
        if (this.ai) {
            this.ai.setContext({
                userId,
                userAddress: this.context.userAddress,
                chain: await this.wallet.getChainName()
            });
        }
    }

    // ============================================
    // CHAT INTERFACE
    // ============================================

    /**
     * Send a message to the agent
     */
    async chat(message: string): Promise<string> {
        // This would integrate with the AI provider
        // For now, return a placeholder
        return `Agent received: ${message}`;
    }

    // ============================================
    // WALLET OPERATIONS
    // ============================================

    /**
     * Get wallet address
     */
    async getAddress(): Promise<string> {
        return this.wallet.getAddress();
    }

    /**
     * Get balance
     */
    async getBalance(token?: string): Promise<string> {
        return this.wallet.getBalance(token);
    }

    /**
     * Send tokens
     */
    async send(to: string, amount: string, token?: string): Promise<ToolResult> {
        const result = await this.wallet.sendTransaction(to, amount, token);
        return {
            success: result.success,
            message: result.success 
                ? `Sent ${amount} to ${to}` 
                : `Failed: ${result.error}`,
            data: result
        };
    }

    // ============================================
    // BRIDGE OPERATIONS
    // ============================================

    /**
     * Bridge tokens to another chain
     */
    async crossChainBridge(params: {
        amount: string;
        toChain: string;
        recipient?: string;
    }): Promise<ToolResult> {
        if (!this.bridge) {
            return { success: false, message: 'Bridge not configured' };
        }

        const recipient = params.recipient || this.context.userAddress;
        const result = await this.bridge.bridge({
            amount: params.amount,
            fromChain: await this.wallet.getChainName(),
            toChain: params.toChain,
            recipient
        });

        return {
            success: result.success,
            message: result.message,
            data: result
        };
    }

    /**
     * Estimate bridge fee
     */
    async estimateBridgeFee(params: {
        amount: string;
        toChain: string;
    }): Promise<BridgeFeeEstimate | null> {
        if (!this.bridge) return null;

        return this.bridge.estimateFee({
            amount: params.amount,
            fromChain: await this.wallet.getChainName(),
            toChain: params.toChain,
            recipient: this.context.userAddress
        });
    }

    // ============================================
    // DEX OPERATIONS
    // ============================================

    /**
     * Get swap quote
     */
    async getQuote(params: {
        fromToken: string;
        toToken: string;
        amount: string;
    }): Promise<ToolResult> {
        if (!this.dex) {
            return { success: false, message: 'DEX not configured' };
        }

        const quote = await this.dex.getQuote(params);
        return {
            success: true,
            data: quote
        };
    }

    /**
     * Execute swap
     */
    async swap(params: {
        fromToken: string;
        toToken: string;
        amount: string;
        slippage?: number;
    }): Promise<ToolResult> {
        if (!this.dex) {
            return { success: false, message: 'DEX not configured' };
        }

        const quote = await this.dex.getQuote({
            fromToken: params.fromToken,
            toToken: params.toToken,
            amount: params.amount,
            slippage: params.slippage
        });

        const result = await this.dex.swap({
            fromToken: params.fromToken,
            toToken: params.toToken,
            amountIn: params.amount,
            amountOutMin: quote.amountOutMin
        });

        return {
            success: result.success,
            message: result.success 
                ? `Swapped ${result.amountIn} for ${result.amountOut}` 
                : `Swap failed: ${result.error}`,
            data: result
        };
    }

    // ============================================
    // FAUCET OPERATIONS
    // ============================================

    /**
     * Request testnet tokens
     */
    async requestFaucet(chain?: string): Promise<ToolResult> {
        if (!this.faucet) {
            return { success: false, message: 'Faucet not configured' };
        }

        const result = await this.faucet.requestTokens({
            chain: chain || await this.wallet.getChainName(),
            userId: this.context.userId,
            address: this.context.userAddress
        });

        return {
            success: result.success,
            message: result.message,
            data: result
        };
    }

    // ============================================
    // CONTEXT
    // ============================================

    /**
     * Get current context
     */
    getContext(): AgentContext {
        return { ...this.context };
    }

    /**
     * Update context
     */
    updateContext(updates: Partial<AgentContext>): void {
        this.context = { ...this.context, ...updates };
    }
}

export default ArcAgent;
