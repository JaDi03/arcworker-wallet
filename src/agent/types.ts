import type { WalletSession } from '@/lib/wallet-sdk';

export type ToolResult = {
    success: boolean;
    message: string;
    data?: unknown;
    action?: string; // e.g., 'tx_link', 'faucet_card'
};

export interface AgentContext {
    userAddress: string;
    session?: WalletSession | null;
    userId: string; // Required - unique identifier for multi-user wallet support
}
