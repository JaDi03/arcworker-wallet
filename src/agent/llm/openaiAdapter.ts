import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LLMProvider, LLMResponse, VercelMessage } from './types';
import { AgentSkill } from '../skills/modules';
import type { AgentContext } from '../types';
import { AGENT_PERSONA } from '../prompts';

export class OpenAIAdapter implements LLMProvider {
    name = 'openai';
    private openai: OpenAI;
    private defaultModel: string;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY || "";
        const baseURL = process.env.OPENAI_BASE_URL || undefined;
        this.defaultModel = process.env.OPENAI_MODEL || "gpt-4o";

        if (!apiKey) throw new Error("OPENAI_API_KEY is missing in environment variables");

        // Passing baseURL allows connecting to DeepSeek, Kimi, Groq, etc. using this same SDK.
        this.openai = new OpenAI({ apiKey, baseURL });
    }

    async executeAgent(messages: VercelMessage[], context: AgentContext, tools: AgentSkill[]): Promise<LLMResponse> {
        try {
            // 1. Prepare Tools for OpenAI (Uses native 'function' type)
            const openAITools = tools.map(skill => {
                const jsonSchema = zodToJsonSchema(skill.parameters);
                const cleanSchema = {
                    type: 'object',
                    properties: (jsonSchema as any).properties,
                    required: (jsonSchema as any).required,
                };
                if (cleanSchema.required && cleanSchema.required.length === 0) {
                    delete cleanSchema.required;
                }
                return {
                    type: "function" as const,
                    function: {
                        name: skill.name,
                        description: skill.description,
                        parameters: cleanSchema,
                    }
                };
            });

            // 2. Prepare Chat History for OpenAI
            let openaiMessages: any[] = [];

            // System prompt
            openaiMessages.push({
                role: 'system',
                content: AGENT_PERSONA(context.userAddress || "0x...", tools)
            });

            // Map standard Vercel messages to OpenAI format
            for (const m of messages) {
                if (m.role === 'user' || m.role === 'assistant') {
                    openaiMessages.push({ role: m.role, content: m.content });
                }
            }

            console.log(`[OpenAIAdapter] Sending prompt to OpenAI: "${messages[messages.length - 1].content.substring(0, 50)}..."`);

            // 3. Initialize Model & Start Chat (Turn 1)
            const response = await this.openai.chat.completions.create({
                model: this.defaultModel,
                messages: openaiMessages,
                tools: openAITools,
                tool_choice: "auto", // Equivalent to FunctionCallingMode.AUTO
                temperature: 0,
            });

            const choice = response.choices[0];
            const message = choice.message;

            // 4. Handle Function Calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                console.log(`[OpenAIAdapter] Detected ${message.tool_calls.length} tool calls.`);

                // Keep the assistant's tool call message in history for the next turn
                openaiMessages.push(message);

                for (const toolCall of message.tool_calls) {
                    const functionName = (toolCall as any).function.name;
                    const functionArgs = JSON.parse((toolCall as any).function.arguments);

                    console.log(`[OpenAIAdapter] Executing: ${functionName}`, functionArgs);

                    const skill = tools.find(s => s.name === functionName);
                    let toolResult;

                    if (skill) {
                        try {
                            toolResult = await skill.execute(functionArgs, context);
                        } catch (err: any) {
                            toolResult = { success: false, message: `Error executing tool: ${err.message}` };
                        }
                    } else {
                        console.error(`Tool ${functionName} not found.`);
                        toolResult = { error: "Tool not found" };
                    }

                    console.log(`[OpenAIAdapter] Result for ${functionName}:`, JSON.stringify(toolResult).substring(0, 100) + "...");

                    // Append the tool result to the history
                    openaiMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: functionName,
                        content: JSON.stringify(toolResult)
                    });
                }

                // Send ALL results back to Model (Turn 2)
                const finalResponse = await this.openai.chat.completions.create({
                    model: this.defaultModel,
                    messages: openaiMessages,
                    temperature: 0,
                });

                const finalText = finalResponse.choices[0].message.content;

                if (!finalText || finalText.trim() === "") {
                    return { text: "I've processed your request. Is there anything else you'd like to do?", success: true };
                }

                return { text: finalText, success: true };
            }

            // Normal Text Response
            const content = message.content;
            if (!content || content.trim() === "") {
                return { text: "I'm sorry, I couldn't generate a response. Please ask me to check your balance, send funds, or bridge tokens.", success: true };
            }

            return { text: content, success: true };

        } catch (error: any) {
            console.error("🔥 OpenAIAdapter Error:", error);
            throw error;
        }
    }
}
