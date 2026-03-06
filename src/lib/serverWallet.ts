/**
 * Server-Side Wallet Operations using Circle Developer-Controlled Wallets
 * This module enables the Agent to execute transactions autonomously without user signatures.
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

// Initialize the Circle SDK client
let circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function getCircleClient() {
    if (!circleClient) {
        const apiKey = process.env.CIRCLE_API_KEY;
        const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

        if (!apiKey || !entitySecret) {
            throw new Error('Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in environment variables');
        }

        circleClient = initiateDeveloperControlledWalletsClient({
            apiKey,
            entitySecret,
        });
    }
    return circleClient;
}

// Cache for wallet set ID (created once per application)
let cachedWalletSetId: string | null = null;

/**
 * Get or create a wallet set for the application.
 * A wallet set is a container for developer-controlled wallets.
 */
async function getOrCreateWalletSet(): Promise<string> {
    if (cachedWalletSetId) return cachedWalletSetId;

    const client = getCircleClient();

    try {
        // Try to list existing wallet sets
        const { data } = await client.listWalletSets({});
        console.log('[ServerWallet] Wallet sets found:', data?.walletSets?.length || 0);

        if (data?.walletSets && data.walletSets.length > 0) {
            // Filter for OUR specific set name and DEVELOPER custody type
            const targetSet = data.walletSets.find((ws: any) =>
                ws.name === 'ArcHub-Autonomous-v3' && ws.custodyType === 'DEVELOPER'
            );

            if (targetSet) {
                cachedWalletSetId = targetSet.id!;
                console.log('[ServerWallet] Using existing wallet set:', cachedWalletSetId);
                return cachedWalletSetId;
            } else {
                // If not found by name, pick the first DEVELOPER set as fallback
                const fallbackSet = data.walletSets.find((ws: any) => ws.custodyType === 'DEVELOPER');
                if (fallbackSet) {
                    cachedWalletSetId = fallbackSet.id!;
                    console.log('[ServerWallet] Target set not found, falling back to:', cachedWalletSetId);
                    return cachedWalletSetId;
                }
            }
        }
    } catch (e: any) {
        console.log('[ServerWallet] Error listing wallet sets:', e.message);
    }

    // Create a new DEVELOPER wallet set
    console.log('[ServerWallet] Creating new DEVELOPER wallet set...');
    try {
        const { data: newSet } = await client.createWalletSet({
            name: 'ArcHub-Autonomous-v3',
            idempotencyKey: uuidv4(),
        });

        console.log('[ServerWallet] Create wallet set response:', JSON.stringify(newSet, null, 2));
        cachedWalletSetId = newSet?.walletSet?.id!;
        console.log('[ServerWallet] Created new wallet set:', cachedWalletSetId);
        return cachedWalletSetId;
    } catch (createError: any) {
        console.error('[ServerWallet] Failed to create wallet set:', createError.message);
        throw createError;
    }
}

// Cache for user wallets: userId -> Map<blockchainId, walletData>
// With TTL and max size limit to prevent memory leaks
const WALLET_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
const MAX_WALLET_CACHE_SIZE = 1000; // Maximum number of users to cache

interface CachedWalletData {
    walletId: string;
    address: string;
    accountType?: string;
    timestamp: number; // For TTL
}

const walletCache = new Map<string, Map<string, CachedWalletData>>();

// Cleanup expired entries from wallet cache
function cleanupWalletCache(): void {
    const now = Date.now();
    const entries = Array.from(walletCache.entries());
    for (const [userId, chains] of entries) {
        const chainEntries = Array.from(chains.entries());
        for (const [chainId, data] of chainEntries) {
            if (now - data.timestamp > WALLET_CACHE_TTL_MS) {
                chains.delete(chainId);
            }
        }
        if (chains.size === 0) {
            walletCache.delete(userId);
        }
    }

    // If still over limit, remove oldest entries
    if (walletCache.size > MAX_WALLET_CACHE_SIZE) {
        const entriesToDelete = walletCache.size - MAX_WALLET_CACHE_SIZE;
        const userIds = Array.from(walletCache.keys());
        for (let i = 0; i < entriesToDelete && i < userIds.length; i++) {
            walletCache.delete(userIds[i]);
        }
    }
}

