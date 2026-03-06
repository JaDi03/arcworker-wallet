/**
 * ARC Agent SDK - Interfaces
 * 
 * These interfaces define the contracts between the agent and external systems.
 * Any wallet, DEX, or bridge provider can be used by implementing these interfaces.
 */

// ============================================
// CORE TYPES
// ============================================

export interface ToolResult {
    success: boolean;
    message?: string;
    data?: any;
    action?: string;
}

export interface AgentContext {
    userId: string;
    userAddress: string;
    metadata?: Record<string, any>;
}

// ============================================
// WALLET ADAPTER INTERFACE
// ============================================

/**
 * Interface for wallet implementations.
 * Supports both EOA and Smart Contract Accounts (SCA).
 */
export interface IWalletAdapter {
    // Identity
    getAddress(): Promise<string>;
    getChainId(): Promise<number>;
    getChainName(): Promise<string>;
    
    // Balances
    getBalance(token?: string): Promise<string>;
    getTokenBalances(): Promise<TokenBalance[]>;
    
    // Transactions
    sendTransaction(to: string, amount: string, token?: string): Promise<TransactionResult>;
    sendTransactionWithData(to: string, data: string, value?: string): Promise<TransactionResult>;
    
    // Contract Calls
    executeContractCall(
        contractAddress: string,
        functionSignature: string,
        parameters: any[]
    ): Promise<TransactionResult>;
    
    // Approval (ERC20)
    approve(token: string, spender: string, amount: string): Promise<TransactionResult>;
    getAllowance(token: string, owner: string, spender: string): Promise<string>;
    
    // Events (optional)
    onTransaction?(callback: (tx: Transaction) => void): void;
    onBalanceChange?(callback: (balance: TokenBalance) => void): void;
}

export interface TokenBalance {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    balanceFormatted: string;
    usdValue?: number;
}

export interface TransactionResult {
    success: boolean;
    txHash?: string;
    error?: string;
    explorer?: string;
    circleTxId?: string;
}

export interface Transaction {
    hash: string;
    from: string;
    to: string;
    value: string;
    data?: string;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
}

// ============================================
// BRIDGE ADAPTER INTERFACE
// ============================================

/**
 * Interface for cross-chain bridge implementations.
 * Supports CCTP, LayerZero, or any other bridge protocol.
 */
export interface IBridgeAdapter {
    // Core Bridge
    bridge(params: BridgeParams): Promise<BridgeResult>;
    
    // Fee Estimation
    estimateFee(params: BridgeParams): Promise<BridgeFeeEstimate>;
    
    // Status
    getBridgeStatus(bridgeId: string): Promise<BridgeStatus>;
    
    // Supported Chains
    getSupportedChains(): Promise<SupportedChain[]>;
    isChainSupported(chainId: number): Promise<boolean>;
    
    // Attestation (for CCTP-style bridges)
    getAttestation?(sourceTxHash: string, sourceDomain: number): Promise<Attestation | null>;
    receiveMessage?(message: string, attestation: string): Promise<TransactionResult>;
}

export interface BridgeParams {
    amount: string;
    fromChain: string;
    toChain: string;
    recipient: string;
    token?: string; // defaults to USDC
    useForwarding?: boolean; // for Circle Forwarding Service
}

export interface BridgeResult {
    success: boolean;
    txHash?: string;
    bridgeId?: string;
    message?: string;
    estimatedTime?: number; // seconds
    fees?: BridgeFeeEstimate;
}

export interface BridgeFeeEstimate {
    protocolFee: string;
    bridgeFee: string;
    totalFee: string;
    estimatedTime: number; // seconds
}

export interface BridgeStatus {
    id: string;
    status: 'pending' | 'completed' | 'failed';
    sourceTxHash?: string;
    destinationTxHash?: string;
    amount: string;
    fromChain: string;
    toChain: string;
    timestamp: number;
}

export interface SupportedChain {
    id: number;
    name: string;
    domain?: number; // for CCTP
    rpc: string;
    explorer: string;
    usdcAddress: string;
}

export interface Attestation {
    message: string;
    attestation: string;
}

// ============================================
// DEX ADAPTER INTERFACE
// ============================================

/**
 * Interface for DEX integrations.
 * Supports Uniswap, SushiSwap, or any AMM.
 */
