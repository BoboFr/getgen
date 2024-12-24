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

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ChatOptions {
    messages: ChatMessage[];
    stream?: boolean;
    temperature?: number;
    model?: string;
}

interface OllamaChatResponse extends OllamaResponse {
    model: string;
    created_at: string;
}

export interface AIClientInterface {
    listModels(): Promise<ModelInfo[]>;
    generate(prompt: string, options?: GenerateOptions): Promise<AIResponse>;
    generateRaw(prompt: string): Promise<AIResponse>;
    chat(options: ChatOptions): Promise<AIResponse>;
    executeTool(name: string, parameters: Record<string, any>): Promise<ToolResult>;
    addTool(tool: Tool): void;
    removeTool(toolName: string): void;
    listTools(): Tool[];
    buildSystemPrompt(enableToolUse: boolean, responseSchema?: z.ZodType<any>): string;
}

export class AIClient implements AIClientInterface {
    private config: AIConfig;
    private toolManager: ToolManager;

    constructor(config: AIConfig) {
        this.config = config;
        this.toolManager = new ToolManager();
    }

    public async listModels(): Promise<ModelInfo[]> {
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

    public async generate(prompt: string, options: GenerateOptions = {}): Promise<AIResponse> {
        const response = await this.generateRaw(prompt);
        return {
            text: response.text,
            toolCalls: response.toolCalls,
            usage: response.usage,
            parsed: options.responseSchema ? options.responseSchema.safeParse(response.text) : undefined
        };
    }

    public async generateRaw(prompt: string): Promise<AIResponse> {
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

        const responseText = data.response || '';

        return {
            text: responseText,
            toolCalls: this.extractToolCalls(responseText),
            usage: {
                promptTokens: data.prompt_eval_count,
                completionTokens: data.eval_count,
                totalTokens: data.prompt_eval_count + data.eval_count
            }
        };
    }

    public async chat(options: ChatOptions): Promise<AIResponse> {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: options.model || this.config.modelName,
                    messages: options.messages,
                    stream: options.stream || false,
                    temperature: options.temperature || this.config.temperature,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as OllamaChatResponse;
            const content = data.message || data.response || '';

            return {
                text: content,
                content,
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Chat request failed: ${error.message}`);
            }
            throw error;
        }
    }

    public async executeTool(name: string, parameters: Record<string, any>): Promise<ToolResult> {
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

            const result = await tool.execute(parameters);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    public addTool(tool: Tool): void {
        this.toolManager.addTool(tool);
    }

    public removeTool(toolName: string): void {
        this.toolManager.removeTool(toolName);
    }

    public listTools(): Tool[] {
        return this.toolManager.listTools();
    }

    private extractToolCalls(text: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];
        const toolCallRegex = /TOOL_CALL:\s*{[\s\S]*?"tool":\s*"([^"]+)"[\s\S]*?"parameters":\s*({[\s\S]*?})\s*}/g;
        
        let match;
        while ((match = toolCallRegex.exec(text)) !== null) {
            try {
                const name = match[1];
                const parameters = JSON.parse(match[2]);
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

2. Then, after getting the tool result, return ONLY the final JSON response.`;
        }

        if (!responseSchema) return toolsPrompt;

        try {
            if (!(responseSchema instanceof z.ZodObject)) {
                return toolsPrompt;
            }

            const shape = responseSchema.shape as Record<string, z.ZodType<any>>;
            const fields = this.extractFields(shape);

            const typeRules = fields.map(f => {
                let rule = `- "${f.name}" must be a ${f.type}${f.required ? ' (required)' : ' (optional)'}`;
                if (f.description) {
                    rule += `: ${f.description}`;
                }
                if (f.enumValues) {
                    rule += `. Valid values: ${f.enumValues.map(v => `"${v}"`).join(', ')}`;
                }
                return rule;
            }).join('\n');

            const schemaPrompt = `
BASIC INFORMATION:
Current datetime: ${new Date().toISOString()}
CRITICAL RULES:
1. You MUST ALWAYS return a valid JSON object
2. The JSON object MUST contain ALL required fields
3. Each field MUST have the correct type
4. NEVER include any text before or after the JSON object
5. NEVER include any comments or explanations
6. For enum fields, you MUST use EXACTLY one of the specified values

RESPONSE FORMAT:
Your response must be a valid JSON object with these fields:
${typeRules}

Example valid response:
{
    ${fields.filter(f => f.required).map(f => {
        if (f.type === 'string') return `"${f.name}": "example"`;
        if (f.type === 'number') return `"${f.name}": 123`;
        if (f.type === 'boolean') return `"${f.name}": true`;
        if (f.type === 'enum' && f.enumValues) return `"${f.name}": "${f.enumValues[0]}"`;
        return `"${f.name}": null`;
    }).join(',\n    ')}
}`;

            return enableToolUse ? `${toolsPrompt}\n${schemaPrompt}` : schemaPrompt;
        } catch (error: any) {
            console.warn('Failed to generate system prompt:', error);
            return toolsPrompt;
        }
    }

    private extractFields(obj: Record<string, z.ZodType<any>>, prefix = ''): Array<{ 
        name: string; 
        type: string; 
        required: boolean; 
        isNested: boolean; 
        enumValues?: string[];
        description?: string;
    }> {
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
                    ...this.extractFields(nestedShape, fieldName)
                ];
            }

            // Déterminer le type de base
            let type = 'any';
            let enumValues: string[] | undefined;
            let description: string | undefined;

            // Extract description if available
            const desc = value._def.description;
            if (desc) {
                description = desc;
            }

            if (value instanceof z.ZodString) type = 'string';
            else if (value instanceof z.ZodNumber) type = 'number';
            else if (value instanceof z.ZodBoolean) type = 'boolean';
            else if (value instanceof z.ZodArray) type = 'array';
            else if (value instanceof z.ZodNull) type = 'null';
            else if (value instanceof z.ZodUndefined) type = 'undefined';
            else if (value instanceof z.ZodEnum) {
                type = 'enum';
                enumValues = value._def.values;
            }

            return [{
                name: fieldName,
                type,
                required: !value.isOptional(),
                isNested: false,
                enumValues,
                description
            }];
        });
    }
}