// Run cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupWalletCache, 10 * 60 * 1000);
}

const getBlockchainId = (chain: string): string => {
    const map: Record<string, string> = {
        'arcTestnet': 'ARC-TESTNET',
        'arc': 'ARC-TESTNET',
        'arctestnet': 'ARC-TESTNET',
        'ethereumSepolia': 'ETH-SEPOLIA',
        'eth': 'ETH-SEPOLIA',
        'sepolia': 'ETH-SEPOLIA',
        'baseSepolia': 'BASE-SEPOLIA',
        'base': 'BASE-SEPOLIA',
        'arbitrumSepolia': 'ARB-SEPOLIA',
        'arb': 'ARB-SEPOLIA',
        'optimismSepolia': 'OP-SEPOLIA',
        'op': 'OP-SEPOLIA',
        'avalancheFuji': 'AVAX-FUJI',
        'avax': 'AVAX-FUJI',
        'polygonAmoy': 'MATIC-AMOY',
        'matic': 'MATIC-AMOY',
        'polygon': 'MATIC-AMOY'
    };
    return map[chain] || map[chain.toLowerCase()] || chain;
};

/**
 * Get or create a wallet for a specific user/session on a specific blockchain.
 * For PC-first development, use a fixed session ID like "dev_user_001".
 */
export async function getOrCreateWallet(userId: string, blockchain: string = 'arcTestnet'): Promise<{ walletId: string; address: string; accountType?: string }> {
    const blockchainId = getBlockchainId(blockchain);

    // Check cache first
    let userWallets = walletCache.get(userId);
    if (!userWallets) {
        userWallets = new Map();
        walletCache.set(userId, userWallets);
    }

    if (userWallets.has(blockchainId)) {
        return userWallets.get(blockchainId)!;
    }

    const client = getCircleClient();
    const walletSetId = await getOrCreateWalletSet();
    console.log(`[ServerWallet] Ensuring wallet exists for ${userId} on ${blockchainId}...`);

    // Generate idempotency key upfront (before any wallet creation attempts)
    const allChains = ['ARC-TESTNET', 'ETH-SEPOLIA', 'BASE-SEPOLIA'];
    const WALLET_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const setIdempotencyKey = uuidv5(`universal-wallet-${userId}-${allChains.join('-')}`, WALLET_NAMESPACE);

    // 1. Check if user already has a wallet on ANY blockchain (lookup by refId)
    let existingRefId: string | null = null;
    let foundWallets: any[] = [];
    try {
        // Query Circle directly by refId for efficiency and to avoid pagination issues
        const { data } = await client.listWallets({ walletSetId, refId: userId });
        foundWallets = data?.wallets?.filter((w: any) => w.accountType === 'SCA') || [];

        if (foundWallets.length > 0) {
            existingRefId = foundWallets[0].refId || userId;
            console.log(`[ServerWallet] User ${userId} already has SCA wallets. Found ${foundWallets.length}.`);

            // Map all found wallets to cache to avoid future API calls
            foundWallets.forEach((w: any) => {
                userWallets!.set(w.blockchain, {
                    walletId: w.id!,
                    address: w.address!,
                    accountType: 'SCA',
                    timestamp: Date.now()
                });
            });

            if (userWallets.has(blockchainId)) {
                return userWallets.get(blockchainId)!;
            }
        }
    } catch (e: any) {
        console.log('[ServerWallet] Error listing wallets:', e.message);
    }

    // 2. CRITICAL: To get the SAME address across EVM chains, we MUST create wallets 
    // in a SINGLE API call with multiple blockchains. Separate calls = separate addresses.
    console.log(`[ServerWallet] Creating UNIVERSAL SCA WALLET (same address across chains) for ${userId}...`);

    try {
        const { data: newWallets } = await client.createWallets({
            walletSetId,
            blockchains: allChains as any,
            accountType: 'SCA',
            count: 1,
            idempotencyKey: setIdempotencyKey,
            // CRITICAL: For multi-blockchain creation, pass a SINGLE metadata object, NOT an array!
            // This single metadata applies to all blockchains and ensures deterministic address derivation.
            metadata: [
                {
                    name: `AGENT-SCA-UNIVERSAL`,
                    refId: existingRefId || userId
                }
            ] as any,
        });

        if (!newWallets?.wallets || newWallets.wallets.length === 0) {
            throw new Error('Failed to create wallets - empty response');
        }

        // Map all created wallets to cache
        let requestedResult: any = null;
        newWallets.wallets.forEach((w: any) => {
            const result = {
                walletId: w.id!,
                address: w.address!,
                accountType: 'SCA',
                timestamp: Date.now()
            };
            userWallets!.set(w.blockchain, result);
            if (w.blockchain === blockchainId) requestedResult = result;
        });

        const universalAddress = newWallets.wallets[0].address;
        console.log(`[ServerWallet] ✅ Created ${newWallets.wallets.length} SCA wallets with UNIVERSAL address: ${universalAddress}`);

        // Verify all addresses match
        const addressSet = new Set(newWallets.wallets.map((w: any) => w.address));
        if (addressSet.size === 1) {
            console.log(`[ServerWallet] ✅ Address consistency verified across ${newWallets.wallets.length} chains`);
        } else {
            console.warn(`[ServerWallet] ⚠️ WARNING: Got ${addressSet.size} different addresses:`, Array.from(addressSet));
        }

        return requestedResult || userWallets.get(blockchainId)!;

    } catch (createError: any) {
        console.error(`[ServerWallet] Universal SCA creation error:`, createError.message);
        throw createError;
    }
}

