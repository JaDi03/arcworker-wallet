import { createPublicClient, defineChain, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction'
import {
    toCircleSmartAccount,
    toModularTransport,
    toPasskeyTransport,
    toWebAuthnCredential,
    WebAuthnMode
} from '@circle-fin/modular-wallets-core'

// Define Arc Testnet
export const arcTestnet = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc.testnet.arc.network'] },
    },
    blockExplorers: {
        default: { name: 'Arc Explorer', url: 'https://explorer-testnet.arc.circle.com' },
    },
})

export const ethSepolia = sepolia;

// Config Mapping (Sync with Circle Modular RPC suffixes - CamelCase in Sandbox)
export const CHAIN_CONFIGS: Record<number, string> = {
    [arcTestnet.id]: 'arcTestnet',
    [11155111]: 'ethereumSepolia',
    [84532]: 'baseSepolia',
    [421614]: 'arbitrumSepolia',
    [11155420]: 'optimismSepolia',
    [43113]: 'avalancheFuji',
    [80002]: 'polygonAmoy'
};

// Types
export interface WalletConfig {
    clientKey: string;
    clientUrl: string;
}

export interface WalletSession {
    address: string;
    smartAccount: any;
    bundlerClient: any;
    credential?: any; // Store for multi-chain portability
}

/**
 * Helper to get a Smart Account and Bundler for any supported chain
 */
export async function getChainSession(
    chainSuffix: string,
    credential: any,
    config: WalletConfig
) {
    const chainIdEntry = Object.entries(CHAIN_CONFIGS).find(([_, suffix]) => suffix === chainSuffix);
    const chainId = chainIdEntry ? Number(chainIdEntry[0]) : arcTestnet.id;

    // Standard RPC check (bypass sandbox for deployment detection)
    const rpcMap: Record<string, string> = {
        'baseSepolia': 'https://sepolia.base.org',
        'ethereumSepolia': 'https://rpc2.sepolia.org',
        'polygonAmoy': 'https://rpc-amoy.polygon.technology',
        'avalancheFuji': 'https://api.avax-test.network/ext/bc/C/rpc',
        'arbitrumSepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
        'optimismSepolia': 'https://sepolia.optimism.io'
    };
    const standardRpc = rpcMap[chainSuffix] || `${config.clientUrl}/${chainSuffix}`;

    const transport = toModularTransport(`${config.clientUrl}/${chainSuffix}`, config.clientKey);

    // We create a temporary standard client just to check if account exists
    // If we have a public RPC, use it to bypass sandbox delay.
    // Otherwise, use the authenticated 'transport' to avoid 401.
    const checkClient = createPublicClient({
        chain: { id: chainId } as any,
        transport: rpcMap[chainSuffix] ? http(rpcMap[chainSuffix]) : transport
    });

    const smartAccount = await toCircleSmartAccount({
        client: checkClient,
        owner: toWebAuthnAccount({ credential }),
    });

    const bundlerClient = createBundlerClient({
        account: smartAccount,
        chain: { id: chainId } as any,
        transport,
    });

    return { smartAccount, bundlerClient, publicClient: checkClient };
}

export async function initializeWallet(
    config: WalletConfig,
    username?: string
): Promise<WalletSession> {
    const { clientKey, clientUrl } = config;

    const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
    const mode = username ? WebAuthnMode.Register : WebAuthnMode.Login;

    const credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode,
        username: username || undefined,
    });

    // Default session is Arc
    const { smartAccount, bundlerClient } = await getChainSession('arcTestnet', credential, config);

    return {
        address: smartAccount.address,
        smartAccount,
        bundlerClient,
        credential, // Important for the Agent and future switches
    };
}

/**
 * Fetches the native ETH balance of an address
 */
export async function getWalletBalance(address: string, chainSuffix?: string): Promise<string> {
    const isArc = !chainSuffix || chainSuffix === 'arcTestnet';
    const suffix = isArc ? 'arcTestnet' : chainSuffix!;
    const clientUrl = process.env.NEXT_PUBLIC_CLIENT_URL!;
    const clientKey = process.env.NEXT_PUBLIC_CLIENT_KEY!;

    // Resolve Chain ID
    const chainIdEntry = Object.entries(CHAIN_CONFIGS).find(([_, s]) => s === suffix);
    const chainId = chainIdEntry ? Number(chainIdEntry[0]) : arcTestnet.id;

    const transport = isArc
        ? toModularTransport(`${clientUrl}/arcTestnet`, clientKey)
        : http(`${clientUrl}/${suffix}?clientKey=${clientKey}`);

    const publicClient = createPublicClient({
        chain: isArc ? arcTestnet : { id: chainId } as any,
        transport,
    });

    try {
        const balance = await publicClient.getBalance({
            address: address as `0x${string}`
        });

        const decimals = isArc ? 18 : 6;
        const formatted = Number(balance) / Math.pow(10, decimals);
        return formatted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
        console.error("Balance fetch error:", e);
        return "0.00";
    }
}

/**
 * Sends a transaction using the smart account
 */
