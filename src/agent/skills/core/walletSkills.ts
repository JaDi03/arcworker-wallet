
import { sendTransfer } from "@/lib/wallet-sdk";
import { ToolResult, AgentContext } from "../../types";

export const WalletSkills = {
    /**
     * Get Address Balance (Defaults to All Chains)
     * CRITICAL: Uses direct imports instead of HTTP loopback to avoid ECONNREFUSED on Vercel.
     */
    getBalance: async (context: AgentContext, chain?: string, tokenSymbol?: string): Promise<ToolResult> => {
        try {
            console.log(`[WalletSkills] getBalance called for userId: ${context.userId}, chain: ${chain}, token: ${tokenSymbol}`);

            // Direct imports - no HTTP loopback (ECONNREFUSED on Vercel serverless)
            const { getOrCreateWallet } = await import('@/lib/serverWallet');
            const { getAllTokenBalances } = await import('@/lib/tokenDetection');
            const { resolveChainKey } = await import('../cross-chain/bridgeSkill');

            const targetChains: Array<'arcTestnet' | 'ethereumSepolia' | 'baseSepolia'> = chain
                ? [resolveChainKey(chain) as 'arcTestnet' | 'ethereumSepolia' | 'baseSepolia']
                : ['arcTestnet', 'ethereumSepolia', 'baseSepolia'];

            // Get the wallet address for this user
            const wallet = await getOrCreateWallet(context.userId || '', 'arcTestnet');
            console.log(`[WalletSkills] Fetching balances for address: ${wallet.address}`);

            const tokenBalances = await getAllTokenBalances(wallet.address, targetChains, tokenSymbol);
            console.log(`[WalletSkills] Token balances found: ${tokenBalances.length}`);

            if (tokenBalances.length === 0) {
                return {
                    success: true,
                    message: chain
                        ? `You don't have any supported tokens on ${chain}.`
                        : "Your wallet is currently empty across all supported chains (Arc, Base, Sepolia)."
                };
            }

            if (!chain) {
                // Multi-chain Portfolio view
                const report = tokenBalances.map((t: any) => `- ${t.balance} ${t.symbol} on ${t.chain}`).join('\n');
                return {
                    success: true,
                    message: `Here is your current portfolio:\n${report}`,
                    data: tokenBalances
                };
            }

            // Specific chain balance
            const report = tokenBalances.map((t: any) => `${t.balance} ${t.symbol}`).join(', ');
            return {
                success: true,
                message: `Your balance on ${chain} is: ${report}.`,
                data: tokenBalances
            };
        } catch (e: any) {
            console.error(`[WalletSkills] getBalance Failed:`, e);
            return { success: false, message: `Failed to fetch balance: ${e.message}` };
        }
    },

    /**
     * Send Funds (Prioritizing Arc Native Hub)
     */
    transfer: async (to: string, amount: string, context: AgentContext, chain?: string): Promise<ToolResult> => {
        if (!to.startsWith("0x") || to.length !== 42) {
            return { success: false, message: "Invalid address format." };
        }

        try {
            const { resolveChainKey } = await import("../cross-chain/bridgeSkill");
            const { CCTP_CONFIG } = await import("../cross-chain/config");

            const chainKey = (chain ? resolveChainKey(chain) : 'arcTestnet') || 'arcTestnet';

            console.log(`[WalletSkills] Executing Transfer: ${amount} USDC -> ${to} on ${chainKey}`);

            try {
                // 1. Get Wallet
                const { getOrCreateWallet, executeTransaction } = await import("@/lib/serverWallet");
                const wallet = await getOrCreateWallet(context.userId || '', chainKey || 'arcTestnet');

                // 2. Get USDC Address (if not native Arc)
                let tokenAddress: string | undefined;
                if (chainKey !== 'arcTestnet') {
                    const usdcAddresses: Record<string, string> = {
                        'ethereumSepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
                        'baseSepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                        'arbitrumSepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
                        'optimismSepolia': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
                        'avalancheFuji': '0x5425890298aed601595a70AB815c96711a31Bc65',
                        'polygonAmoy': '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'
                    };
                    tokenAddress = usdcAddresses[chainKey];
                }

                // 3. Execute
                const resultId = await executeTransaction(wallet.walletId, to, amount, tokenAddress, chainKey);

                const explorer = (CCTP_CONFIG as any)[chainKey]?.explorer || 'https://explorer-testnet.arc.circle.com';
                const isHash = resultId.startsWith('0x');
                const label = isHash ? 'Hash' : 'Request ID (Pending)';
                const explorerLink = isHash ? `${explorer}/tx/${resultId}` : undefined;

                return {
                    success: true,
                    message: `✅ Transfer Sent! ${label}: ${resultId}`,
                    data: {
                        hash: resultId,
                        explorer: explorerLink,
                        isPending: !isHash
                    },
                    action: "tx_link"
                };

            } catch (serverError: any) {
                console.error("Server Transfer Failed:", serverError);
                throw serverError;
            }

        } catch (e: any) {
            console.error(e);
            return { success: false, message: `Transfer failed on Arc/Extension: ${e.message || "Unknown error"}` };
        }
    },

    /**
     * Faucet Request (Multi-chain)
     * CRITICAL: Uses direct imports instead of HTTP loopback to avoid ECONNREFUSED on Vercel.
     */
    requestFaucet: async (context: AgentContext, chain?: string): Promise<ToolResult> => {
        const targetChain = chain || 'arcTestnet';
        console.log(`[WalletSkills] Requesting Faucet for ${context.userId} on ${targetChain}`);

        try {
            // Direct imports - avoid HTTP loopback (fails on Vercel serverless)
            const { getOrCreateWallet, requestTestnetTokens } = await import('@/lib/serverWallet');

            // Get or create wallet for the specific chain
            const wallet = await getOrCreateWallet(context.userId || '', targetChain);
            const faucetAddress = wallet.address;
            console.log(`[WalletSkills] Using wallet address ${faucetAddress} on ${targetChain}`);

            const result = await requestTestnetTokens(context.userId || '', faucetAddress, targetChain);

            if (result.success) {
                const txInfo = result.message || '';
                return {
                    success: true,
                    message: `✅ Faucet Request Submitted!\n${txInfo}\n\nNetwork: ${targetChain}\nAddress: ${faucetAddress}\n\nTokens typically arrive in 1-5 minutes. Check your balance shortly.`,
                    data: result
                };
            } else {
                throw new Error((result as any).error || 'Unknown error');
            }

        } catch (e: any) {
            console.error(`[WalletSkills] Faucet failed:`, e);

            if (e.message?.includes("⏳ Faucet Cooldown")) {
                return {
                    success: false,
                    message: e.message,
                    action: "faucet_card"
                };
            }

            return {
                success: false,
                message: `⚠️ Auto-Faucet failed: ${e.message}.\n\nYou can try manually at the official faucet:`,
                data: { url: "https://faucet.circle.com", address: context.userAddress },
                action: "faucet_card"
            };
        }
    }
};
