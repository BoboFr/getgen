import { Tool, ToolResult } from '../../types';

export class ToolManager {
    private tools: Map<string, Tool> = new Map();

    constructor() {
        this.tools = new Map();
    }

    addTool(tool: Tool): void {
        console.log('ToolManager: Adding tool:', tool.name);
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool with name '${tool.name}' already exists`);
        }
        this.tools.set(tool.name, tool);
        console.log('ToolManager: Current tools:', this.listTools());
    }

    removeTool(toolName: string): void {
        if (!this.tools.has(toolName)) {
            throw new Error(`Tool '${toolName}' not found`);
        }
        this.tools.delete(toolName);
    }

    listTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    async executeTool(name: string, parameters: Record<string, any>): Promise<ToolResult> {
        console.log('ToolManager: Executing tool:', name, 'with parameters:', parameters);
        try {
            const tool = this.tools.get(name);
            if (!tool) {
                return {
                    success: false,
                    error: `Tool '${name}' not found`
                };
            }

            // Validation des paramètres
            for (const param of tool.parameters) {
                if (param.required && !(param.name in parameters)) {
                    return {
                        success: false,
                        error: `Missing required parameter '${param.name}' for tool '${name}'`
                    };
                }
            }

            const result = await tool.execute(parameters);
            console.log('ToolManager: Tool execution result:', result);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('ToolManager: Tool execution error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    getToolSchema(toolName: string): Tool | undefined {
        return this.tools.get(toolName);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }
}
