import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { LLMProvider, LLMResponse, VercelMessage } from './types';
import { AgentSkill } from '../skills/modules';
import type { AgentContext } from '../types';
import { AGENT_PERSONA } from '../prompts';

export class GeminiAdapter implements LLMProvider {
    name = 'gemini';
    private genAI: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
        if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing");
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async executeAgent(messages: VercelMessage[], context: AgentContext, tools: AgentSkill[]): Promise<LLMResponse> {
        try {
            // 1. Prepare Tools for Gemini
            const geminiTools = [{
                functionDeclarations: tools.map(skill => {
                    const jsonSchema = zodToJsonSchema(skill.parameters);
                    // Clean schema for Gemini
                    const cleanSchema = {
                        type: 'object',
                        properties: (jsonSchema as any).properties,
                        required: (jsonSchema as any).required,
                    };
                    if (cleanSchema.required && cleanSchema.required.length === 0) {
                        delete cleanSchema.required;
                    }
                    return {
                        name: skill.name,
                        description: skill.description,
                        parameters: cleanSchema,
                    };
                })
            }];

            // 2. Prepare Chat History (Convert Vercel Message format to Google format)
            let rawHistory = messages.slice(0, -1).map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            // Strict Validation: History MUST start with 'user'
            const firstUserIndex = rawHistory.findIndex((m: any) => m.role === 'user');
            let validHistory: any[] = [];
            if (firstUserIndex !== -1) {
                validHistory = rawHistory.slice(firstUserIndex);
            }

            const lastMessage = messages[messages.length - 1];
            const userPrompt = lastMessage.content;

            // 3. Initialize Model
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                systemInstruction: AGENT_PERSONA(context.userAddress || "0x...", tools),
                tools: geminiTools as any,
                toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } }
            });

            // 4. Start Chat & Send Message
            const chat = model.startChat({
                history: validHistory,
                generationConfig: {
                    maxOutputTokens: 1000,
                    temperature: 0,
                },
            });

            console.log(`[GeminiAdapter] Sending prompt to Gemini: "${userPrompt.substring(0, 50)}..."`);
            const result = await chat.sendMessage(userPrompt);
            const response = await result.response;

            // 5. Handle Function Calls
            const calls = response.functionCalls();

            if (calls && calls.length > 0) {
                console.log(`[GeminiAdapter] Detected ${calls.length} tool calls.`);
                const functionResponses = [];

                for (const call of calls) {
                    console.log(`[GeminiAdapter] Executing: ${call.name}`, call.args);
                    const skill = tools.find(s => s.name === call.name);
                    let toolResult;

                    if (skill) {
                        try {
                            toolResult = await skill.execute(call.args, context);
                        } catch (err: any) {
                            toolResult = { success: false, message: `Error executing tool: ${err.message}` };
                        }
                    } else {
                        console.error(`Tool ${call.name} not found.`);
                        toolResult = { error: "Tool not found" };
                    }

                    console.log(`[GeminiAdapter] Result for ${call.name}:`, JSON.stringify(toolResult).substring(0, 100) + "...");

                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: { name: call.name, content: toolResult }
                        }
                    });
                }

                // Send ALL results back to Model
                const finalResult = await chat.sendMessage(functionResponses);
                const finalResponse = await finalResult.response;
                const finalText = finalResponse.text();

                if (!finalText || finalText.trim() === "") {
                    return { text: "I've processed your request. Is there anything else you'd like to do?", success: true };
                }

                return { text: finalText, success: true };
            }

            // Normal Text Response
            const text = response.text();
            if (!text || text.trim() === "") {
                return { text: "I'm sorry, I couldn't generate a response. Please ask me to check your balance, send funds, or bridge tokens.", success: true };
            }

            return { text: text, success: true };

        } catch (error: any) {
            console.error("🔥 GeminiAdapter Error:", error);
            throw error;
        }
    }
}
