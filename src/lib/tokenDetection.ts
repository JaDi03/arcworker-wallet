/**
 * Token Detection Helper
 * Detects all ERC20 tokens held by a wallet address
 */

import { createPublicClient, http, formatUnits } from "viem";
import { arcTestnet } from "@/lib/wallet-sdk";

const ERC20_ABI = [
    {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
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
    },
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "name",
        "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export interface TokenBalance {
    symbol: string;
    name: string;
    balance: string;
    decimals: number;
    address: string;
    chain: string;
    isNative?: boolean;
}

/**
 * Known tokens on Arc Testnet
 */
const ARC_TESTNET_TOKENS = [
    {
        address: 'native',
        symbol: 'ARC',
        name: 'ARC Token',
        decimals: 18,
        isNative: true
    },
    {
        address: '0x3600000000000000000000000000000000000000',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
    }
];

/**
 * Known tokens on Ethereum Sepolia
 */
const SEPOLIA_TOKENS = [
    {
        address: 'native',
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        isNative: true
    },
    {
        address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
    },
    {
        address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
    }
];

/**
 * Known tokens on Base Sepolia
 */
const BASE_SEPOLIA_TOKENS = [
    {
        address: 'native',
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
        isNative: true
    },
    {
        address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6
    },
    {
        address: '0x4200000000000000000000000000000000000006',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18
    }
];

/**
 * Get all token balances for a wallet address across multiple chains
 */
// Import resolution logic
import { resolveToken, SWAP_CONFIG, SupportedSwapChain } from "@/agent/skills/defi/swapConfig";

/**
 * Get all token balances for a wallet address across multiple chains
 */
export async function getAllTokenBalances(
    walletAddress: string,
    chains: Array<'arcTestnet' | 'ethereumSepolia' | 'baseSepolia'> = ['arcTestnet'],
    tokenSymbol?: string
): Promise<TokenBalance[]> {
    const allBalances: TokenBalance[] = [];

    for (const chainKey of chains) {
        // Start with default list
        const tokens: any[] = chainKey === 'arcTestnet'
            ? [...ARC_TESTNET_TOKENS]
            : chainKey === 'ethereumSepolia'
                ? [...SEPOLIA_TOKENS]
                : [...BASE_SEPOLIA_TOKENS];

        // DYNAMIC: If specific token requested, resolve and add to list
        if (tokenSymbol) {
            const resolvedAddress = resolveToken(tokenSymbol, chainKey);
            // If we found an address (either from config map or it was a raw address)
            if (resolvedAddress) {
                // Check if already in list to avoid specific duplicates
                const exists = tokens.find(t => t.address.toLowerCase() === resolvedAddress.toLowerCase() || t.symbol.toUpperCase() === tokenSymbol.toUpperCase());

                if (!exists) {
                    console.log(`[TokenDetection] Dynamically adding ${tokenSymbol} (${resolvedAddress}) to check on ${chainKey}`);
                    tokens.push({
                        address: resolvedAddress,
                        symbol: tokenSymbol.toUpperCase(), // Best guess if not in list
                        name: tokenSymbol.toUpperCase(),   // Best guess
                        decimals: 18, // Default to 18, but we should try to fetch it if possible. 
                        // Note: To be perfectly safe, we'll fetch decimals in the loop below or catch error.
                        // For now, let's assume 18 or let the loop handle it.
                        isNative: false // Unless it resolved to 'native' which resolveToken doesn't return usually? resolveToken returns null usually.
                        // Actually resolveToken might return specific address.
                        // Limitation: We presume standard ERC20.
                    });
                }
            } else {
                console.log(`[TokenDetection] Could not resolve ${tokenSymbol} on ${chainKey}`);
            }
        }

        // Use the correct RPC for each chain
        const rpcUrl = chainKey === 'arcTestnet'
            ? 'https://rpc.testnet.arc.network'
            : chainKey === 'ethereumSepolia'
                ? 'https://ethereum-sepolia-rpc.publicnode.com'
                : 'https://sepolia.base.org';

        const publicClient = createPublicClient({
            transport: http(rpcUrl)
        });

        for (const token of tokens) {
            try {
                let balance: bigint;
                let decimals = token.decimals;

                if (token.isNative) {
                    balance = await publicClient.getBalance({
                        address: walletAddress as `0x${string}`
                    });
                } else {
                    // Safety: If we dynamically added it, we might not know decimals.
                    // Fetch decimals if we suspect it's a dynamic token (or just always fetch if we want to be safe, but expensive).
                    // Optimization: Only fetch if decimals is undefined or we want to verify.
                    // For this implementation, let's fetch decimals if it's dynamic (we can flag it or just check if decimals property exists properly?)
                    // The object we pushed has decimals: 18.
                    // Let's try to read decimals from contract to be sure.
                    try {
                        const onChainDecimals = await publicClient.readContract({
                            address: token.address as `0x${string}`,
                            abi: ERC20_ABI,
                            functionName: 'decimals'
                        }) as number;
                        if (onChainDecimals) decimals = onChainDecimals;
                    } catch (e) {
                        // If decimals fail and it's not native, might be invalid token. Skip.
                        console.warn(`[TokenDetection] Failed to read decimals for ${token.symbol} on ${chainKey}`);
                        continue;
                    }

                    balance = await publicClient.readContract({
                        address: token.address as `0x${string}`,
                        abi: ERC20_ABI,
                        functionName: 'balanceOf',
                        args: [walletAddress as `0x${string}`]
                    }) as bigint;
                }

                if (balance > BigInt(0)) {
                    allBalances.push({
                        symbol: token.symbol,
                        name: token.name,
                        balance: formatUnits(balance, decimals),
                        decimals: decimals,
                        address: token.address,
                        chain: chainKey === 'arcTestnet' ? 'Arc Testnet' : chainKey === 'ethereumSepolia' ? 'Ethereum Sepolia' : 'Base Sepolia',
                        isNative: token.isNative
                    });
                }
            } catch (error) {
                console.error(`Failed to fetch balance for ${token.symbol} on ${chainKey}:`, error);
            }
        }
    }

    return allBalances;
}
