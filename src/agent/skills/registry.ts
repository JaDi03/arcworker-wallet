import {
    AgentSkill,
    BalanceSkill,
    TransferSkill,
    InvestSkillWrapper,
    LiquiditySkill,
    BridgeSkillWrapper,
    SwapSkillWrapper,
    QuoteSkillWrapper,
    FaucetSkill,
    ResumeBridgeSkillWrapper,
    ForwardingBridgeSkillWrapper
} from './modules';

/**
 * The Central Registry of Agent Skills.
 * To add a new skill to the agent, simply add it to this list.
 */
export const SKILL_REGISTRY: AgentSkill[] = [
    new BalanceSkill(),
    new TransferSkill(),
    // new InvestSkillWrapper(),
    // new LiquiditySkill(),
    new ForwardingBridgeSkillWrapper(),  // Forwarding Service + fallback to CCTP
    // new BridgeSkillWrapper(),  // CCTP Bridge (legacy - use ForwardingBridge instead)
    // new ResumeBridgeSkillWrapper(),  // Resume stuck bridge (only needed for legacy bridge)
    new SwapSkillWrapper(),
    new QuoteSkillWrapper(),
    new FaucetSkill()
];
