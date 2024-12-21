import { Tool, AIConfig, AIResponse, ToolCall } from '../types';
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
        let prompt = '';

        // Description des outils
        if (tools.length > 0) {
            const toolDescriptions = tools.map(tool => {
                const params = tool.parameters.map(p => 
                    `    - ${p.name} (${p.type})${p.required ? ' [requis]' : ''}: ${p.description}`
                ).join('\n');

                return `
${tool.name}: ${tool.description}
Paramètres:
${params}`;
            }).join('\n\n');

            prompt += `Tu as accès aux outils suivants:
${toolDescriptions}

IMPORTANT: Pour utiliser un outil, tu DOIS suivre ces règles:
1. Utiliser EXACTEMENT le même nom d'outil que celui listé ci-dessus
2. Respecter le format suivant:

<tool>
name: [nom exact de l'outil]
parameters:
  [paramètre1]: [valeur1]
  [paramètre2]: [valeur2]
</tool>

`;
        }

        // Si un schéma de réponse est fourni
        if (responseSchema) {
            const schemaDescription = JSON.stringify(responseSchema.safeParse({}).error?.format(), null, 2);
            prompt += `
IMPORTANT: Ta réponse finale DOIT être un objet JSON valide qui respecte EXACTEMENT ce format :
${schemaDescription}

Exemple de réponse valide :
{
    "title": "OpenAI",
    "description": "Une entreprise d'IA",
    "url": "https://openai.com",
    "relevance": 100
}

Instructions pour la réponse JSON :
1. Utilise d'abord les outils nécessaires pour collecter les informations
2. Une fois que tu as toutes les informations, fournis UNIQUEMENT l'objet JSON comme réponse finale
3. Ne mets PAS de texte avant ou après l'objet JSON
4. Assure-toi que toutes les propriétés sont des chaînes de caractères simples, pas des objets
5. Vérifie que les types de données sont corrects (string pour le texte, number pour les nombres)
6. Ne mets pas de commentaires dans le JSON
7. Ne mets pas d'accolades supplémentaires
8. Assure-toi que le JSON est bien formaté et valide
9. Commence ta réponse par { et termine-la par }

Exemple de réponse INVALIDE :
{
    "title": { "text": "OpenAI" },  // NON : utilise une chaîne simple
    "description": { "content": "Une entreprise d'IA" },  // NON : pas d'objets imbriqués
    "url": { "href": "https://openai.com" },  // NON : juste l'URL en texte
    "relevance": "100"  // NON : utilise un nombre, pas une chaîne
}

N'oublie pas :
- Pas de texte avant ou après le JSON
- Pas de commentaires dans le JSON
- Pas d'objets imbriqués, juste des valeurs simples
- Les nombres doivent être des nombres, pas des chaînes
`;
        } else {
            prompt += `
Instructions pour la réponse :
1. Utilise les outils nécessaires pour effectuer la tâche
2. Après avoir utilisé un outil, attends son résultat
3. Utilise le résultat pour répondre à la question
4. Fournis une réponse claire et concise
`;
        }

        prompt += `
Après l'utilisation d'un outil, attends son résultat avant de continuer.`;

        return prompt;
    }

    private convertToolCallsToResults(toolCalls?: ToolCall[]): ToolCallResult[] | undefined {
        if (!toolCalls) return undefined;
        return toolCalls.map(call => ({
            name: call.name,
            tool: call.name,
            parameters: call.parameters,
            result: undefined // Sera rempli plus tard
        }));
    }

    private async executeWithRetry<T>(
        client: AIClient,
        prompt: string,
        schema?: z.ZodType<T>,
        maxRetries: number = this.maxRetries,
        attempt: number = 1,
        toolResults: ToolCallResult[] = []
    ): Promise<ExecuteResult<T>> {
        const response = await client.generate(prompt, { enableToolUse: true });
        const newToolResults = this.convertToolCallsToResults(response.toolCalls);

        // Exécution des tools
        if (newToolResults) {
            for (const call of newToolResults) {
                const result = await client.executeTool(call.name.toLowerCase(), call.parameters);
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
                    const retryMessage = `${prompt}\n\nRappel : Ta réponse doit être un objet JSON valide qui commence par { et se termine par }. N'ajoute pas de texte avant ou après le JSON.`;
                    return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults);
                }
                // Sinon on retourne l'erreur
                return {
                    response: response.text,
                    validationError: 'La réponse doit être un objet JSON valide qui commence par { et se termine par }',
                    toolCalls: toolResults
                };
            }

            try {
                jsonResponse = JSON.parse(jsonMatch[0]);
            } catch (parseError) {
                // Si on a encore des tentatives, on réessaie
                if (attempt < maxRetries) {
                    const retryMessage = `${prompt}\n\nRappel : Le JSON fourni n'est pas valide. Assure-toi qu'il est bien formaté et ne contient pas de commentaires.`;
                    return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults);
                }
                // Sinon on retourne l'erreur
                return {
                    response: response.text,
                    validationError: 'Le JSON fourni n\'est pas valide',
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
                    return `${path ? path + ' : ' : ''}${e.message}`;
                }).join('\n');
                const retryMessage = `${prompt}\n\nRappel : Le JSON n'est pas valide :\n${errors}`;
                return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults);
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
                const retryMessage = `${prompt}\n\nRappel : ${error instanceof Error ? error.message : 'La réponse doit être un JSON valide'}`;
                return this.executeWithRetry(client, retryMessage, schema, maxRetries, attempt + 1, toolResults);
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

            // Construction du prompt système
            const systemPrompt = this.buildSystemPrompt(tools, responseSchema);
            const fullPrompt = `${systemPrompt}\n\n${prompt}`;

            // Exécution avec retry si nécessaire
            return await this.executeWithRetry<T>(
                client,
                fullPrompt,
                responseSchema,
                maxRetries
            );
        } catch (error) {
            throw new Error(`Erreur d'exécution : ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }
    }
}
