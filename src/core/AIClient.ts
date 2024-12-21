import { AIConfig, AIResponse, ModelInfo, Tool, ToolResult, GenerateOptions, ToolCall } from '../types';
import { ToolManager } from './tools/ToolManager';

interface OllamaResponse {
    response: string;
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
        this.config = {
            temperature: 0.7,
            maxTokens: 2048,
            ...config
        };
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

    private buildSystemPrompt(enableToolUse: boolean): string {
        if (!enableToolUse) return '';

        const tools = this.toolManager.listTools();
        if (tools.length === 0) return '';

        const toolDescriptions = tools.map(tool => {
            const params = tool.parameters.map(p => 
                `      - ${p.name} (${p.type})${p.required ? ' [requis]' : ''}: ${p.description}`
            ).join('\n');

            return `
    ${tool.name}: ${tool.description}
    Paramètres:
${params}`;
        }).join('\n\n');

        return `Tu as accès aux outils suivants:
${toolDescriptions}

Pour utiliser un outil, réponds au format suivant:
<tool>
name: [nom de l'outil]
parameters:
  [paramètre1]: [valeur1]
  [paramètre2]: [valeur2]
</tool>

Tu peux utiliser plusieurs outils en les listant les uns après les autres.
Après avoir utilisé les outils nécessaires, fournis ta réponse finale.
`;
    }

    private parseToolCalls(response: string): { toolCalls: ToolCall[], remainingText: string } {
        const toolCalls: ToolCall[] = [];
        let remainingText = response;

        // Regex pour extraire les appels d'outils
        const toolRegex = /<tool>\s*name:\s*([^\n]+)\s*parameters:\s*([\s\S]*?)\s*<\/tool>/g;
        
        remainingText = remainingText.replace(toolRegex, (match, name, paramsText) => {
            // Parse les paramètres
            const parameters: Record<string, any> = {};
            const paramLines = paramsText.trim().split('\n');
            
            paramLines.forEach((line: string) => {
                const [key, ...valueParts] = line.trim().split(':');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join(':').trim();
                    // Tentative de conversion en nombre ou booléen si possible
                    parameters[key.trim()] = this.parseValue(value);
                }
            });

            toolCalls.push({ name: name.trim(), parameters });
            return ''; // Supprime l'appel d'outil du texte
        });

        return { toolCalls, remainingText: remainingText.trim() };
    }

    private parseValue(value: string): any {
        // Tente de convertir en nombre
        if (!isNaN(Number(value))) {
            return Number(value);
        }
        // Tente de convertir en booléen
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        // Sinon retourne la chaîne
        return value;
    }

    async generate(prompt: string, options: GenerateOptions = {}): Promise<AIResponse> {
        const { enableToolUse = false, maxToolCalls = 5 } = options;
        
        try {
            // Construit le prompt système si l'utilisation des tools est activée
            const systemPrompt = this.buildSystemPrompt(enableToolUse);
            const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUtilisateur: ${prompt}` : prompt;

            const response = await fetch(`${this.config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.config.modelName,
                    prompt: fullPrompt,
                    stream: false,
                    options: {
                        temperature: this.config.temperature,
                        num_predict: this.config.maxTokens,
                        stop: ["</tool>"],
                        raw: true
                    },
                    system: systemPrompt || undefined,
                    context: undefined,
                    keep_alive: "5m"
                })
            });


            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as OllamaResponse;
            const { toolCalls, remainingText } = this.parseToolCalls(data.response);

            // Si des tools sont appelés, les exécute
            const toolResults: ToolResult[] = [];
            if (toolCalls.length > 0 && toolCalls.length <= maxToolCalls) {
                for (const call of toolCalls) {
                    const result = await this.executeTool(call.name, call.parameters);
                    toolResults.push(result);
                }

                // Si des tools ont été utilisés, fait un nouvel appel avec les résultats
                if (toolResults.length > 0) {
                    const toolResultsText = toolResults
                        .map((result, index) => 
                            `Résultat de l'outil ${toolCalls[index].name}: ${JSON.stringify(result.data)}`)
                        .join('\n');

                    return this.generate(
                        `${prompt}\n\nRésultats des outils:\n${toolResultsText}`,
                        { enableToolUse: false } // Désactive les tools pour éviter une boucle infinie
                    );
                }
            }

            return {
                text: remainingText || data.response,
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                } : undefined,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`AI Generation failed: ${error.message}`);
            }
            throw error;
        }
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

    async executeTool(toolName: string, params: Record<string, any>): Promise<ToolResult> {
        return this.toolManager.executeTool(toolName, params);
    }
}
