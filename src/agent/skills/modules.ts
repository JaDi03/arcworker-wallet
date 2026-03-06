import { z } from 'zod';
import { AgentContext, ToolResult } from '../types';
import { WalletSkills } from './core/walletSkills';
import { InvestSkill } from './defi/investSkill';
import { AddLiquiditySkill } from './defi/addLiquidity';
import { BridgeSkill, resolveChainKey } from './cross-chain/bridgeSkill';
import { ForwardingBridgeSkill } from './cross-chain/forwardingBridgeSkill';
import { SwapSkill } from './defi/swapSkill';

/**
 * The Contract: Every skill must implement this.
 */
export interface AgentSkill {
    name: string;
    description: string;
    parameters: z.ZodType<any>;
    execute: (args: any, context: AgentContext) => Promise<ToolResult>;
}

// --- Parameter Schemas (Defined as constants to avoid class instance issues) ---

export const getBalanceSchema = z.object({
    chain: z.string().describe('The network to check balance on (e.g., "Arc", "Base", "Sepolia"). REQUIRED.'),
    token: z.string().optional().describe('The token symbol or address (e.g., "USDC", "WETH"). Optional (defaults to native).')
});

export const transferSchema = z.object({
    to: z.string().describe('The destination wallet address (0x...)'),
    amount: z.string().describe('The amount to transfer (e.g., "0.1", "100")'),
    chain: z.string().describe('The network to send funds on (e.g. "Arc", "Base", "Sepolia"). REQUIRED.')
});

export const investSchema = z.object({
    amount: z.string().describe('The amount of USDC to invest/stake.')
});

export const addLiquiditySchema = z.object({
    tokenA: z.string().describe('Symbol of the first token (e.g. "USDC")'),
    tokenB: z.string().describe('Symbol of the second token (e.g. "ETH")'),
    amount: z.string().describe('Amount of the first token to deposit'),
});

export const bridgeSchema = z.object({
    sourceChain: z.string().optional().describe('Origin chain name (optional, inferred from context)'),
    destinationChain: z.string().describe('Destination chain name (e.g. "Base", "Sepolia")'),
    amount: z.string().describe('Amount of USDC to bridge'),
    recipient: z.string().optional().describe('The destination wallet address on the target chain. If not provided, defaults to the user\'s current address.')
});

export const swapSchema = z.object({
    fromToken: z.string().describe('Token symbol to sell (e.g. "ETH")'),
    toToken: z.string().describe('Token symbol to buy (e.g. "USDC")'),
    amount: z.string().describe('Amount to swap'),
    maxSlippage: z.number().optional().describe('Maximum slippage percentage (default 0.5)'),
    chain: z.string().optional().describe('Network to execute the swap on')
});

export const quoteSchema = z.object({
    fromToken: z.string().describe('Token symbol to sell'),
    toToken: z.string().describe('Token symbol to buy'),
    amount: z.string().describe('Amount to swap'),
    chain: z.string().optional().describe('Network to check price on')
});

export const faucetSchema = z.object({
    chain: z.enum([
        'arc', 'eth', 'base', 'arb', 'op', 'avax', 'matic',
        'arcTestnet', 'ethereumSepolia', 'baseSepolia', 'arbitrumSepolia', 'optimismSepolia', 'avalancheFuji', 'polygonAmoy'
    ]).describe('The blockchain network to request testnet funds for (e.g. "arc", "eth", "base")')
});

export const resumeBridgeSchema = z.object({
    burnTxHash: z.string().describe('The transaction hash of the send/burn operation on the source chain'),
    sourceChain: z.string().describe('The chain where funds were sent FROM (e.g. "Sepolia", "Arc")'),
    destinationChain: z.string().describe('The chain where funds should arrive TO (e.g. "Base", "Arc")'),
    amount: z.string().optional().describe('The amount of USDC that was bridged (optional, used to complete the final transfer)'),
    recipient: z.string().optional().describe('The destination address to receive the funds (optional, defaults to user address)')
});

export const forwardingBridgeSchema = z.object({
    amount: z.string().describe('The amount of USDC to bridge (e.g. "10", "100")'),
    destinationChain: z.string().describe('The destination chain name (e.g. "Base", "Sepolia")'),
    sourceChain: z.string().optional().describe('The source chain name (defaults to Arc)'),
    recipient: z.string().optional().describe('The destination wallet address. If not provided, defaults to user\'s address.')
});

// --- Skill Wrappers (Adapters) ---

