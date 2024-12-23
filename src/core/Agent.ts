import { Tool, AIConfig, AIResponse, ToolCall } from '../types/index';
import { AIClient } from './AIClient';
import { z } from 'zod';
import * as fs from 'fs';

// Configuration par défaut
const DEFAULT_CONFIG = {
    modelName: 'llama3.2:3b',
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2048,
    maxRetries: 3,
    debug: false
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
    debug?: boolean;
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
    private client: AIClient;

    constructor(options: AgentOptions = {}) {
        this.config = {
            modelName: options.modelName || DEFAULT_CONFIG.modelName,
            baseUrl: options.baseUrl || DEFAULT_CONFIG.baseUrl,
            temperature: options.temperature || DEFAULT_CONFIG.temperature,
            maxTokens: options.maxtokens || DEFAULT_CONFIG.maxTokens,
            debug: options.debug || DEFAULT_CONFIG.debug
        };
        this.maxRetries = options.maxRetries || DEFAULT_CONFIG.maxRetries;
        this.client = new AIClient(this.config);
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
        prompt: string,
        schema?: z.ZodType<T>,
        maxRetries: number = this.maxRetries,
        attempt: number = 1,
        toolResults: ToolCallResult[] = [],
        options: { enableToolUse: boolean, responseSchema?: z.ZodType<T> } = { enableToolUse: true }
    ): Promise<ExecuteResult<T>> {
        try {
            const response = await this.client.generate(prompt, {
                enableToolUse: options.enableToolUse,
                responseSchema: options.responseSchema
            });

            const newToolResults = this.convertToolCallsToResults(response.toolCalls);

            // Exécution des tools
            if (newToolResults) {
                for (const call of newToolResults) {
                    const result = await this.client.executeTool(call.name, call.parameters);
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
                        return this.executeWithRetry(prompt, schema, maxRetries, attempt + 1, toolResults, options);
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
                        return this.executeWithRetry(prompt, schema, maxRetries, attempt + 1, toolResults, options);
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
                    return this.executeWithRetry(prompt, schema, maxRetries, attempt + 1, toolResults, options);
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
                    return this.executeWithRetry(prompt, schema, maxRetries, attempt + 1, toolResults, options);
                }

                // Si on n'a plus de tentatives, on retourne l'erreur
                return {
                    response: response.text,
                    validationError: error instanceof Error ? error.message : 'Unknown error',
                    toolCalls: toolResults
                };
            }
        } catch (error) {
            // Si on a encore des tentatives, on réessaie
            if (attempt < maxRetries) {
                const retryMessage = `${prompt}\n\nReminder: ${error instanceof Error ? error.message : 'The response must be a valid JSON'}`;
                return this.executeWithRetry(prompt, schema, maxRetries, attempt + 1, toolResults, options);
            }

            // Si on n'a plus de tentatives, on retourne l'erreur
            return {
                response: '',
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
            // Ajout des tools
            const allTools = [...this.tools, ...tools];
            allTools.forEach(tool => {
                this.client.addTool(tool);
            });

            // Construction du prompt système avec TOUS les tools
            const systemPrompt = this.client.buildSystemPrompt(true, responseSchema);
            const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;

            if (this.config.debug) {
                try {
                    fs.writeFileSync('fullPrompt.txt', fullPrompt);
                } catch (error) {
                    console.warn('Failed to save debug prompt:', error);
                }
            }

            if(this.config.debug) {
                fs.writeFileSync('prompt.txt', fullPrompt);
            }

            return this.executeWithRetry(
                fullPrompt,
                responseSchema,
                maxRetries,
                1,
                [],
                { enableToolUse: true, responseSchema }
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
            const response = await this.client.generate(prompt, { enableToolUse: false });
            return response.text;
        } catch (error) {
            throw new Error(`Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async chat(
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[], 
        options: { temperature?: number; model?: string; stream?: boolean } = {}
    ): Promise<{ role: 'assistant'; content: string; history: { role: 'system' | 'user' | 'assistant'; content: string }[] }> {
        const response = await this.client.chat({
            messages,
            temperature: options.temperature || this.config.temperature,
            model: options.model || this.config.modelName,
            stream: options.stream || false
        });

        // Extraire uniquement le texte de la réponse
        const responseText = typeof response.text === 'string' 
            ? response.text 
            : (response.text as any)?.content || '';
        
        // Ajouter la réponse de l'assistant à l'historique
        const history = [...messages, { role: 'assistant' as const, content: responseText }];

        return {
            role: 'assistant',
            content: responseText,
            history
        };
    }
}