export async function sendTransfer(
    to: string,
    amount: string,
    clientUrl: string,
    clientKey: string,
    session?: WalletSession,
    chainSuffix?: string
): Promise<string> {
    const isArc = !chainSuffix || chainSuffix === 'arcTestnet';
    const suffix = isArc ? 'arcTestnet' : chainSuffix!;

    if (!session?.credential) throw new Error("No authenticated session");

    // Get dynamic session for target chain
    const { smartAccount, bundlerClient } = await getChainSession(suffix, session.credential, { clientUrl, clientKey });

    const decimals = isArc ? 18 : 6;
    const value = BigInt(Math.floor(Number(amount) * Math.pow(10, decimals)));

    const gasOverrides = isArc ? {
        maxPriorityFeePerGas: BigInt(1000000000), // 1 Gwei
    } : {};

    const hash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [{
            to: to as `0x${string}`,
            value: value,
            data: '0x'
        }],
        paymaster: true,
        ...gasOverrides
    });

    return hash;
}

/**
 * Executes a batch of contract calls (UserOp)
 */
export async function executeBatch(
    calls: { to: string; value: string; data: string }[],
    clientUrl: string,
    clientKey: string,
    existingSession?: { smartAccount: any, bundlerClient: any }
): Promise<string> {
    let smartAccount = existingSession?.smartAccount;
    let bundlerClient = existingSession?.bundlerClient;

    if (!smartAccount || !bundlerClient) {
        // Fallback: Re-create session
        const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
        const credential = await toWebAuthnCredential({
            transport: passkeyTransport,
            mode: WebAuthnMode.Login,
        });

        smartAccount = await toCircleSmartAccount({
            client: createPublicClient({
                chain: arcTestnet,
                transport: toModularTransport(clientUrl + '/arcTestnet', clientKey)
            }),
            owner: toWebAuthnAccount({ credential }),
        });

        bundlerClient = createBundlerClient({
            account: smartAccount,
            chain: arcTestnet,
            transport: toModularTransport(clientUrl + '/arcTestnet', clientKey),
        });
    }

    // Map calls to viem format
    const viemCalls = calls.map(c => ({
        to: c.to as `0x${string}`,
        value: BigInt(c.value || "0"),
        data: c.data as `0x${string}`
    }));


    // Gas Overrides for Arc Testnet
    const gasOverrides = {
        maxPriorityFeePerGas: BigInt(1000000000), // 1 Gwei
        callGasLimit: BigInt(2000000), // Force 2M gas to avoid '0' estimation error
        verificationGasLimit: BigInt(1000000), // Force 1M verification gas (safe margin)
    };

    const hash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: viemCalls,
        paymaster: true,
        ...gasOverrides
    });

    return hash;
}

/**
 * Deploys the Smart Account on a specific chain by sending a dummy UserOp.
 * This registers the wallet in the Circle Bundler for that network.
 */

// ============================================================
// AUTONOMOUS WALLET FUNCTIONS (Developer-Controlled SCA)
// These functions use the server-side wallet for autonomous operations.
// ============================================================

const SERVER_WALLET_API = '/api/wallet';

/**
 * Get or create an autonomous wallet for a user session.
 * For PC-first development, uses a fixed session ID.
 */
export async function getAutonomousWallet(userId: string): Promise<{ walletId: string; address: string }> {
    const response = await fetch(SERVER_WALLET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getOrCreateWallet', userId }),
    });

    const data = await response.json();
    if (!data.success && !data.walletId) {
        throw new Error(data.error || 'Failed to get autonomous wallet');
    }

    return { walletId: data.walletId, address: data.address };
}

/**
 * Execute an autonomous transfer without user signature.
 * This is the key function for Agent autonomy.
 */
export async function autonomousTransfer(
    toAddress: string,
    amount: string,
    userId: string,
    tokenAddress?: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    // Get wallet first
    const { walletId } = await getAutonomousWallet(userId);

    const response = await fetch(SERVER_WALLET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'executeTransaction',
            walletId,
            toAddress,
            amount,
            tokenAddress,
        }),
    });

    return await response.json();
}

/**
 * Execute an autonomous contract call (for mint, swap, etc.)
 */
export async function autonomousContractCall(
    contractAddress: string,
    functionSignature: string,
    parameters: any[],
    userId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const { walletId } = await getAutonomousWallet(userId);

    const response = await fetch(SERVER_WALLET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'executeContractCall',
            walletId,
            contractAddress,
            functionSignature,
            parameters,
        }),
    });

    return await response.json();
}

/**
 * Get autonomous wallet balance (without Passkey)
 */
export async function getAutonomousBalance(userId: string): Promise<{ native: string; usdc: string }> {
    const { walletId } = await getAutonomousWallet(userId);

    const response = await fetch(SERVER_WALLET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getBalance', walletId }),
    });

    const data = await response.json();
    return { native: data.native || '0', usdc: data.usdc || '0' };
}

// Export a flag to indicate autonomous mode is available
export const AUTONOMOUS_MODE = true;

