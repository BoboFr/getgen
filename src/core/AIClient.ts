import { AIConfig, AIResponse, ModelInfo, Tool, ToolResult, GenerateOptions, ToolCall } from '../types/index';
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

    private buildSystemPrompt(enableToolUse: boolean, responseSchema?: z.ZodType<any>): string {
        const tools = this.toolManager.listTools();
        // Construction du prompt pour les outils
        let toolsPrompt = '';
        if (enableToolUse && tools.length > 0) {
            toolsPrompt = `\nAVAILABLE TOOLS:
${tools.map(tool => {
    const params = tool.parameters.map(p => 
        `  - ${p.name} (${p.type})${p.required ? ' [required]' : ''}: ${p.description}`
    ).join('\n');
    return `${tool.name}: ${tool.description}
Parameters:
${params}

Tool usage format:
<tool>
name: ${tool.name}
parameters:
  ${tool.parameters.map(p => `${p.name}: ${p.type === 'string' ? '"value"' : 'value'}`).join('\n  ')}
</tool>`;
}).join('\n\n')}

CRITICAL RULES FOR TOOLS:
1. ALWAYS use available tools when they can help
2. Tool parameters must be valid JSON values (strings need quotes)
3. Wait for tool result before returning final response
4. Use EXACTLY the tool names shown above
5. Use the tool result in your final response
6. NEVER write additional text before or after the JSON
`;
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

            // Fonction récursive pour générer la structure JSON
            const generateLevel = (node: Record<string, TreeNode>, level: number): string => {
                const currentIndent = ' '.repeat(level);
                let result = '';
                
                Object.values(node).forEach((field, index, array) => {
                    const isLast = index === array.length - 1;
                    const comma = isLast ? '' : ',';
                    
                    if (field.type === 'object') {
                        result += `${currentIndent}"${field.name}": {${field.required ? ' (required)' : ' (optional)'}\n`;
                        result += generateLevel(field.children, level + 4);
                        result += `${currentIndent}}${comma}\n`;
                    } else {
                        result += `${currentIndent}"${field.name}": "${field.type}"${field.required ? ' (required)' : ' (optional)'}${comma}\n`;
                    }
                });

                return result;
            };

            // Générer la structure JSON attendue
            const generateJsonStructure = (fields: Array<{ name: string; type: string; required: boolean; isNested: boolean }>, indent = 0): string => {
                // Construire l'arbre
                const root: Record<string, TreeNode> = {};
                fields.forEach(field => {
                    const parts = field.name.split('.');
                    let currentLevel = root;

                    // Parcourir chaque partie du chemin
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        const isLastPart = i === parts.length - 1;

                        if (!currentLevel[part]) {
                            currentLevel[part] = {
                                name: part,
                                type: isLastPart ? field.type : 'object',
                                required: isLastPart ? field.required : true, // Les objets intermédiaires sont toujours requis
                                isNested: !isLastPart,
                                children: {}
                            };
                        }

                        if (!isLastPart) {
                            currentLevel = currentLevel[part].children;
                        }
                    }
                });

                return generateLevel(root, indent);
            };

            const typeRules = fields.map(f => 
                `- "${f.name}" must be a ${f.type}${f.required ? ' (required)' : ' (optional)'}`
            ).join('\n');

            const jsonStructure = generateJsonStructure(fields, 4);
            
            let finalPrompt = `You are an AI assistant that helps answer questions.
${toolsPrompt}

CRITICAL: Your response MUST be EXACTLY in this format:
{
${jsonStructure}}

RULES:
1. ONLY return a JSON object in the format shown above
2. NO text before or after the JSON
3. NO additional fields in the JSON
4. Field types must be correct:
${typeRules}
5. NEVER write additional text before or after the JSON
`;

            if (tools.length > 0) {
                finalPrompt += `\nExample 1:

1. Use tool
<tool>
name: ${tools[0].name}
parameters:
${tools[0].parameters.map(p => `  ${p.name}: ${p.type === 'string' ? '"value"' : 'value'}`).join('\n')}
</tool>
Tool result: { "success": true, "data": { "result": 4 } }

2. Format complete response:
{
${jsonStructure}}`;
            }

            fs.writeFileSync('fullPrompt.txt', finalPrompt)
            return finalPrompt;
        } catch (error) {
            console.warn('Failed to generate system prompt:', error);
            return toolsPrompt;
        }
    }

    private extractToolCalls(text: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];
        const toolRegex = /<tool>\s*name:\s*([^\n]+)\s*parameters:\s*([\s\S]*?)\s*<\/tool>/g;
        let match;

        while ((match = toolRegex.exec(text)) !== null) {
            const name = match[1].trim();
            const parametersText = match[2];
            const parameters: Record<string, any> = {};
            // Parse parameters
            const paramLines = parametersText.trim().split('\n');
            for (const line of paramLines) {
                const [key, ...valueParts] = line.trim().split(':');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join(':').trim();
                    parameters[key.trim()] = this.parseValue(value);
                }
            }

            toolCalls.push({ name, parameters });
        }

        return toolCalls;
    }

    private parseValue(value: string): any {
        // Remove quotes if present
        value = value.trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Try to parse as JSON if it looks like an array or object
        if (value.startsWith('[') || value.startsWith('{')) {
            try {
                return JSON.parse(value);
            } catch {
                // If parsing fails, return as is
                return value;
            }
        }

        // Try to parse as number
        const num = Number(value);
        if (!isNaN(num)) {
            return num;
        }

        // Return as string for other cases
        return value;
    }

    private parseToolCalls(response: string): { toolCalls: ToolCall[], remainingText: string } {
        const toolCalls = this.extractToolCalls(response);
        let remainingText = response;

        for (const toolCall of toolCalls) {
            const toolCallRegex = new RegExp(
                `<tool>\\s*name:\\s*${toolCall.name}\\s*parameters:\\s*` +
                Object.entries(toolCall.parameters)
                    .map(([key, value]) => `\\s*${key}:\\s*"?${value}"?\\s*`)
                    .join('\\s*') +
                '\\s*</tool>',
                'g'
            );
            remainingText = remainingText.replace(toolCallRegex, '');
        }

        return { toolCalls, remainingText: remainingText.trim() };
    }

    private async generateWithRetry(prompt: string): Promise<AIResponse> {
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
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as OllamaResponse;
        const responseText = data.response || '';

        return {
            text: responseText,
            toolCalls: this.extractToolCalls(responseText),
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : undefined
        };
    }

    async generate(prompt: string, options: GenerateOptions = {}): Promise<AIResponse> {
        const systemPrompt = this.buildSystemPrompt(options.enableToolUse ?? true, options.responseSchema);
        const fullPrompt = `${systemPrompt}\n\n${prompt}`;

        return this.generateWithRetry(fullPrompt);
        
        /*try {
            const systemPrompt = this.buildSystemPrompt(options.enableToolUse ?? true, options.responseSchema);
            const fullPrompt = `${systemPrompt}\n\n${prompt}`;

            // Ajout d'une validation pour forcer l'utilisation des outils
            if (prompt.toLowerCase().includes('lettre') || prompt.toLowerCase().includes('length')) {
                const response = await this.generateWithRetry(fullPrompt);

                if (!response.toolCalls || response.toolCalls.length === 0) {
                    return this.generateWithRetry(fullPrompt + '\n\nYou MUST use the length tool to answer this question. Do not try to calculate the length yourself.');
                }

                // Validation du nombre d'appels
                if (response.toolCalls.filter(call => call.name === 'length').length > 1) {
                    return this.generateWithRetry(fullPrompt + '\n\nYou MUST use the length tool ONCE. Do not use it multiple times.');
                }

                // Validation de la langue
                if (prompt.toLowerCase().includes('lettre') && response.text.toLowerCase().includes('word')) {
                    return this.generateWithRetry(fullPrompt + '\n\nLa question est en français, vous devez répondre en français.');
                }

                return response;
            }

            return this.generateWithRetry(fullPrompt);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Generation failed: ${error.message}`);
            }
            throw error;
        }*/
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
}
