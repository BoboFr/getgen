# GetGen AI Agent

## Overview

GetGen is a TypeScript-based AI agent library that leverages the Zod schema validation library to create type-safe and reliable AI interactions.

## Features

- Supports AI model interactions with schema-based response validation
- Easy-to-use Agent class for executing AI prompts
- Built-in type safety with Zod schemas

## Installation

```bash
npm install getgenai
```

## Quick Start

```typescript
import {z} from 'zod'
import { Agent } from './core';

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
   git clone https://github.com/yourusername/getgenai.git
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