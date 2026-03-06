import { AgentSkill } from '../skills/modules';
import type { AgentContext } from '../types';

export interface VercelMessage {
    role: 'user' | 'assistant' | 'system' | 'model';
    content: string;
}

export interface LLMResponse {
    text: string;
    success: boolean;
}

export interface LLMProvider {
    /**
     * Name of the active provider (e.g. 'gemini', 'openai')
     */
    name: string;

    /**
     * Executes the conversational model and handles tool calls internally
     * @param messages - Array of prior chat messages
     * @param context - User/Session context for tools
     * @param tools - Array of available AgentSkills
     * @returns Final text response matching the user's language
     */
    executeAgent(
        messages: VercelMessage[],
        context: AgentContext,
        tools: AgentSkill[]
    ): Promise<LLMResponse>;
}
