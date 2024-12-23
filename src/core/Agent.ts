import { Tool, AIConfig, AIResponse, ToolCall } from '../types/index';
import { AIClient } from './AIClient';
import { z } from 'zod';

// Configuration par défaut
const DEFAULT_CONFIG = {
    modelName: 'llama3.2:3b',
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2048,
    maxRetries: 3
};

/**
 * Options pour l'initialisation de l'Agent
 * @property modelName - Optional. The name of the AI model to use.
 * @property baseUrl - Optional. The base URL for the AI service.
 * @property temperature - Optional. The temperature setting for response variability.
 * @property maxtokens - Optional. The maximum number of tokens for the response.
 * @property maxRetries - Optional. The maximum number of retry attempts for execution.
 */
interface AgentOptions {
    modelName?: string;
    baseUrl?: string;
    temperature?: number;
    maxtokens?: number;
    maxRetries?: number;
}

interface ExecuteOptions<T> {
    prompt: string;
    tools?: Tool[];
    responseSchema?: z.ZodType<T>;
}

interface ToolCallResult {
    name: string;
    tool: string;
    parameters: Record<string, any>;
    result?: any;
}

interface ExecuteResult<T> {
    response: string;
    parsedResponse?: T;
    validationError?: string | z.ZodError;
    toolCalls?: ToolCallResult[];
}

export class Agent {
    private config: AIConfig;
    private tools: Tool[] = [];
    private maxRetries: number;

    constructor(options: AgentOptions = {}) {
        this.config = {
            modelName: options.modelName || DEFAULT_CONFIG.modelName,
            baseUrl: options.baseUrl || DEFAULT_CONFIG.baseUrl,
            temperature: options.temperature || DEFAULT_CONFIG.temperature,
            maxTokens: options.maxtokens || DEFAULT_CONFIG.maxTokens
        };
        this.maxRetries = options.maxRetries || DEFAULT_CONFIG.maxRetries;
    }

    addTools(tools: Tool[]): void {
        this.tools.push(...tools);
    }

    listTools(): Tool[] {
        return this.tools;
    }

    // Helper pour l'exécution avec un schéma Zod
    executeWithSchema<S extends z.ZodType>(
        schema: S,
        options: Omit<ExecuteOptions<z.infer<S>>, 'responseSchema'> & { maxRetries?: number }
    ): Promise<ExecuteResult<z.infer<S>>> {
        return this.execute({
            ...options,
            responseSchema: schema,
            maxRetries: options.maxRetries ?? this.maxRetries
        });
    }

    // Helper pour l'exécution sans schéma
    executeRaw(
        options: Omit<ExecuteOptions<never>, 'responseSchema'>
    ): Promise<ExecuteResult<never>> {
        return this.execute(options);
    }

    private buildSystemPrompt(tools: Tool[], responseSchema?: z.ZodType<any>): string {
        return `You are an AI assistant that helps answer questions.`;
    }

    private convertToolCallsToResults(toolCalls?: ToolCall[]): ToolCallResult[] | undefined {
        if (!toolCalls) return undefined;
        return toolCalls.map(call => ({
            name: call.name,
            tool: call.name,
            parameters: call.parameters,
            result: call.result
        }));
    }

    private async executeWithRetry<T>(
        client: AIClient,
        prompt: string,
        schema?: z.ZodType<T>,
        maxRetries: number = this.maxRetries,
        attempt: number = 1,
        toolResults: ToolCallResult[] = [],
        options: { enableToolUse: boolean, responseSchema?: z.ZodType<T> } = { enableToolUse: true }
    ): Promise<ExecuteResult<T>> {
        const response = await client.generate(prompt, options);
        const newToolResults = this.convertToolCallsToResults(response.toolCalls);

        // Exécution des tools
        if (newToolResults) {
            for (const call of newToolResults) {
                const result = await client.executeTool(call.name, call.parameters);
                call.result = result.success ? result.data : result.error;
            }
            toolResults.push(...newToolResults);
        }

        // Si pas de schéma, on retourne la réponse telle quelle
        if (!schema) {
            return {
                response: response.text,
                toolCalls: toolResults
            };
        }

        try {
            // Essaie de parser la réponse comme du JSON
            let jsonResponse: any;
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                // Si on a encore des tentatives, on réessaie
                if (attempt < maxRetries) {
                    const retryMessage = `${prompt}\n\nReminder: Your response must be a valid JSON object that starts with { and ends with }. Do not add any text before or after the JSON.`;
                    return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults, options);
                }
                // Sinon on retourne l'erreur
                return {
                    response: response.text,
                    validationError: 'Response must be a valid JSON object that starts with { and ends with }',
                    toolCalls: toolResults
                };
            }

