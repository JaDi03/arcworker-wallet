import { ToolResult, AgentContext } from "../../types";

export const InvestSkill = {
    /**
     * Invest / Stake Funds
     *
     * NOTE: This skill is currently disabled — no real yield vault is deployed on Arc Testnet.
     * To enable, replace VAULT_ADDRESS with a real deployed contract and implement the
     * actual staking logic (approve + deposit).
     */
    invest: async (amount: string, context: AgentContext): Promise<ToolResult> => {
        return {
            success: false,
            message: `⚠️ Yield Vault is not yet available on Arc Testnet. This feature is coming soon.\n\nYou can:\n- Transfer USDC to another address\n- Bridge USDC to another chain\n- Check your balance`
        };
    }
};
