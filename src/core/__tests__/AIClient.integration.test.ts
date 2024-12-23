import { AIClient } from '../AIClient';
import { Tool } from '../../types';

describe('AIClient Integration Tests', () => {
    let client: AIClient;

    beforeEach(() => {
        client = new AIClient({
            baseUrl: 'http://localhost:11434',
            modelName: 'qwen2',
            temperature: 0.7,
            maxTokens: 2048
        });
    });

    it('devrait générer une réponse simple sans tools', async () => {
        // Act
        const result = await client.generate('Quelle est la capitale de la France ?');

        // Assert
        expect(result.text).toBeTruthy();
    }, 60000);  // Timeout augmenté à 60s car l'appel à l'API peut être lent

    it('devrait utiliser un tool simple', async () => {
        // Arrange
        let calledExpression = '';
        const mockExecute = jest.fn().mockImplementation(async (params) => {
            calledExpression = params.expression;
            const result = eval(params.expression);
            return { success: true, data: result };
        });

        const mockTool: Tool = {
            name: 'calculatrice',
            description: 'Effectue des calculs mathématiques simples',
            parameters: [{
                name: 'expression',
                type: 'string',
                description: 'L\'expression mathématique à calculer',
                required: true
            }],
            execute: mockExecute
        };
        client.addTool(mockTool);

        // Act
        const result = await client.generate(
            'Calcule 123 + 456 en utilisant l\'outil calculatrice.',
            { enableToolUse: true }
        );

        // Debug
        console.log('Response:', result);

        // Assert
        expect(result.text).toBeTruthy();
        expect(mockExecute).toHaveBeenCalled();
        expect(calledExpression).toMatch(/123\s*\+\s*456/);
        expect(result.toolCalls).toBeDefined();
        expect(result.toolCalls?.length).toBeGreaterThan(0);
        expect(result.toolCalls![0].name).toBe('calculatrice');
    }, 60000);

    it('devrait gérer plusieurs appels de tools', async () => {
        // Arrange
        const calledTexts: string[] = [];
        const mockExecute = jest.fn().mockImplementation(async (params) => {
            calledTexts.push(params.text.replace(/"/g, ''));  // Retire les guillemets
            return { success: true, data: params.text.length };
        });

        const counterTool: Tool = {
            name: 'counter',
            description: 'Compte le nombre de caractères dans une chaîne',
            parameters: [{
                name: 'text',
                type: 'string',
                description: 'Le texte à compter',
                required: true
            }],
            execute: mockExecute
        };
        client.addTool(counterTool);

        // Act
        const result = await client.generate(
            'Compte le nombre de caractères dans "Hello" puis dans "World" en utilisant l\'outil counter.',
            { enableToolUse: true }
        );

        // Debug
        console.log('Response:', result);

        // Assert
        expect(result.text).toBeTruthy();
        expect(mockExecute).toHaveBeenCalled();
        expect(calledTexts).toContain('Hello');
        expect(calledTexts).toContain('World');
        expect(result.toolCalls).toBeDefined();
        expect(result.toolCalls?.length).toBeGreaterThan(0);
        expect(result.toolCalls![0].name).toBe('counter');
    }, 60000);
});
