import { AIClient } from '../AIClient';
import { Tool } from '../../types';

// Mock de fetch global
const globalFetch = global.fetch;

describe('AIClient', () => {
    let client: AIClient;
    const mockConfig = {
        modelName: 'test-model',
        baseUrl: 'http://test-api.com',
        temperature: 0.7,
        maxTokens: 1000
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock de fetch
        global.fetch = jest.fn();
        client = new AIClient({
            modelName: 'test-model',
            baseUrl: 'http://test-api.com'
        });
        // Reset fetch mock
        (global.fetch as jest.Mock).mockReset();
    });

    afterEach(() => {
        // Restauration de fetch
        global.fetch = globalFetch;
    });

    describe('listModels', () => {
        it('devrait lister les modèles disponibles', async () => {
            // Arrange
            const mockModels = {
                models: [
                    { name: 'model1', type: 'type1' },
                    { name: 'model2', type: 'type2' }
                ]
            };
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(mockModels)
            });

            // Act
            const models = await client.listModels();

            // Assert
            expect(models).toHaveLength(2);
            expect(models[0].name).toBe('model1');
            expect(models[1].name).toBe('model2');
            expect(global.fetch).toHaveBeenCalledWith(
                'http://test-api.com/api/tags'
            );
        });

        it('devrait gérer les erreurs HTTP', async () => {
            // Arrange
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404
            });

            // Act & Assert
            await expect(client.listModels()).rejects.toThrow('Failed to list models');
        });

        it('devrait gérer les erreurs réseau', async () => {
            // Arrange
            (global.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Network error')
            );

            // Act & Assert
            await expect(client.listModels()).rejects.toThrow('Failed to list models');
        });
    });

    describe('generate', () => {
        it('devrait générer une réponse sans tools', async () => {
            // Arrange
            const mockResponse = {
                response: 'Test response',
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30
                }
            };
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(mockResponse)
            });

            // Act
            const result = await client.generate('Test prompt');

            // Assert
            expect(result.text).toBe('Test response');
            expect(result.toolCalls).toBeUndefined();
            expect(result.usage).toEqual({
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30
            });
            expect(global.fetch).toHaveBeenCalledWith(
                'http://test-api.com/api/generate',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('test-model')
                })
            );
        });

        it('devrait gérer les appels aux tools', async () => {
            // Arrange
            const mockResponse = {
                message: `<tool>
name: testTool
parameters:
  param: test
</tool>
Final response`,
                done: true
            };
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(mockResponse)
            });

            // Mock pour le second appel après exécution du tool
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ 
                    message: 'Final response with tool result',
                    done: true
                })
            });

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
            client.addTool(mockTool);

            // Act
            const result = await client.generate('Test prompt', { enableToolUse: true });

            // Assert
            expect(result.text).toBe('Final response with tool result');
            expect(mockTool.execute).toHaveBeenCalledWith({ param: 'test' });
        });

        it('devrait ignorer les appels aux tools si enableToolUse est false', async () => {
            // Arrange
            const mockResponse = {
                message: `<tool>
name: testTool
parameters:
  param: test
</tool>
Final response`,
                done: true
            };

            (global.fetch as jest.Mock).mockImplementation(() => 
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(mockResponse)
                })
            );

            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [{
                    name: 'param',
                    type: 'string',
                    description: 'Test parameter',
                    required: true
                }],
                execute: jest.fn()
            };
            client.addTool(mockTool);

            // Act
            const result = await client.generate('Test prompt', { enableToolUse: false });

            // Assert
            expect(result.text).toBe(mockResponse.message);
            expect(mockTool.execute).not.toHaveBeenCalled();
        });

        it('devrait limiter le nombre d\'appels aux tools', async () => {
            // Arrange
            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        message: `<tool>
name: testTool
parameters:
  param: test1
</tool>`,
                        done: false
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        message: `<tool>
name: testTool
parameters:
  param: test2
</tool>`,
                        done: false
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        message: 'Final response',
                        done: true
                    })
                });

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
            client.addTool(mockTool);

            // Act
            const result = await client.generate('Test prompt', { enableToolUse: true, maxToolCalls: 2 });

            // Assert
            expect(result.text).toBe('Final response');
            expect(mockTool.execute).toHaveBeenCalledWith({ param: 'test1' });
            expect(mockTool.execute).toHaveBeenCalledWith({ param: 'test2' });
            expect(mockTool.execute).toHaveBeenCalledTimes(2);
        });

        it('devrait gérer les erreurs de l\'API', async () => {
            // Arrange
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            // Act & Assert
            await expect(client.generate('Test prompt')).rejects.toThrow('AI Generation failed');
        });

        it('devrait gérer les erreurs réseau', async () => {
            // Arrange
            (global.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Network error')
            );

            // Act & Assert
            await expect(client.generate('Test prompt')).rejects.toThrow('AI Generation failed');
        });

        it('devrait parser correctement différents types de valeurs de paramètres', async () => {
            // Arrange
            const mockResponse = {
                message: `<tool>
name: testTool
parameters:
  stringParam: test
  numberParam: 42
  booleanParam: true
  falseParam: false
</tool>
Final response`,
                done: true
            };
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(mockResponse)
            });

            // Mock pour le second appel après exécution du tool
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ 
                    message: 'Final response with tool result',
                    done: true
                })
            });

            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [{
                    name: 'stringParam',
                    type: 'string',
                    description: 'String parameter',
                    required: true
                }, {
                    name: 'numberParam',
                    type: 'number',
                    description: 'Number parameter',
                    required: true
                }, {
                    name: 'booleanParam',
                    type: 'boolean',
                    description: 'Boolean parameter',
                    required: true
                }, {
                    name: 'falseParam',
                    type: 'boolean',
                    description: 'False boolean parameter',
                    required: true
                }],
                execute: jest.fn().mockResolvedValue('Tool result')
            };
            client.addTool(mockTool);

            // Act
            await client.generate('Test prompt', { enableToolUse: true });

            // Assert
            expect(mockTool.execute).toHaveBeenCalledWith({
                stringParam: 'test',
                numberParam: 42,
                booleanParam: true,
                falseParam: false
            });
        });
    });

    describe('executeTool', () => {
        it('devrait exécuter un tool avec succès', async () => {
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
            client.addTool(mockTool);

            // Act
            const result = await client.executeTool('testTool', { param: 'test' });

            // Assert
            expect(result.success).toBe(true);
            expect(result.data).toBe('Tool result');
            expect(mockTool.execute).toHaveBeenCalledWith({ param: 'test' });
        });

        it('devrait gérer les erreurs d\'exécution des tools', async () => {
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
                execute: jest.fn().mockRejectedValue(new Error('Tool error'))
            };
            client.addTool(mockTool);

            // Act
            const result = await client.executeTool('testTool', { param: 'test' });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Tool error');
        });

        it('devrait gérer les tools non trouvés', async () => {
            // Act
            const result = await client.executeTool('nonExistentTool', {});

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('Tool \'nonExistentTool\' not found');
        });
    });

    describe('Tool Management', () => {
        it('devrait ajouter et lister les tools', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };

            // Act
            client.addTool(mockTool);
            const tools = client.listTools();

            // Assert
            expect(tools).toHaveLength(1);
            expect(tools[0]).toBe(mockTool);
        });

        it('devrait supprimer un tool', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };
            client.addTool(mockTool);

            // Act
            client.removeTool('testTool');
            const tools = client.listTools();

            // Assert
            expect(tools).toHaveLength(0);
        });

        it('devrait gérer la suppression d\'un tool inexistant', () => {
            // Act & Assert
            expect(() => client.removeTool('nonExistentTool')).toThrow();
        });
    });
});
