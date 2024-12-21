import { Tool, ToolParameter, FunctionToToolOptions, ParameterDefinition } from '../../types';

export class ToolFactory {
    /**
     * Convertit une fonction en tool
     * @param fn Fonction à convertir
     * @param options Options de configuration du tool
     */
    static fromFunction(
        fn: (...args: any[]) => Promise<any> | any,
        options: FunctionToToolOptions
    ): Tool {
        // Conversion des définitions de paramètres en ToolParameter[]
        const parameters: ToolParameter[] = Object.entries(options.parameters).map(
            ([name, def]) => ({
                name,
                type: def.type,
                description: def.description,
                required: def.required ?? false,
                items: def.items
            })
        );

        // Création du tool
        const tool: Tool = {
            name: options.name,
            description: options.description,
            parameters,
            execute: async (params: Record<string, any>) => {
                try {
                    // Validation des paramètres requis
                    const missingParams = parameters
                        .filter(p => p.required && !(p.name in params))
                        .map(p => p.name);

                    if (missingParams.length > 0) {
                        throw new Error(`Missing required parameters: ${missingParams.join(', ')}`);
                    }

                    // Préparation des arguments dans l'ordre des paramètres
                    const args = parameters.map(p => params[p.name]);
                    
                    // Exécution de la fonction
                    return await Promise.resolve(fn(...args));
                } catch (error) {
                    throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        };

        return tool;
    }

    /**
     * Crée un tool à partir d'une fonction avec décorateur
     * @param options Options de configuration du tool
     */
    static createTool(options: FunctionToToolOptions) {
        return function (
            target: any,
            propertyKey: string,
            descriptor: PropertyDescriptor
        ) {
            const originalMethod = descriptor.value;
            const tool = ToolFactory.fromFunction(originalMethod, options);
            
            // Stockage des métadonnées du tool sur la méthode
            descriptor.value.tool = tool;
            
            return descriptor;
        };
    }
}
