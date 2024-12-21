import { Tool, ToolResult } from '../../types';

export class ToolManager {
    private tools: Map<string, Tool>;

    constructor() {
        this.tools = new Map();
    }

    addTool(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool with name '${tool.name}' already exists`);
        }
        this.tools.set(tool.name, tool);
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

    async executeTool(toolName: string, params: Record<string, any>): Promise<ToolResult> {
        try {
            const tool = this.tools.get(toolName);
            if (!tool) {
                return {
                    success: false,
                    error: `Tool '${toolName}' not found`
                };
            }

            // Validation des paramètres
            for (const param of tool.parameters) {
                if (param.required && !(param.name in params)) {
                    return {
                        success: false,
                        error: `Missing required parameter '${param.name}' for tool '${toolName}'`
                    };
                }
            }

            const result = await tool.execute(params);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    getToolSchema(toolName: string): Tool | undefined {
        return this.tools.get(toolName);
    }
}
