import { AgentContext } from "./types";

export type AgentResponse = {
    text: string;
    action?: "faucet_card" | "tx_link" | "show_plan";
    data?: any;
};

// Update the function interface (implementation)
export async function processUserIntent(
    input: string,
    userAddress: string,
    session?: any,
    history: any[] = [],
    userId?: string
): Promise<AgentResponse> {
    // Context is now managed by the server via route.ts
    // const context: AgentContext = { userAddress, session, userId }; 

    try {
        // 1. Prepare Messages for the AI Brain
        const aiMessages = [
            ...history.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
            })),
            { role: 'user', content: input }
        ];

        // 2. Call the AI Brain (Server-Side Agent)
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: aiMessages, userId, userAddress }) // Pass userId AND userAddress to server
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `AI Brain error ${response.status}`);
        }

        const aiResult = await response.json();
        const aiText = aiResult.text || "I processed that, but have no response.";

        // For V2: If the AI executed a tool on the server, it might have embedded data in the response text
        // or we could enhance route.ts to return specific 'extras'. 
        // For now, we rely on the AI's natural language response.

        return { text: aiText };

    } catch (error) {
        console.error("Agent Engine Error:", error);
        return { text: "⚠️ My brain is having trouble connecting. Please try again." };
    }
}
