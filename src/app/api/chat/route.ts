import { SKILL_REGISTRY } from '@/agent/skills/registry';
import type { AgentContext } from '@/agent/types';
import { getLLMProvider } from '@/agent/llm/factory';
import { NextResponse } from 'next/server';

// Type definitions for Vercel AI SDK message format
interface VercelMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface RequestBody {
    messages: VercelMessage[];
    userId?: string;
    userAddress?: string;
}

// Allow streaming responses (though we might return JSON for simplicity first)
// Max duration for Edge/Serverless functions (Local can be infinite, Vercel Hobby 60s max)
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const { messages, userId, userAddress: bodyUserAddress }: RequestBody = await req.json();

        // 1. Resolve Provider
        const llm = getLLMProvider();
        console.log(`🔹 AI Request (${llm.name.toUpperCase()}):`, messages.length, "messages", userId ? `from user ${userId}` : "(no userId)");

        // 2. Fetch User Context (Address)
        let userAddress = bodyUserAddress || "0x...";
        // If provided a userId but NO address, fetch it
        if (userId && (!bodyUserAddress || bodyUserAddress === "0x...")) {
            try {
                // Import dynamically to avoid build issues if not used
                const { getOrCreateWallet } = await import('@/lib/serverWallet');
                const wallet = await getOrCreateWallet(userId, 'arcTestnet');
                userAddress = wallet.address;
                console.log(`🔹 Context: User ${userId} -> ${userAddress}`);
            } catch (e) {
                console.error("Failed to fetch user wallet for context:", e);
                userAddress = "Unknown (Error fetching wallet)";
            }
        }

        const context: AgentContext = {
            userId: userId || 'anonymous',
            userAddress: userAddress,
            session: null
        };

        // 3. Execute LLM Provider Logic
        const responseData = await llm.executeAgent(messages, context, SKILL_REGISTRY);

        return NextResponse.json({
            text: responseData.text,
            isToolCall: false
        });

    } catch (error: any) {
        console.error("🔥 AI SERVER ERROR (Dynamic SDK):", error);
        return NextResponse.json({ error: error.message || "Unknown AI Error" }, { status: 500 });
    }
}
