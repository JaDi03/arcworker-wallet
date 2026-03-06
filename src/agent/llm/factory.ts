import { LLMProvider } from './types';
import { GeminiAdapter } from './geminiAdapter';
import { OpenAIAdapter } from './openaiAdapter';

/**
 * Automatically detects and returns the appropriate LLM Provider Adapter
 * based on the environment variables configuration.
 */
export function getLLMProvider(): LLMProvider {
    // 1. Check if the user forced a specific provider in .env
    const forcedProvider = process.env.LLM_PROVIDER?.toLowerCase();

    // 2. Load the requested provider if API key exists
    if (forcedProvider === 'openai') {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("LLM_PROVIDER is set to 'openai' but OPENAI_API_KEY is missing in .env.local");
        }
        return new OpenAIAdapter();
    }

    if (forcedProvider === 'gemini') {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            throw new Error("LLM_PROVIDER is set to 'gemini' but GOOGLE_GENERATIVE_AI_API_KEY is missing in .env.local");
        }
        return new GeminiAdapter();
    }

    // 3. Auto-detect fallback (if no LLM_PROVIDER is explicitly set)
    // Priority: OpenAI -> Gemini
    if (process.env.OPENAI_API_KEY) {
        console.log("[LLM Factory] Auto-detected OPENAI_API_KEY. Using OpenAI Adapter.");
        return new OpenAIAdapter();
    }

    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.log("[LLM Factory] Auto-detected GOOGLE_GENERATIVE_AI_API_KEY. Using Gemini Adapter.");
        return new GeminiAdapter();
    }

    // 4. Missing Configuration Error
    throw new Error(
        "No API Keys found for any LLM Provider. Please add GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY to your .env.local file."
    );
}
