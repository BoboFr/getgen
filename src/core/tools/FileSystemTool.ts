import { Tool, ToolParameter } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileSystemTool implements Tool {
    name = 'filesystem';
    description = 'Outil pour interagir avec le système de fichiers';
    parameters: ToolParameter[] = [
        {
            name: 'action',
            type: 'string',
            description: 'Action à effectuer (readFile, writeFile, listDir)',
            required: true
        },
        {
            name: 'path',
            type: 'string',
            description: 'Chemin du fichier ou du dossier',
            required: true
        },
        {
            name: 'content',
            type: 'string',
            description: 'Contenu à écrire dans le fichier (pour writeFile)',
            required: false
        }
    ];

    async execute(params: Record<string, any>): Promise<any> {
        const { action, path: filePath, content } = params;

        switch (action) {
            case 'readFile':
                return this.readFile(filePath);
            case 'writeFile':
                if (!content) {
                    throw new Error('Content is required for writeFile action');
                }
                return this.writeFile(filePath, content);
            case 'listDir':
                return this.listDir(filePath);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    private async readFile(filePath: string): Promise<string> {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async writeFile(filePath: string, content: string): Promise<void> {
        try {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
        } catch (error) {
            throw new Error(`Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async listDir(dirPath: string): Promise<string[]> {
        try {
            return await fs.readdir(dirPath);
        } catch (error) {
            throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