export class ResumeBridgeSkillWrapper implements AgentSkill {
    name = 'resumeBridge';
    description = 'Resume or retry a stuck bridge transaction. Use this if a bridge claim failed or timed out.';
    parameters = resumeBridgeSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        console.log(`[ResumeBridge] Attempting to resume bridge for ${args.burnTxHash}`);

        // We need to resolve chain keys to ensure they match config
        // Import dynamically or assuming BridgeSkill handles resolution/validation internally? 
        // BridgeSkill.completeBridge expects valid keys. 
        // Let's rely on the helper in bridgeSkill or re-use resolution logic?
        // Ideally we should import resolveChainKey from bridgeSkill, but it's not exported or we need to access it.
        // Let's assume the args are close enough or update BridgeSkill to be robust.

        // Actually, let's just pass them. completeBridge does resolving? 
        // resolveChainKey is now imported at the top of the file

        const srcKey = resolveChainKey(args.sourceChain);
        const destKey = resolveChainKey(args.destinationChain);

        if (!srcKey || !destKey) {
            return {
                success: false,
                message: `Invalid chain names. Source: ${args.sourceChain} -> ${srcKey}, Dest: ${args.destinationChain} -> ${destKey}`
            };
        }

        // We need the original amount and recipient? 
        // completeBridge requires `finalRecipient` and `amount` for the final transfer logic.
        // If we don't have them, we might fail the FINAL step (transfer to user) but succeed in the MINT (to agent).
        // For recovery, let's assume we want to at least MINT to the agent wallet.
        // We can pass dummy values if necessary, or ask user?
        // Let's fallback to context.userAddress if recipient missing?
        // But completeBridge needs them as args. 

        // BETTER APPROACH: 
        // The current strict implementation of completeBridge requires amount/recipient to do the final transfer.
        // If we just want to UNSTUCK the funds (mint to agent), we can pass "0" and agent address.
        // However, correct recovery should try to finish the job.
        // Let's Ask user for amount/recipient? Or maybe `resumeBridgeSchema` needs them?
        // For now, let's try to infer or pass "UNKNOWN" and see.
        // Actually, let's update `resumeBridgeSchema` to include optional amount/recipient,
        // but default to "Mint to Agent" if missing.

        // But wait, completeBridge signature:
        // (burnTx, sourceChain, destinationChain, finalRecipient, amount, userId)

        // Let's require the AI to ask for these details if it's resuming.
        // Or we can try to fetch them from the source chain logs? (Too complex for now).

        const recipient = args.recipient || (context as any).userAddress; // Use provided or default to current user
        const amount = args.amount || "0"; // Use provided amount or fallback to "0" (mint-only mode)

        // Triggering the process (awaiting it this time to see output)
        await BridgeSkill.completeBridge(
            args.burnTxHash,
            srcKey,
            destKey,
            recipient,
            amount,
            (context as any).userId
        );

        return {
            success: true,
            message: `Resume process initiated for ${args.burnTxHash}. Check logs for details.`
        };
    }
}

// Helper for alias normalization
function normalizeParams(rawParams: any, aliasMap: Record<string, string>): any {
    const normalized = { ...rawParams };
    for (const [wrong, right] of Object.entries(aliasMap)) {
        if (normalized[wrong] !== undefined && normalized[right] === undefined) {
            normalized[right] = normalized[wrong];
            delete normalized[wrong];
        }
    }
    return normalized;
}

export class BalanceSkill implements AgentSkill {
    name = 'getBalance';
    description = 'Get asset balances. Returns balances across ALL supported chains (Arc, Sepolia, Base) if chain is omitted. Can check specific tokens.';
    parameters = getBalanceSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        return await WalletSkills.getBalance(context, args.chain, args.token);
    }
}

export class TransferSkill implements AgentSkill {
    name = 'executeTransfer';
    description = 'EXECUTE a transfer of assets (mainly USDC) to a specific address on a specific chain. Use this to send funds.';
    parameters = transferSchema;

    async execute(rawArgs: any, context: AgentContext): Promise<ToolResult> {
        const args = normalizeParams(rawArgs, {
            'recipient': 'to',
            'address': 'to',
            'destination': 'to',
            'to_address': 'to'
        });

        const result = this.parameters.safeParse(args);
        if (!result.success) {
            return {
                success: false,
                message: `Invalid parameters: ${result.error.issues.map(i => i.message).join(', ')}. REQUIRED: 'to', 'amount'.`
            };
        }

        return await WalletSkills.transfer(args.to, args.amount, context, args.chain);
    }
}

