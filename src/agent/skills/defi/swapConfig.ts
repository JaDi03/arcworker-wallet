/**
 * Swap Configuration - DEX Routers and Token Addresses
 * Simplified for Uniswap V2 style routers
 */

export type SupportedSwapChain = 'arcTestnet' | 'baseSepolia' | 'ethereumSepolia';

export interface SwapChainConfig {
    name: string;
    router: string;
    factory: string;
    weth: string;
    tokens: Record<string, string>;
    explorer: string;
}

// Uniswap V2 Router ABI (minimal - only what we need)
export const UNISWAP_V2_ROUTER_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
            { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
            { "internalType": "address[]", "name": "path", "type": "address[]" },
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "deadline", "type": "uint256" }
        ],
        "name": "swapExactTokensForTokens",
        "outputs": [
            { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
            { "internalType": "address[]", "name": "path", "type": "address[]" }
        ],
        "name": "getAmountsOut",
        "outputs": [
            { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

// ERC20 ABI (minimal)
export const ERC20_ABI = [
    {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "address", "name": "spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

/**
 * Swap Configuration per Chain
 * TODO: Update with actual Arc Testnet addresses when available
 */
export const SWAP_CONFIG: Record<SupportedSwapChain, SwapChainConfig> = {
    arcTestnet: {
        name: 'Arc Testnet',
        // TODO: Replace with actual Uniswap V2 deployment on Arc
        router: '0x0000000000000000000000000000000000000000', // Placeholder
        factory: '0x0000000000000000000000000000000000000000', // Placeholder
        weth: '0x0000000000000000000000000000000000000000', // Placeholder
        tokens: {
            'USDC': '0x3600000000000000000000000000000000000000', // Arc Native USDC
            'WETH': '0x0000000000000000000000000000000000000000', // Placeholder
        },
        explorer: 'https://explorer-testnet.arc.circle.com'
    },
    baseSepolia: {
        name: 'Base Sepolia',
        // Uniswap V2 on Base Sepolia (if exists, otherwise placeholder)
        router: '0x0000000000000000000000000000000000000000', // TODO: Find actual address
        factory: '0x0000000000000000000000000000000000000000',
        weth: '0x4200000000000000000000000000000000000006', // Base WETH
        tokens: {
            'USDC': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            'WETH': '0x4200000000000000000000000000000000000006',
        },
        explorer: 'https://sepolia.basescan.org'
    },
    ethereumSepolia: {
        name: 'Ethereum Sepolia',
        // Uniswap V2 on Sepolia (Official deployment)
        router: '0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3', // UniswapV2Router02
        factory: '0xF62c03E08ada871A0bEb309762E260a7a6a880E6', // UniswapV2Factory
        weth: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // WETH (Wrapped Ether)
        tokens: {
            'USDC': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            'WETH': '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
        },
        explorer: 'https://sepolia.etherscan.io'
    }
};

/**
 * Swap Security Limits
 */
export const SWAP_LIMITS = {
    MAX_SLIPPAGE_PERCENT: 5, // 5% hard limit
    DEFAULT_SLIPPAGE_PERCENT: 0.5, // 0.5% default
    DEADLINE_MINUTES: 20, // 20 minutes
    MIN_LIQUIDITY_USD: 100, // Minimum $100 liquidity (relaxed for testnet)
};

/**
 * Resolve token symbol to address
 */
export function resolveToken(symbol: string | undefined | null, chain: SupportedSwapChain): string | null {
    if (!symbol || typeof symbol !== 'string') return null;

    const normalized = symbol.toUpperCase().trim();
    const config = SWAP_CONFIG[chain];

    if (!config) return null;

    // Direct match
    if (config.tokens[normalized]) {
        return config.tokens[normalized];
    }

    // Check if it's already an address
    if (normalized.startsWith('0X') && normalized.length === 42) {
        return normalized.toLowerCase();
    }

    return null;
}

/**
 * Resolve chain key from user input
 */
export function resolveSwapChain(input?: string): SupportedSwapChain {
    if (!input) return 'arcTestnet';

    const normalized = input.toLowerCase().trim();
    const mappings: Record<string, SupportedSwapChain> = {
        'arc': 'arcTestnet',
        'arctestnet': 'arcTestnet',
        'base': 'baseSepolia',
        'basesepolia': 'baseSepolia',
        'eth': 'ethereumSepolia',
        'ethereum': 'ethereumSepolia',
        'sepolia': 'ethereumSepolia',
        'ethereumsepolia': 'ethereumSepolia'
    };

    return mappings[normalized] || 'arcTestnet';
}
