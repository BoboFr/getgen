import { Tool } from '../types';
import { Agent } from './Agent';

export function createAgentTool(agent: Agent, name: string, description: string): Tool {
    return {
        name,
        description,
        parameters: [
            {
                name: 'prompt',
                type: 'string',
                description: 'Le prompt à envoyer à l\'agent',
                required: true
            }
        ],
        execute: async (params: Record<string, any>) => {
            const result = await agent.execute({
                prompt: params.prompt,
            });

            // Si l'agent a utilisé des tools, on les inclut dans le résultat
            if (result.toolCalls) {
                return {
                    response: result.response,
                    toolResults: result.toolCalls.map(call => ({
                        tool: call.tool,
                        result: call.result
                    }))
                };
            }

            return result.response;
        }
    };
}
