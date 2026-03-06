import { z } from "zod";
import { ToolResult, AgentContext } from "../../types";
import { createPublicClient, http, parseUnits, formatUnits } from "viem";
import { arcTestnet } from "@/lib/wallet-sdk";
import { sepolia, baseSepolia } from "viem/chains";
import {
    SWAP_CONFIG,
    SWAP_LIMITS,
    UNISWAP_V2_ROUTER_ABI,
    ERC20_ABI,
    resolveToken,
    resolveSwapChain,
    SupportedSwapChain
} from "./swapConfig";

/**
 * Token Swap Skill
 * Simplified version: Buy token X on chain Y using Uniswap V2
 */
export const SwapSkill = {
    /**
     * Execute a token swap
     */
    swap: async (
        fromToken: string,
        toToken: string,
        amount: string,
        context: AgentContext,
        maxSlippage?: number,
        chain?: string
    ): Promise<ToolResult> => {
        try {
            console.log(`[SwapSkill] Swap request: ${amount} ${fromToken} → ${toToken} on ${chain || 'arc'}`);

            if (!amount || amount === 'undefined') {
                return {
                    success: false,
                    message: "Error: Amount is required for a swap. Please specify how much you want to swap."
                };
            }

            // 1. Resolve chain
            const chainKey = resolveSwapChain(chain);
            const config = SWAP_CONFIG[chainKey];

            // 2. Resolve tokens
            const fromAddress = resolveToken(fromToken, chainKey);
            const toAddress = resolveToken(toToken, chainKey);

            const availableTokens = Object.keys(config.tokens).join(', ');

            if (!fromAddress) {
                return {
                    success: false,
                    message: `Token "${fromToken}" not found on ${config.name}. Available tokens: ${availableTokens}. Please use the symbol, not the address.`
                };
            }
            if (!toAddress) {
                return {
                    success: false,
                    message: `Token "${toToken}" not found on ${config.name}. Available tokens: ${availableTokens}. Please use the symbol, not the address.`
                };
            }

            // 3. Check if router is configured
            if (config.router === '0x0000000000000000000000000000000000000000') {
                return {
                    success: false,
                    message: `Swap not available on ${config.name} yet. DEX router not configured.`
                };
            }

            // 4. Get user wallet
            const userId = context.userId;
            if (!userId) {
                return { success: false, message: 'Missing userId in context' };
            }

            const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
            const walletResp = await fetch(`${baseUrl}/api/wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getOrCreateWallet', userId, blockchain: chainKey }),
            });
            const { walletId, address: userAddress } = await walletResp.json();

            // 5. Setup public client
            const viemChain = chainKey === 'arcTestnet'
                ? arcTestnet
                : chainKey === 'ethereumSepolia'
                    ? sepolia
                    : baseSepolia;

            const publicClient = createPublicClient({
                chain: viemChain,
                transport: http()
            });

            // 6. Get token decimals
            const fromDecimals = await publicClient.readContract({
                address: fromAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'decimals'
            }) as number;

            const amountIn = parseUnits(amount, fromDecimals);

            // 7. Get quote from router
            const path = [fromAddress, toAddress];
            let amountsOut: bigint[];

            try {
                amountsOut = await publicClient.readContract({
                    address: config.router as `0x${string}`,
                    abi: UNISWAP_V2_ROUTER_ABI,
                    functionName: 'getAmountsOut',
                    args: [amountIn, path as `0x${string}`[]]
                }) as bigint[];
            } catch (e: any) {
                return {
                    success: false,
                    message: `No liquidity pool found for ${fromToken}/${toToken} on ${config.name}`
                };
            }

            const expectedOut = amountsOut[1];
            const toDecimals = await publicClient.readContract({
                address: toAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'decimals'
            }) as number;

            // 8. Calculate slippage protection
            const slippage = maxSlippage || SWAP_LIMITS.DEFAULT_SLIPPAGE_PERCENT;
            if (slippage > SWAP_LIMITS.MAX_SLIPPAGE_PERCENT) {
                return {
                    success: false,
                    message: `Slippage ${slippage}% exceeds maximum allowed ${SWAP_LIMITS.MAX_SLIPPAGE_PERCENT}%`
                };
            }

            const minOut = (expectedOut * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000);

            // 9. Check balance
            const balance = await publicClient.readContract({
                address: fromAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [userAddress]
            }) as bigint;

            if (balance < amountIn) {
                return {
                    success: false,
                    message: `Insufficient ${fromToken} balance. Have: ${formatUnits(balance, fromDecimals)}, Need: ${amount}`
                };
            }

            // 10. Check allowance
            const allowance = await publicClient.readContract({
                address: fromAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [userAddress as `0x${string}`, config.router as `0x${string}`]
            }) as bigint;

            // 11. Approve if needed
            if (allowance < amountIn) {
                console.log(`[SwapSkill] Approving ${fromToken} for router...`);
                // ensure baseUrl is defined in scope or redefined

                const approveResp = await fetch(`${baseUrl}/api/wallet`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'executeContractCall',
                        userId,
                        walletId,
                        contractAddress: fromAddress,
                        functionSignature: 'approve(address,uint256)',
                        parameters: [config.router, amountIn.toString()],
                        blockchain: chainKey
                    }),
                });
                const approveResult = await approveResp.json();
                if (!approveResult.success) {
                    return { success: false, message: `Approval failed: ${approveResult.error}` };
                }
                console.log(`[SwapSkill] Approval successful: ${approveResult.txHash}`);
            }

            // 12. Execute swap
            const deadline = Math.floor(Date.now() / 1000) + (SWAP_LIMITS.DEADLINE_MINUTES * 60);

            console.log(`[SwapSkill] Executing swap...`);
            console.log(`  Path: ${fromToken} → ${toToken}`);
            console.log(`  Amount In: ${amount} ${fromToken}`);
            console.log(`  Expected Out: ${formatUnits(expectedOut, toDecimals)} ${toToken}`);
            console.log(`  Min Out: ${formatUnits(minOut, toDecimals)} ${toToken}`);
            console.log(`  Slippage: ${slippage}%`);


            const swapResp = await fetch(`${baseUrl}/api/wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'executeContractCall',
                    userId,
                    walletId,
                    contractAddress: config.router,
                    functionSignature: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
                    parameters: [
                        amountIn.toString(),
                        minOut.toString(),
                        path,
                        userAddress,
                        deadline.toString()
                    ],
                    blockchain: chainKey
                }),
            });

            const swapResult = await swapResp.json();
            if (!swapResult.success) {
                return { success: false, message: `Swap failed: ${swapResult.error}` };
            }

            return {
                success: true,
                message: `✅ Swap Successful! Swapped ${amount} ${fromToken} for ~${formatUnits(expectedOut, toDecimals)} ${toToken} on ${config.name}.\n🔗 TX: [${swapResult.txHash.substring(0, 8)}...](${config.explorer}/tx/${swapResult.txHash})`,
                data: {
                    txHash: swapResult.txHash,
                    explorer: `${config.explorer}/tx/${swapResult.txHash}`,
                    amountIn: amount,
                    expectedOut: formatUnits(expectedOut, toDecimals),
                    minOut: formatUnits(minOut, toDecimals),
                    slippage: slippage
                },
                action: "tx_link"
            };

        } catch (error: any) {
            console.error('[SwapSkill] Error:', error);
            return { success: false, message: `Swap failed: ${error.message}` };
        }
    },

    /**
     * Get a quote without executing
     */
    getQuote: async (
        fromToken: string,
        toToken: string,
        amount: string,
        chain?: string
    ): Promise<ToolResult> => {
        try {
            const chainKey = resolveSwapChain(chain);
            const config = SWAP_CONFIG[chainKey];

            const fromAddress = resolveToken(fromToken, chainKey);
            const toAddress = resolveToken(toToken, chainKey);

            if (!fromAddress || !toAddress) {
                const available = Object.keys(config.tokens).join(', ');
                return {
                    success: false,
                    message: `Token not found on ${config.name}. Available symbols: ${available}. Use symbols, not addresses.`
                };
            }

            if (config.router === '0x0000000000000000000000000000000000000000') {
                return { success: false, message: `Swap not available on ${config.name}` };
            }

            const viemChain = chainKey === 'arcTestnet'
                ? arcTestnet
                : chainKey === 'ethereumSepolia'
                    ? sepolia
                    : baseSepolia;

            const publicClient = createPublicClient({
                chain: viemChain,
                transport: http()
            });

            const fromDecimals = await publicClient.readContract({
                address: fromAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'decimals'
            }) as number;

            const toDecimals = await publicClient.readContract({
                address: toAddress as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'decimals'
            }) as number;

            const amountIn = parseUnits(amount, fromDecimals);
            const path = [fromAddress, toAddress];

            const amountsOut = await publicClient.readContract({
                address: config.router as `0x${string}`,
                abi: UNISWAP_V2_ROUTER_ABI,
                functionName: 'getAmountsOut',
                args: [amountIn, path as `0x${string}`[]]
            }) as bigint[];

            const expectedOut = formatUnits(amountsOut[1], toDecimals);

            return {
                success: true,
                message: `Quote: ${amount} ${fromToken} = ~${expectedOut} ${toToken} on ${config.name}`,
                data: {
                    amountIn: amount,
                    expectedOut,
                    route: `${fromToken} → ${toToken}`,
                    chain: config.name
                }
            };

        } catch (error: any) {
            return { success: false, message: `Quote failed: ${error.message}` };
        }
    }
};