            try {
                jsonResponse = JSON.parse(jsonMatch[0]);
            } catch (parseError) {
                // Si on a encore des tentatives, on réessaie
                if (attempt < maxRetries) {
                    const retryMessage = `${prompt}\n\nReminder: The provided JSON is not valid. Make sure it is properly formatted and contains no comments.`;
                    return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults, options);
                }
                // Sinon on retourne l'erreur
                return {
                    response: response.text,
                    validationError: 'The provided JSON is not valid',
                    toolCalls: toolResults
                };
            }

            // Valide le JSON avec le schéma
            const validation = schema.safeParse(jsonResponse);
            if (validation.success) {
                // Si c'est valide, on retourne le résultat
                return {
                    response: jsonMatch[0],
                    parsedResponse: validation.data,
                    toolCalls: toolResults
                };
            }

            // Si on a encore des tentatives, on réessaie
            if (attempt < maxRetries) {
                const errors = validation.error.errors.map(e => {
                    const path = e.path.join('.');
                    return `${path ? path + ' : ' : ''}${e.message})`;
                }).join('\n');
                const retryMessage = `${prompt}\n\ IMPORTANT: This response does not match the schema. Errors:\n${errors}`;
                //const retryMessage = `Ty\n${errors}`;
                return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults, options);
            }

            // Si on n'a plus de tentatives, on retourne l'erreur
            return {
                response: jsonMatch[0],
                validationError: validation.error.errors.map(e => {
                    const path = e.path.join('.');
                    return `${path ? path + ' : ' : ''}${e.message}`;
                }).join('\n'),
                toolCalls: toolResults
            };
        } catch (error) {
            // Si on a encore des tentatives, on réessaie
            if (attempt < maxRetries) {
                const retryMessage = `${prompt}\n\nReminder: ${error instanceof Error ? error.message : 'The response must be a valid JSON'}`;
                return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults, options);
            }

            // Si on n'a plus de tentatives, on retourne l'erreur
            return {
                response: response.text,
                validationError: error instanceof Error ? error.message : 'Unknown error',
                toolCalls: toolResults
            };
        }
    }

    async execute<T = any>({ 
        prompt, 
        tools = [], 
        responseSchema,
        maxRetries = this.maxRetries
    }: ExecuteOptions<T> & { maxRetries?: number }): Promise<ExecuteResult<T>> {
        try {
            // Création d'une instance du client avec les tools
            const client = new AIClient(this.config);
            
            // Ajout des tools
            const allTools = [...this.tools, ...tools];
            allTools.forEach(tool => client.addTool(tool));

            // Construction du prompt système avec TOUS les tools
            const fullPrompt = `${prompt}`;

            // Exécution avec retry si nécessaire
            return await this.executeWithRetry<T>(
                client,
                fullPrompt,
                responseSchema,
                maxRetries,
                1,
                [],
                { enableToolUse: allTools.length > 0, responseSchema }
            );
        } catch (error) {
            throw new Error(`Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Execute a simple prompt without any tools or schema validation
     * @param prompt The prompt to send to the AI
     * @returns Promise with the AI's response
     */
    async prompt(prompt: string): Promise<string> {
        try {
            const client = new AIClient(this.config);
            const response = await client.generate(prompt, { enableToolUse: false });
            return response.text;
        } catch (error) {
            throw new Error(`Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
