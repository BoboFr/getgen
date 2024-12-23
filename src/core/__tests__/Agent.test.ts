import { Agent } from '../Agent';
import { AIClient } from '../AIClient';
import { Tool } from '../../types';
import { z } from 'zod';

jest.mock('../AIClient');

describe('Agent', () => {
    let agent: Agent;
    let mockAIClient: jest.Mocked<AIClient>;

    beforeEach(() => {
        jest.clearAllMocks();
        agent = new Agent({
            modelName: 'test-model',
            maxRetries: 3,
            baseUrl: 'http://test-api.com'
        });
    });

    describe('executeWithSchema', () => {
        it('devrait valider une réponse correcte', async () => {
            // Arrange
            const schema = z.object({
                name: z.string(),
                age: z.number()
            });

            (AIClient as jest.MockedClass<typeof AIClient>).prototype.generate.mockResolvedValueOnce({
                text: JSON.stringify({ name: 'John', age: 30 })
            });

            // Act
            const result = await agent.executeWithSchema(schema, {
                prompt: 'Test prompt'
            });

            // Assert
            expect(result.parsedResponse).toEqual({ name: 'John', age: 30 });
            expect(AIClient.prototype.generate).toHaveBeenCalledTimes(1);
        });

        it('devrait réessayer en cas de réponse invalide', async () => {
            // Arrange
            const schema = z.object({
                name: z.string(),
                age: z.number()
            });

            (AIClient as jest.MockedClass<typeof AIClient>).prototype.generate
                .mockResolvedValueOnce({ text: 'Invalid JSON' })
                .mockResolvedValueOnce({ text: JSON.stringify({ name: 'John', age: 30 }) });

            // Act
            const result = await agent.executeWithSchema(schema, {
                prompt: 'Test prompt'
            });

            // Assert
            expect(result.parsedResponse).toEqual({ name: 'John', age: 30 });
            expect(AIClient.prototype.generate).toHaveBeenCalledTimes(2);
        });

        it('devrait retourner une erreur après le nombre maximum de tentatives', async () => {
            // Arrange
            const schema = z.object({
                name: z.string(),
                age: z.number()
            });

            (AIClient as jest.MockedClass<typeof AIClient>).prototype.generate
                .mockResolvedValue({ text: 'Invalid JSON' });

            // Act
            const result = await agent.executeWithSchema(schema, {
                prompt: 'Test prompt'
            });

            // Assert
            expect(result.validationError).toBeDefined();
            expect(AIClient.prototype.generate).toHaveBeenCalledTimes(3);
        });
    });

    describe('executeRaw', () => {
        it('devrait retourner la réponse brute', async () => {
            // Arrange
            (AIClient as jest.MockedClass<typeof AIClient>).prototype.generate
                .mockResolvedValueOnce({ text: 'Raw response' });

            // Act
            const result = await agent.executeRaw({
                prompt: 'Test prompt'
            });

            // Assert
            expect(result.response).toBe('Raw response');
            expect(AIClient.prototype.generate).toHaveBeenCalledTimes(1);
        });

        it('devrait propager les erreurs', async () => {
            // Arrange
            (AIClient as jest.MockedClass<typeof AIClient>).prototype.generate
                .mockRejectedValueOnce(new Error('AI error'));

            // Act & Assert
            await expect(agent.executeRaw({
                prompt: 'Test prompt'
            })).rejects.toThrow('Erreur d\'exécution');
        });
    });

    describe('Tool Management', () => {
        it('devrait ajouter des tools', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };

            // Act
            agent.addTools([mockTool]);

            // Assert
            expect(agent.listTools()).toContainEqual(mockTool);
        });

        it('devrait exécuter les tools lors de la génération', async () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [{
                    name: 'param',
                    type: 'string',
                    description: 'Test parameter',
                    required: true
                }],
                execute: jest.fn().mockResolvedValue('Tool result')
            };

            agent.addTools([mockTool]);

            (AIClient as jest.MockedClass<typeof AIClient>).prototype.generate
                .mockResolvedValueOnce({
                    text: `<tool>
name: testTool
parameters:
  param: test
</tool>
Final response`,
                    toolCalls: [{
                        name: 'testTool',
                        parameters: { param: 'test' }
                    }]
                })
                .mockResolvedValueOnce({ text: 'Response with tool result' });

            (AIClient as jest.MockedClass<typeof AIClient>).prototype.executeTool
                .mockResolvedValueOnce({ success: true, data: 'Tool result' });

            // Act
            const result = await agent.executeRaw({
                prompt: 'Test prompt'
            });

            // Assert
            expect(result.response).toBe(`<tool>
name: testTool
parameters:
  param: test
</tool>
Final response`);
            expect(AIClient.prototype.executeTool).toHaveBeenCalledWith('testtool', { param: 'test' });
        });
    });
});