/**
 * Execute a transaction autonomously using the server-controlled wallet.
 * This is the key function that enables the Agent to act without user interaction.
 */
export async function executeTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    tokenAddress?: string,
    blockchain: string = 'ARC-TESTNET'
): Promise<string> {
    const client = getCircleClient();
    const blockchainId = getBlockchainId(blockchain);

    // On Arc Testnet, USDC IS the native token but Circle SDK still needs the tokenAddress
    // as per official docs: https://developers.circle.com/wallets/dev-controlled/transfer-tokens-across-wallets
    const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000';
    const resolvedTokenAddress = tokenAddress || (blockchainId === 'ARC-TESTNET' ? ARC_TESTNET_USDC : undefined);

    console.log(`[ServerWallet] Executing transaction from wallet ${walletId} to ${toAddress}`);
    console.log(`[ServerWallet] Amount: ${amount}, Token: ${resolvedTokenAddress || 'Native'}, Chain: ${blockchainId}`);

    try {
        // Use Circle SDK directly — exactly as documented by Circle.
        // Gas Station sponsorship is automatic when policy is configured in Circle Console.
        // The SDK payload is identical to a non-sponsored transaction.
        const txResponse = await (client as any).createTransaction({
            walletId,
            blockchain: blockchainId,
            destinationAddress: toAddress,
            tokenAddress: resolvedTokenAddress,
            amount: [amount],
            fee: {
                type: 'level',
                config: {
                    feeLevel: 'MEDIUM'
                }
            },
            idempotencyKey: uuidv4()
        });

        const circleTxId = txResponse?.data?.id;
        const txState = txResponse?.data?.state;

        console.log(`[ServerWallet] Transaction created: ${circleTxId}, State: ${txState}. Polling for blockchain hash...`);

        // Poll for blockchain hash
        const terminalStates = new Set(['COMPLETE', 'FAILED', 'CANCELLED', 'DENIED']);
        let txHash: string | undefined;
        let currentState = txState;

        for (let i = 0; i < 20; i++) {
            if (terminalStates.has(currentState)) break;
            await new Promise(r => setTimeout(r, 3000));
            try {
                const { data: statusData } = await client.getTransaction({ id: circleTxId });
                const tx = (statusData as any)?.transaction || statusData;
                currentState = tx?.state ?? '';
                txHash = tx?.txHash;
                console.log(`[ServerWallet] Poll ${i + 1}: State=${currentState}, Hash=${txHash || 'pending'}`);
                if (currentState === 'COMPLETE' && txHash) {
                    console.log(`[ServerWallet] ✅ Transaction complete: ${txHash}`);
                    break;
                }
            } catch (pollErr) { /* ignore polling errors */ }
        }

        if (currentState === 'FAILED' || currentState === 'DENIED') {
            throw new Error(`Transaction ${circleTxId} ended in state: ${currentState}`);
        }

        if (txHash) return txHash;

        // Fallback: return Circle TX ID if hash not resolved yet
        console.warn(`[ServerWallet] Transaction ${circleTxId} created but hash not found yet.`);
        return circleTxId || '';

    } catch (error: any) {
        console.error(`[ServerWallet] Transaction error:`, error.message);
        throw error;
    }
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(txId: string): Promise<any> {
    const client = getCircleClient();
    try {
        const { data } = await client.getTransaction({ id: txId });
        return data?.transaction;
    } catch (error: any) {
        console.error(`[ServerWallet] Error getting transaction:`, error.message);
        throw error;
    }
}

/**
 * Execute a smart contract call
 */
export async function executeContractCall(
    walletId: string,
    contractAddress: string,
    functionSignature: string,
    parameters: any[],
    blockchain: string = 'ARC-TESTNET'
): Promise<{ success: boolean; txHash?: string; error?: string; circleTxId?: string; needsPolling?: boolean }> {
    const client = getCircleClient();
    const blockchainId = getBlockchainId(blockchain);

    console.log(`[ServerWallet] Executing contract call: ${functionSignature} on ${contractAddress}`);

    try {
        const txParams = {
            walletId,
            contractAddress,
            abiFunctionSignature: functionSignature,
            abiParameters: parameters,
            blockchain: blockchainId,
            feeLevel: 'MEDIUM', // REST API expects feeLevel as a direct string
            idempotencyKey: uuidv4()
        };
        const { data: txData } = await (client as any).createContractExecutionTransaction(txParams);

        const circleTxId = (txData as any)?.id || (txData as any)?.data?.id || (txData as any)?.data?.transaction?.id;
        if (!circleTxId) {
            console.error(`[ServerWallet] Full response from Circle:`, JSON.stringify(txData, null, 2));
            throw new Error('Failed to create transaction - no ID returned');
        }

        console.log(`[ServerWallet] Transaction created in Circle: ${circleTxId}. Polling for blockchain hash...`);

        // Poll for blockchain hash using Circle SDK (NOT a custom API endpoint)
        // This uses client.getTransaction which is the proper SDK method
        let txHash: string | undefined;
        for (let i = 0; i < 15; i++) {
            try {
                const { data: statusData } = await client.getTransaction({ id: circleTxId });
                txHash = (statusData as any)?.transaction?.txHash || (statusData as any)?.txHash;
                if (txHash && txHash.startsWith('0x')) {
                    console.log(`[ServerWallet] Blockchain Hash found after ${i + 1} attempts: ${txHash}`);
                    break;
                }
            } catch (pollErr) { /* ignore polling errors */ }
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!txHash || !txHash.startsWith('0x')) {
            throw new Error(`Transaction ${circleTxId} created but blockchain hash not found after 30 seconds. Please try again.`);
        }

        return {
            success: true,
            txHash: txHash,
            circleTxId
        };
    } catch (error: any) {
        console.error(`[ServerWallet] Contract call error:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Get wallet balance for a specific token
 */
export async function getWalletBalance(
    walletId: string,
    tokenAddress?: string
): Promise<string> {
    const client = getCircleClient();
    try {
        const { data } = await client.getWalletTokenBalance({
            id: walletId,
            tokenAddresses: tokenAddress ? [tokenAddress] : undefined
        });

        // SUPPORT BOTH FORMATS: Some SDK versions return .tokenBalance, others .tokenBalances array
        if ((data as any).tokenBalances && Array.isArray((data as any).tokenBalances)) {
            return (data as any).tokenBalances[0]?.amount || '0.00';
        }

        return (data as any).tokenBalance?.amount || '0.00';
    } catch (error: any) {
        console.error('[ServerWallet] Balance error:', error.message);
        return '0.00';
    }
}

/**
 * Get wallet transaction history
 */
export async function getWalletHistory(walletId: string): Promise<any[]> {
    try {
        const client = getCircleClient();

        // Fetch transactions where this wallet is involved
        const response: any = await client.listTransactions({
            walletIds: [walletId],
            pageSize: 20
        });

        if (response?.data?.transactions) {
            return response.data.transactions;
        }
        return [];
    } catch (error: any) {
        console.error('[ServerWallet] History error:', error.message);
        return [];
    }
}

const faucetCooldowns = new Map<string, number>();
const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 Hours
const MAX_FAUCET_CACHE_SIZE = 10000; // Maximum entries to prevent memory bloat

// Cleanup expired faucet cooldowns (entries older than 24h are useless)
function cleanupFaucetCooldowns(): void {
    const now = Date.now();
    const entries = Array.from(faucetCooldowns.entries());
    for (const [key, timestamp] of entries) {
        if (now - timestamp > FAUCET_COOLDOWN_MS) {
            faucetCooldowns.delete(key);
        }
    }

    // If still over limit, remove oldest entries
    if (faucetCooldowns.size > MAX_FAUCET_CACHE_SIZE) {
        const entriesToDelete = faucetCooldowns.size - MAX_FAUCET_CACHE_SIZE;
        const sortedEntries = Array.from(faucetCooldowns.entries())
            .sort((a, b) => a[1] - b[1]); // Sort by timestamp ascending
        for (let i = 0; i < entriesToDelete && i < sortedEntries.length; i++) {
            faucetCooldowns.delete(sortedEntries[i][0]);
        }
    }
}

// Run cleanup every hour
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupFaucetCooldowns, 60 * 60 * 1000);
}

/**
 * Request testnet tokens (USDC or Native) from Circle Faucet
 * Note: ARC-TESTNET only supports USDC (no native token option)
 */
export async function requestTestnetTokens(
    userId: string,
    address: string,
    blockchain: string = 'ARC-TESTNET',
    usdc: boolean = true,
    native: boolean = true
): Promise<{ success: boolean; error?: string; data?: any; message?: string }> {
    const client = getCircleClient();
    const blockchainId = getBlockchainId(blockchain);

    // RATE LIMIT CHECK
    const rateLimitKey = `${userId}-${blockchainId}`;
    const lastRequest = faucetCooldowns.get(rateLimitKey);
    const now = Date.now();

    if (lastRequest && (now - lastRequest < FAUCET_COOLDOWN_MS)) {
        const remainingHours = Math.ceil((FAUCET_COOLDOWN_MS - (now - lastRequest)) / (60 * 60 * 1000));
        return {
            success: false,
            error: `⏳ Faucet Cooldown: You can only request funds once every 24 hours per network.\nWait ${remainingHours}h before requesting on ${blockchainId} again.`
        };
    }

    // ARC-TESTNET only supports USDC (native is also USDC on Arc)
    // For EVM chains (Sepolia, Base, etc.): ETH is the native gas token
    // CRITICAL: Request NATIVE first (ETH for gas), then USDC
    const isArcTestnet = blockchainId === 'ARC-TESTNET';

    // For EVM testnets, we need ETH for gas transactions
    // Priority: Native (ETH) > USDC
    const requestNative = isArcTestnet ? false : true;  // Always request native for EVM
    const requestUsdc = true;  // Always request USDC

    console.log(`[ServerWallet] Requesting Faucet for ${address} (${userId}) on ${blockchainId}`);
    console.log(`[ServerWallet] Chain type: ${isArcTestnet ? 'ARC (USDC as gas)' : 'EVM (ETH as gas)'}`);
    console.log(`[ServerWallet] Requesting - Native: ${requestNative}, USDC: ${requestUsdc}`);

    try {
        // CRITICAL: For EVM chains, request NATIVE (ETH) first for gas
        // Circle API may not support requesting both at once reliably
        let responses: any[] = [];
        const errorMessages: string[] = [];

        if (requestNative && !isArcTestnet) {
            console.log(`[ServerWallet] Step 1: Requesting NATIVE token (ETH) for gas...`);
            try {
                // @ts-ignore
                const nativeResponse = await client.requestTestnetTokens({
                    address,
                    blockchain: blockchainId as any,
                    native: true,
                    usdc: false  // Only native first
                });
                responses.push({ type: 'native', response: nativeResponse });
                console.log(`[ServerWallet] ✅ Native request sent`);
            } catch (nativeError: any) {
                console.error(`[ServerWallet] ⚠️ Native request failed:`, nativeError.message);
                if (nativeError?.response?.data) console.error(JSON.stringify(nativeError.response.data));
                errorMessages.push(`Native (ETH): ${nativeError.message}`);
                // Continue with USDC request even if native fails
            }
        }

        if (requestUsdc) {
            console.log(`[ServerWallet] Step 2: Requesting USDC...`);
            try {
                // For ARC-TESTNET, USDC is often the Native token. Circle API sometimes returns 403 Forbidden 
                // if we explicitly ask for 'usdc: true' on networks where it's native. 
                // The correct parameter layout for ARC-TESTNET might be just native: true, usdc: false.
                const paramConfig = isArcTestnet
                    ? { address, blockchain: blockchainId as any, native: true, usdc: false }
                    : { address, blockchain: blockchainId as any, native: false, usdc: true };

                // @ts-ignore
                const usdcResponse = await client.requestTestnetTokens(paramConfig);
                responses.push({ type: 'usdc', response: usdcResponse });
                console.log(`[ServerWallet] ✅ USDC request sent`);
            } catch (usdcError: any) {
                console.error(`[ServerWallet] ⚠️ USDC request failed:`, usdcError.message);
                if (usdcError?.response?.data) console.error(JSON.stringify(usdcError.response.data));
                errorMessages.push(`USDC: ${usdcError.message}`);
            }
        }

        // Check if at least one request succeeded
        if (responses.length === 0) {
            // Check if all errors are rate limits
            const allRateLimited = errorMessages.every(msg =>
                msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('429') || msg.toLowerCase().includes('forbidden')
            );

            if (allRateLimited) {
                return {
                    success: false,
                    error: `⏳ Faucet Request Rejected for ${blockchainId}.\n\n` +
                        `This might be a rate limit or a network restriction. Please try:\n` +
                        `1. Wait 1-2 hours and try again\n` +
                        `2. Use the manual faucet: https://faucet.circle.com\n`
                };
            }

            return {
                success: false,
                error: `Faucet requests failed:\n${errorMessages.join('\n')}\n\n` +
                    `Try the manual faucet: https://faucet.circle.com`
            };
        }

        // Use the last successful response for the return data
        const lastResponse = responses[responses.length - 1].response;

        // Cast response to any to handle Circle SDK's complex return type
        const responseData = lastResponse as any;

        // Safe logging - avoid circular structure errors
        try {
            console.log(`[ServerWallet] 🔍 Response data:`, JSON.stringify(responseData?.data, null, 2));
        } catch (e) {
            console.log(`[ServerWallet] 🔍 Response received (cannot stringify due to circular refs)`);
        }

        // Check if Circle actually processed the request
        const txHash = responseData?.data?.transaction?.txHash || responseData?.data?.txHash;
        const txStatus = responseData?.data?.transaction?.state || responseData?.data?.state;

        console.log(`[ServerWallet] 🔍 Transaction Hash: ${txHash || 'NOT PROVIDED'}`);
        console.log(`[ServerWallet] 🔍 Transaction State: ${txStatus || 'UNKNOWN'}`);

        // Build success message based on what was requested
        const requestedTypes = responses.map(r => r.type).join(' + ');
        const successMessage = isArcTestnet
            ? `✅ Faucet successful! USDC tokens sent to your Arc wallet.`
            : `✅ Faucet successful! ETH (gas) and USDC tokens sent to your wallet on ${blockchainId}.`;

        faucetCooldowns.set(rateLimitKey, now);

        // Return more detailed info to the user
        return {
            success: true,
            data: responseData?.data,
            message: txHash
                ? `${successMessage}\nTX: ${txHash}\nTokens should arrive in 1-5 minutes.`
                : `${successMessage}\nTokens should arrive in 1-5 minutes.`
        };
    } catch (error: any) {
        console.error(`[ServerWallet] Faucet error:`, error.message);

        // Log detailed Circle error
        if (error.response?.data) {
            console.error(`[ServerWallet] Circle API Error Details:`, JSON.stringify(error.response.data, null, 2));
        }

        if (error.message?.includes("429")) {
            return { success: false, error: "Circle Faucet is busy (Rate Limit). Try again later." };
        }

        let finalError = error.message;
        if (error.response?.data) {
            finalError += ` | Details: ${JSON.stringify(error.response.data)}`;
        }

        return { success: false, error: finalError };
    }
}