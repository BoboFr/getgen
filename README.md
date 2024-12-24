# GetGen AI Agent

## Overview

GetGen is a TypeScript-based AI agent library that leverages the Zod schema validation library to create type-safe and reliable AI interactions.

## GitHub Repository

### Please feel free to contribute, any help is welcome

[https://github.com/BoboFr/getgen](https://github.com/BoboFr/getgen)

## Features

- Supports AI model interactions with schema-based response validation
- Easy-to-use Agent class for executing AI prompts
- Built-in type safety with Zod schemas
- Extensible tool system for custom functionality
- Chat-based interactions with AI models

## Installation

```bash
npm install getgenai
```

## Quick Start

```typescript
import {z} from 'zod'
import { Agent } from 'getgenai';

// Create an agent with a specific model
const agent = new Agent({
    modelName: 'qwen2:latest'
});

// Define a response schema
const searchResponseSchema = z.object({
    capital: z.string(),
    population: z.number(),
});

// Execute an AI prompt with schema validation
const res = await agent.executeWithSchema(searchResponseSchema, {
    prompt: 'What is the capital of France?'
});
console.log(res);
```

## Tool System

GetGen includes a powerful tool system that allows you to create custom tools for your AI agents. Here's how tools are structured:

### Tool Usage Example

Here's how to create and use a simple tool:

```typescript
import { Tool, ToolParameter } from 'getgenai';

// Define a simple calculator tool
const calculatorTool: Tool = {
    name: 'calculator',
    description: 'Performs basic arithmetic operations',
    parameters: [
        {
            name: 'operation',
            type: 'string',
            description: 'The operation to perform (add, subtract, multiply, divide)',
            required: true
        },
        {
            name: 'a',
            type: 'number',
            description: 'First number',
            required: true
        },
        {
            name: 'b',
            type: 'number',
            description: 'Second number',
            required: true
        }
    ],
    // The execute function is required and must return a Promise
    execute: async (params: Record<string, any>): Promise<any> => {
        const { operation, a, b } = params;
        let result;
        
        switch (operation) {
            case 'add':
                result = a + b;
                break;
            case 'subtract':
                result = a - b;
                break;
            case 'multiply':
                result = a * b;
                break;
            case 'divide':
                if (b === 0) throw new Error('Division by zero');
                result = a / b;
                break;
            default:
                throw new Error('Invalid operation');
        }
        
        return {
            success: true,
            data: result
        };
    }
};

// Use the tool
const result = await calculatorTool.execute({
    operation: 'add',
    a: 5,
    b: 3
});
console.log(result); // { success: true, data: 8 }
```

## Chat Functionality

GetGen now supports chat-based interactions with AI models. Here's how to use the chat functionality:

```typescript
import { Agent } from 'getgenai';

// Create a chat agent
const chatAgent = new Agent({
    modelName: 'llama3.2:latest',
    temperature: 0.8
});

// Simple chat interaction
const chatResponse = await chatAgent.chat([
    { role: 'system', content: 'You are a programming expert.' },
    { role: 'user', content: 'What is TypeScript?' }
]);

// Access the response
console.log(chatResponse.content);  // Latest response
console.log(chatResponse.history);  // Full chat history

// Continue the conversation
const followUpResponse = await chatAgent.chat([
    ...chatResponse.history,
    { role: 'user', content: 'Can you show me an example?' }
]);
```

### Chat with Tools

You can also use tools in your chat interactions:

```typescript
// Create a tool-enabled agent
const toolAgent = new Agent({
    modelName: 'llama3.2:latest',
    temperature: 0.2
});

// Add tools to the agent
toolAgent.addTools([myTool]);

// Chat with tool usage
const toolChatResponse = await toolAgent.chat([
    { 
        role: 'system', 
        content: 'You are an assistant that can use tools.' 
    },
    { 
        role: 'user', 
        content: 'Help me with a task that requires tools.' 
    }
]);
```

The chat functionality maintains conversation history and allows for natural, multi-turn interactions with the AI model while supporting tool usage when needed.

## Dependencies

- Zod
- TypeScript

## Contributing

We welcome contributions to GetGenAI! Here's how you can help:

### Ways to Contribute

1. **Reporting Bugs**
   - Use GitHub Issues to report bugs
   - Provide a clear and detailed description
   - Include steps to reproduce, expected behavior, and actual behavior
   - Attach code samples or screenshots if possible

2. **Feature Requests**
   - Open a GitHub Issue for new feature suggestions
   - Describe the proposed feature and its potential benefits
   - Discuss the feature's alignment with the project's goals

3. **Code Contributions**
   - Fork the repository
   - Create a new branch for your feature or bugfix
   - Follow our coding standards:
     - Use TypeScript
     - Maintain consistent code style
     - Write comprehensive tests
     - Update documentation

### Development Setup

1. Clone the repository
   ```bash
   git clone https://github.com/BoboFr/getgenai.git
   cd getgenai
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run dev
   ```bash
   npm run dev
   ```

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Collaborate openly and transparently

### Questions?

If you have any questions, please open an issue or contact the maintainers directly.