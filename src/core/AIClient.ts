import { AIConfig, AIResponse, ModelInfo, Tool, ToolResult, GenerateOptions, ToolCall, Usage, Schema } from '../types/index';
import { ToolManager } from './tools/ToolManager';
import { z } from 'zod';
import * as fs from 'fs'

interface OllamaResponse {
    message?: string;
    response?: string;
    done: boolean;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
  

export class AIClient {
    private config: AIConfig;
    private toolManager: ToolManager;

    constructor(config: AIConfig) {
        this.config = config;
        this.toolManager = new ToolManager();
    }

    async listModels(): Promise<ModelInfo[]> {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/tags`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as { models: ModelInfo[] };
            return data.models;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to list models: ${error.message}`);
            }
            throw error;
        }
    }

    public buildSystemPrompt(enableToolUse: boolean, responseSchema?: z.ZodType<any>): string {
        const tools = this.toolManager.listTools();
        // Construction du prompt pour les outils
        let toolsPrompt = '';
        if (enableToolUse && tools.length > 0) {
            toolsPrompt = `\nYou are a tool-first AI assistant. Your primary function is to use tools to process data.
You MUST NEVER try to process data yourself - ALWAYS use the provided tools.

Here are your available tools:
${tools.map(tool => {
    const params = tool.parameters.map(p => 
        `  - ${p.name} (${p.type})${p.required ? ' [required]' : ''}: ${p.description}`
    ).join('\n');
    return `${tool.name}: ${tool.description}
Parameters:
${params}`;
}).join('\n\n')}

CRITICAL: You MUST follow this EXACT format for tool usage:
1. First, call the tool in this format:
TOOL_CALL:
{
    "tool": "tool_name",
    "parameters": {
        "param1": "value1",
        "param2": "value2"
    }
}

2. Then, after getting the tool result, return ONLY the final JSON response.

Example complete interaction:
User: "Format customer ID 1234"
Assistant's action:
TOOL_CALL:
{
    "tool": "parse_customer_id",
    "parameters": {
        "customerid": "1234"
    }
}

[After getting tool result: { "customer_id": "C0001234" }]
Assistant's response:
{
    "customer_id": "C0001234"
}

CRITICAL RULES:
1. You MUST ALWAYS use tools - NEVER process data yourself
2. Tool calls MUST use the EXACT format shown above
3. Parameters MUST be properly quoted strings
4. NEVER include explanatory text - ONLY tool calls and final JSON
5. Return the tool result AS IS in your response`;
        }

        if (!responseSchema) return toolsPrompt;

        try {
            if (!(responseSchema instanceof z.ZodObject)) {
                return toolsPrompt;
            }

            const shape = responseSchema.shape as Record<string, z.ZodType<any>>;

            // Créer une structure arborescente pour organiser les champs
            interface TreeNode {
                name: string;
                type: string;
                required: boolean;
                isNested: boolean;
                children: Record<string, TreeNode>;
            }

            // Fonction récursive pour extraire la structure des champs
            const extractFields = (obj: Record<string, z.ZodType<any>>, prefix = ''): Array<{ name: string; type: string; required: boolean; isNested: boolean }> => {
                return Object.entries(obj).flatMap(([key, value]) => {
                    if (!(value instanceof z.ZodType)) {
                        console.warn(`Invalid Zod type for field ${key}`);
                        return [];
                    }

                    const fieldName = prefix ? `${prefix}.${key}` : key;
                    
                    if (value instanceof z.ZodObject) {
                        const nestedShape = value.shape as Record<string, z.ZodType<any>>;
                        return [
                            {
                                name: fieldName,
                                type: 'object',
                                required: !value.isOptional(),
                                isNested: true
                            },
                            ...extractFields(nestedShape, fieldName)
                        ];
                    }

                    // Déterminer le type de base
                    let type = 'any';
                    if (value instanceof z.ZodString) type = 'string';
                    else if (value instanceof z.ZodNumber) type = 'number';
                    else if (value instanceof z.ZodBoolean) type = 'boolean';
                    else if (value instanceof z.ZodArray) type = 'array';
                    else if (value instanceof z.ZodNull) type = 'null';
                    else if (value instanceof z.ZodUndefined) type = 'undefined';

                    return [{
                        name: fieldName,
                        type,
                        required: !value.isOptional(),
                        isNested: false
                    }];
                });
            };

            const fields = extractFields(shape);

            const typeRules = fields.map(f => 
                `- "${f.name}" must be a ${f.type}${f.required ? ' (required)' : ' (optional)'}`
            ).join('\n');

            return `${toolsPrompt}

RESPONSE FORMAT:
Your response must be a valid JSON object with these fields:
${typeRules}`;
        } catch (error) {
            console.warn('Failed to generate system prompt:', error);
            return toolsPrompt;
        }
    }

    async generateRaw(prompt: string): Promise<AIResponse> {
        const response = await fetch(`${this.config.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.modelName,
                prompt,
                stream: false,
                options: {
                    temperature: this.config.temperature,
                    num_predict: (this.config.maxTokens || 2048) * 2,
                    stop: [],
                    num_ctx: 4096
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json() as {
            model: string;
            created_at: string;
            response: string;
            done: boolean;
            done_reason: string;
            context: number[];
            total_duration: number;
            load_duration: number;
            prompt_eval_count: number;
            prompt_eval_duration: number;
            eval_count: number;
            eval_duration: number;
        };

        console.log('Raw API response:', data);

        const responseText = data.response || '';
        console.log('Response text:', responseText);

        const toolCalls = this.extractToolCalls(responseText);
        console.log('Extracted tool calls:', toolCalls);

        return {
            text: responseText,
            toolCalls,
            usage: {
                promptTokens: data.prompt_eval_count,
                completionTokens: data.eval_count,
                totalTokens: data.prompt_eval_count + data.eval_count
            }
        };
    }

    private extractToolCalls(text: string): ToolCall[] {
        console.log('Extracting tool calls from:', text);
        const toolCalls: ToolCall[] = [];
        const toolCallRegex = /TOOL_CALL:\s*{[\s\S]*?"tool":\s*"([^"]+)"[\s\S]*?"parameters":\s*({[\s\S]*?})\s*}/g;
        
        let match;
        while ((match = toolCallRegex.exec(text)) !== null) {
            try {
                const name = match[1];
                const parameters = JSON.parse(match[2]);
                console.log('Found tool call:', { name, parameters });
                toolCalls.push({ name, parameters });
            } catch (error) {
                console.error('Error parsing tool call:', error);
            }
        }

        // Also try parsing the entire text as a tool call
        if (toolCalls.length === 0) {
            try {
                const obj = JSON.parse(text);
                if (obj.tool && obj.parameters) {
                    console.log('Found direct tool call:', obj);
                    toolCalls.push({
                        name: obj.tool,
                        parameters: obj.parameters
                    });
                }
            } catch (error) {
                // Not a valid tool call JSON
            }
        }

        return toolCalls;
    }

    async generate(prompt: string, options: GenerateOptions = {}): Promise<AIResponse> {
        const response = await this.generateRaw(prompt);

        let parsedResponse: any = undefined;
        const toolCalls: ToolCall[] = [];

        if (options.enableToolUse && response.toolCalls && response.toolCalls.length > 0) {
            const maxCalls = options.maxToolCalls || 5;
            let callCount = 0;

            for (const toolCall of response.toolCalls) {
                if (callCount >= maxCalls) break;

                const tool = this.toolManager.getTool(toolCall.name);
                if (!tool) {
                    console.warn(`Tool ${toolCall.name} not found`);
                    continue;
                }

                try {
                    const result = await tool.execute(toolCall.parameters);
                    toolCall.result = {
                        success: true,
                        data: result
                    };
                    // Use the tool result as the response if available
                    if (result) {
                        response.text = JSON.stringify(result, null, 4);
                    }
                } catch (error) {
                    toolCall.result = {
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    };
                }

                toolCalls.push(toolCall);
                callCount++;
            }
        }

        if (options.responseSchema) {
            try {
                // Try to parse the response as JSON first
                let jsonResponse;
                const jsonMatch = response.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        jsonResponse = JSON.parse(jsonMatch[0]);
                    } catch (error) {
                        jsonResponse = response.text;
                    }
                } else {
                    jsonResponse = response.text;
                }
                parsedResponse = options.responseSchema.parse(jsonResponse);
            } catch (error) {
                console.error('Failed to parse response:', error);
            }
        }

        return {
            text: response.text,
            parsed: parsedResponse, 
            toolCalls,
            usage: response.usage
        };
    }

    private async generateWithRetry(prompt: string): Promise<AIResponse> {
        const response = await this.generateRaw(prompt);
        console.log('Raw response:', response);
        return response;
    }

    // Méthodes de gestion des tools
    addTool(tool: Tool): void {
        this.toolManager.addTool(tool);
    }

    removeTool(toolName: string): void {
        this.toolManager.removeTool(toolName);
    }

    listTools(): Tool[] {
        return this.toolManager.listTools();
    }

    async executeTool(name: string, parameters: Record<string, any>): Promise<ToolResult> {
        try {
            const tools = this.toolManager.listTools();
            const tool = tools.find(t => t.name === name);
            
            if (!tool) {
                return {
                    success: false,
                    error: `Tool '${name}' not found`
                };
            }

            // Validate required parameters
            const missingParams = tool.parameters
                .filter((p: { name: string; required: boolean }) => p.required && !(p.name in parameters))
                .map((p: { name: string }) => p.name);

            if (missingParams.length > 0) {
                return {
                    success: false,
                    error: `Missing required parameters: ${missingParams.join(', ')}`
                };
            }

            return await tool.execute(parameters);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async executeWithSchema<T>(schema: Schema<T>, input: { prompt: string }): Promise<{ response: string; parsedResponse?: T; toolCalls: ToolCall[]; usage?: Usage }> {
        const response = await this.generate(input.prompt);
        const toolCalls = this.extractToolCalls(response.text);
        let parsedResponse: T | undefined;

        if (toolCalls.length > 0) {
            const toolResults = await Promise.all(toolCalls.map(async (call) => {
                const tool = this.toolManager.getTool(call.name);
                if (!tool) {
                    throw new Error(`Tool ${call.name} not found`);
                }
                return await tool.execute(call.parameters);
            }));
            
            // Return the last tool result as the response
            if (toolResults.length > 0) {
                const lastResult = toolResults[toolResults.length - 1];
                try {
                    parsedResponse = schema.parse(lastResult);
                } catch (e) {
                    console.error('Failed to parse tool result:', e);
                }
            }
        }

        return { 
            response: response.text, 
            parsedResponse, 
            toolCalls,
            usage: response.usage ? {
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                totalTokens: response.usage.totalTokens
            } : undefined
        };
    }
}
