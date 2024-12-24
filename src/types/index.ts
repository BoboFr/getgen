import { z } from 'zod';

export interface AIConfig {
    modelName: string;
    baseUrl: string;
    temperature?: number;
    maxTokens?: number;
    debug?: boolean;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatOptions {
    messages: ChatMessage[];
    stream?: boolean;
    temperature?: number;
    model?: string;
}

export interface AIResponse {
    text: string;
    content?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    toolCalls?: ToolCall[];
    parsed?: any;
}

export interface ModelInfo {
    name: string;
    modified_at: string;
    size: number;
    digest: string;
}

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    items?: {
        type: string;
    };
}

export interface Tool {
    name: string;
    description: string;
    parameters: ToolParameter[];
    execute: (params: Record<string, any>) => Promise<any>;
}

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

// Types pour la création de tools à partir de fonctions
export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ParameterDefinition {
    type: ParameterType;
    description: string;
    required?: boolean;
    items?: {
        type: string;
    };
}

export interface FunctionToToolOptions {
    name: string;
    description: string;
    parameters: Record<string, ParameterDefinition>;
}

// Types pour la gestion autonome des tools
export interface ToolCall {
    name: string;
    parameters: Record<string, any>;
    result?: ToolResult;
}

export interface Usage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export type Schema<T> = {
    parse: (value: unknown) => T;
};

export interface GenerateOptions {
    enableToolUse?: boolean;
    maxToolCalls?: number;
    responseSchema?: z.ZodType<any>;
}