export interface IDEXAdapter {
    // Quotes
    getQuote(params: QuoteParams): Promise<Quote>;
    
    // Swap
    swap(params: SwapParams): Promise<SwapResult>;
    
    // Liquidity
    getPool(tokenA: string, tokenB: string): Promise<Pool | null>;
    addLiquidity(params: LiquidityParams): Promise<TransactionResult>;
    removeLiquidity(params: RemoveLiquidityParams): Promise<TransactionResult>;
    
    // Token Info
    getTokenInfo(address: string): Promise<TokenInfo | null>;
    
    // Supported tokens
    getSupportedTokens(): Promise<TokenInfo[]>;
}

export interface QuoteParams {
    fromToken: string;
    toToken: string;
    amount: string;
    slippage?: number;
}

export interface Quote {
    fromToken: string;
    toToken: string;
    amountIn: string;
    amountOut: string;
    amountOutMin: string;
    priceImpact: number;
    route: string[];
    estimatedGas: string;
}

export interface SwapParams {
    fromToken: string;
    toToken: string;
    amountIn: string;
    amountOutMin: string;
    recipient?: string;
    deadline?: number;
}

export interface SwapResult {
    success: boolean;
    txHash?: string;
    amountIn: string;
    amountOut: string;
    error?: string;
}

export interface Pool {
    address: string;
    token0: string;
    token1: string;
    reserve0: string;
    reserve1: string;
    fee: number;
    liquidity: string;
}

export interface LiquidityParams {
    tokenA: string;
    tokenB: string;
    amountA: string;
    amountB: string;
    slippage?: number;
}

export interface RemoveLiquidityParams {
    tokenA: string;
    tokenB: string;
    liquidity: string;
    slippage?: number;
}

export interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
}

// ============================================
// AI PROVIDER INTERFACE
// ============================================

/**
 * Interface for AI/LLM providers.
 * Supports Gemini, OpenAI, Claude, etc.
 */
export interface IAIProvider {
    // Chat
    chat(messages: Message[]): Promise<string>;
    chatStream?(messages: Message[]): AsyncIterable<string>;
    
    // Tools
    registerTools(tools: AITool[]): void;
    executeTool?(name: string, params: any): Promise<any>;
    
    // Context
    setSystemPrompt(prompt: string): void;
    setContext(context: Record<string, any>): void;
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AITool {
    name: string;
    description: string;
    parameters: any; // JSON Schema
    execute: (params: any) => Promise<any>;
}

// ============================================
// FAUCET ADAPTER INTERFACE
// ============================================

/**
 * Interface for testnet faucet integrations.
 */
export interface IFaucetAdapter {
    requestTokens(params: FaucetParams): Promise<FaucetResult>;
    getSupportedChains(): Promise<string[]>;
    getRateLimit(): Promise<FaucetRateLimit>;
}

export interface FaucetParams {
    chain: string;
    userId: string;
    address?: string;
    token?: 'native' | 'usdc' | 'both';
}

export interface FaucetResult {
    success: boolean;
    txHash?: string;
    amount?: string;
    token?: string;
    message?: string;
    nextAvailableAt?: number;
}

export interface FaucetRateLimit {
    maxRequests: number;
    windowMs: number;
    remaining: number;
    resetAt: number;
}

// ============================================
// STORAGE INTERFACE
// ============================================

/**
 * Interface for persistent storage.
 * Supports localStorage, IndexedDB, or server-side storage.
 */
export interface IStorageAdapter {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    keys(): Promise<string[]>;
}

// ============================================
// EVENT EMITTER INTERFACE
// ============================================

/**
 * Interface for event-driven communication.
 */
export interface IEventEmitter {
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    once(event: string, listener: (...args: any[]) => void): void;
}

// ============================================
// AGENT CONFIG
// ============================================

export interface AgentConfig {
    wallet: IWalletAdapter;
    bridge?: IBridgeAdapter;
    dex?: IDEXAdapter;
    ai: IAIProvider;
    faucet?: IFaucetAdapter;
    storage?: IStorageAdapter;
    
    // Optional settings
    defaultChain?: string;
    defaultSlippage?: number;
    maxRetries?: number;
    timeout?: number;
}
