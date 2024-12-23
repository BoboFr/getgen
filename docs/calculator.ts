import { Tool, ToolParameter } from '../src/types';
import { ToolFactory } from '../src/core/tools/ToolFactory';

/**
 * Example of a calculator tool implementation using both direct Tool interface
 * and ToolFactory approaches
 */

// 1. Direct Tool interface implementation
export const calculatorTool: Tool = {
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
    execute: async (params: Record<string, any>): Promise<any> => {
        const { operation, a, b } = params;
        let result: number;
        
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
                if (b === 0) {
                    return {
                        success: false,
                        error: 'Division by zero is not allowed'
                    };
                }
                result = a / b;
                break;
            default:
                return {
                    success: false,
                    error: `Invalid operation: ${operation}. Supported operations are: add, subtract, multiply, divide`
                };
        }
        
        return {
            success: true,
            data: result
        };
    }
};

// 2. ToolFactory implementation
export const createCalculatorToolWithFactory = () => {
    return ToolFactory.fromFunction(
        async (operation: string, a: number, b: number): Promise<number> => {
            switch (operation) {
                case 'add':
                    return a + b;
                case 'subtract':
                    return a - b;
                case 'multiply':
                    return a * b;
                case 'divide':
                    if (b === 0) {
                        throw new Error('Division by zero is not allowed');
                    }
                    return a / b;
                default:
                    throw new Error(`Invalid operation: ${operation}`);
            }
        },
        {
            name: 'calculator',
            description: 'Performs basic arithmetic operations',
            parameters: {
                operation: {
                    type: 'string',
                    description: 'The operation to perform (add, subtract, multiply, divide)',
                    required: true
                },
                a: {
                    type: 'number',
                    description: 'First number',
                    required: true
                },
                b: {
                    type: 'number',
                    description: 'Second number',
                    required: true
                }
            }
        }
    );
};

// Example usage:
async function example() {
    // Using direct implementation
    const result1 = await calculatorTool.execute({
        operation: 'add',
        a: 5,
        b: 3
    });
    console.log('Direct implementation result:', result1);

    // Using ToolFactory implementation
    const calculatorToolFromFactory = createCalculatorToolWithFactory();
    const result2 = await calculatorToolFromFactory.execute({
        operation: 'multiply',
        a: 4,
        b: 2
    });
    console.log('ToolFactory implementation result:', result2);
}

// Uncomment to run the example
// example().catch(console.error);
