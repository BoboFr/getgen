import { ToolManager } from '../ToolManager';
import { Tool } from '../../../types';

describe('ToolManager', () => {
    let toolManager: ToolManager;

    beforeEach(() => {
        toolManager = new ToolManager();
    });

    describe('addTool', () => {
        it('devrait ajouter un tool avec succès', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };

            // Act
            toolManager.addTool(mockTool);

            // Assert
            expect(toolManager.getToolSchema('testTool')).toBe(mockTool);
        });

        it('devrait rejeter les tools avec des noms en double', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };

            // Act & Assert
            toolManager.addTool(mockTool);
            expect(() => toolManager.addTool(mockTool)).toThrow('Tool with name \'testTool\' already exists');
        });
    });

    describe('removeTool', () => {
        it('devrait supprimer un tool existant', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };
            toolManager.addTool(mockTool);

            // Act
            toolManager.removeTool('testTool');

            // Assert
            expect(toolManager.getToolSchema('testTool')).toBeUndefined();
        });

        it('devrait échouer lors de la suppression d\'un tool inexistant', () => {
            // Act & Assert
            expect(() => toolManager.removeTool('nonExistentTool')).toThrow('Tool \'nonExistentTool\' not found');
        });
    });

    describe('listTools', () => {
        it('devrait retourner tous les tools', () => {
            // Arrange
            const mockTool1: Tool = {
                name: 'testTool1',
                description: 'Test tool 1',
                parameters: [],
                execute: jest.fn()
            };
            const mockTool2: Tool = {
                name: 'testTool2',
                description: 'Test tool 2',
                parameters: [],
                execute: jest.fn()
            };

            toolManager.addTool(mockTool1);
            toolManager.addTool(mockTool2);

            // Act
            const tools = toolManager.listTools();

            // Assert
            expect(tools).toHaveLength(2);
            expect(tools).toContainEqual(mockTool1);
            expect(tools).toContainEqual(mockTool2);
        });

        it('devrait retourner un tableau vide si aucun tool n\'est enregistré', () => {
            // Act
            const tools = toolManager.listTools();

            // Assert
            expect(tools).toHaveLength(0);
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
            toolManager.addTool(mockTool);

            // Act
            const result = await toolManager.executeTool('testTool', { param: 'test' });

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
            toolManager.addTool(mockTool);

            // Act
            const result = await toolManager.executeTool('testTool', { param: 'test' });

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Tool error');
        });

        it('devrait gérer les tools non trouvés', async () => {
            // Act
            const result = await toolManager.executeTool('nonExistentTool', {});

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain('Tool \'nonExistentTool\' not found');
        });

        it('devrait valider les paramètres requis', async () => {
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
                execute: jest.fn()
            };
            toolManager.addTool(mockTool);

            // Act
            const result = await toolManager.executeTool('testTool', {});

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toBe('Missing required parameter \'param\' for tool \'testTool\'');
            expect(mockTool.execute).not.toHaveBeenCalled();
        });
    });

    describe('getToolSchema', () => {
        it('devrait retourner le schéma d\'un tool existant', () => {
            // Arrange
            const mockTool: Tool = {
                name: 'testTool',
                description: 'Test tool',
                parameters: [],
                execute: jest.fn()
            };
            toolManager.addTool(mockTool);

            // Act
            const schema = toolManager.getToolSchema('testTool');

            // Assert
            expect(schema).toBe(mockTool);
        });

        it('devrait retourner undefined pour un tool non existant', () => {
            // Act
            const schema = toolManager.getToolSchema('nonExistentTool');

            // Assert
            expect(schema).toBeUndefined();
        });
    });
});
