import { ToolResult, AgentContext } from "../../types";

/**
 * Composite Skill: Add Liquidity
 *
 * NOTE: This skill is currently disabled — no real DEX/AMM pool is deployed on Arc Testnet.
 * To enable, replace the mock pool addresses with real deployed contracts and implement
 * the actual approve + addLiquidity flow.
 */
export const AddLiquiditySkill = {
    execute: async (
        tokenA: string,
        tokenB: string,
        amountA: string,
        context: AgentContext
    ): Promise<ToolResult> => {
        return {
            success: false,
            message: `⚠️ Liquidity pools are not yet available on Arc Testnet. This feature is coming soon.\n\nYou can:\n- Transfer USDC to another address\n- Bridge USDC to another chain\n- Check your balance`
        };
    }
}