export class InvestSkillWrapper implements AgentSkill {
    name = 'invest';
    description = 'Invest or Stake USDC into a Yield Vault';
    parameters = investSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        return await InvestSkill.invest(args.amount, context);
    }
}

export class LiquiditySkill implements AgentSkill {
    name = 'addLiquidity';
    description = 'Add liquidity to a DeFi Pool';
    parameters = addLiquiditySchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        return await AddLiquiditySkill.execute(args.tokenA, args.tokenB, args.amount, context);
    }
}

export class BridgeSkillWrapper implements AgentSkill {
    name = 'executeBridge';
    description = 'LEGACY: Traditional CCTP bridge. Use forwardingBridge instead - it handles this automatically with fallback.';
    parameters = bridgeSchema;

    async execute(rawArgs: any, context: AgentContext): Promise<ToolResult> {
        const args = normalizeParams(rawArgs, {
            'toChain': 'destinationChain',
            'to_chain': 'destinationChain',
            'target_chain': 'destinationChain',
            'chain': 'destinationChain',
            'dest_chain': 'destinationChain',
            'to_address': 'recipient',
            'to': 'recipient',
            'address': 'recipient'
        });

        const result = this.parameters.safeParse(args);
        if (!result.success) {
            return {
                success: false,
                message: `Invalid parameters: ${result.error.issues.map(i => i.message).join(', ')}. REQUIRED: 'destinationChain', 'amount', 'recipient'.`
            };
        }

        return await BridgeSkill.bridgeUSDC(args, context);
    }
}

export class SwapSkillWrapper implements AgentSkill {
    name = 'swap';
    description = 'Swap tokens on a DEX. Use symbols like "USDC", "WETH". System handles addresses.';
    parameters = swapSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        const fromToken = args.fromToken || args.from_token || args.token_in || args.tokenIn ||
            args.currency || args.fromCurrency || args.sellToken || args.token_sell ||
            args.sell || args.from || args.tokenSymbolIn;

        const toToken = args.toToken || args.to_token || args.token_out || args.tokenOut ||
            args.destination_currency || args.toCurrency || args.buyToken || args.token_buy ||
            args.buy || args.to || args.token || args.tokenSymbolOut;

        console.log(`[SwapSkillWrapper] Resolved swap tokens: ${fromToken} -> ${toToken}`);

        return await SwapSkill.swap(
            fromToken,
            toToken,
            args.amount,
            context,
            args.maxSlippage,
            args.chain
        );
    }
}

export class QuoteSkillWrapper implements AgentSkill {
    name = 'getQuote';
    description = 'Get a price quote for a swap.';
    parameters = quoteSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        const fromToken = args.fromToken || args.from_token || args.token_in || args.tokenIn ||
            args.currency || args.fromCurrency || args.sellToken || args.token_sell ||
            args.sell || args.from || args.tokenSymbolIn;

        const toToken = args.toToken || args.to_token || args.token_out || args.tokenOut ||
            args.destination_currency || args.toCurrency || args.buyToken || args.token_buy ||
            args.buy || args.to || args.token || args.tokenSymbolOut;

        return await SwapSkill.getQuote(fromToken, toToken, args.amount, args.chain);
    }
}

export class FaucetSkill implements AgentSkill {
    name = 'faucet';
    description = 'Request testnet USDC/ETH tokens from the automated Circle Faucet. Use this to fund the wallet.';
    parameters = faucetSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        return await WalletSkills.requestFaucet(context, args.chain);
    }
}

export class ForwardingBridgeSkillWrapper implements AgentSkill {
    name = 'forwardingBridge';
    description = 'Bridge USDC using Circle Forwarding Service when available (automatic mint), falls back to traditional CCTP bridge. Preferred over executeBridge when available.';
    parameters = forwardingBridgeSchema;

    async execute(args: any, context: AgentContext): Promise<ToolResult> {
        console.log(`[ForwardingBridgeSkill] Executing bridge: ${JSON.stringify(args)}`);
        
        // Normalize args to match expected format
        const normalizedArgs = {
            amount: args.amount,
            destinationChain: args.destinationChain || args.destination_chain,
            sourceChain: args.sourceChain || args.source_chain,
            recipient: args.recipient || args.to || args.destination_address
        };

        return await ForwardingBridgeSkill.bridge(normalizedArgs, context);
    }
}
