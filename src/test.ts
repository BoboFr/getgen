import { Agent } from './core/Agent';
import { z } from 'zod';
import { Tool } from './types';

// Configuration de base commune pour les agents
const baseConfig = {
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxtokens: 2048
};

async function testSimpleChat() {
    console.log('=== Test du Chat Simple ===');
    const chatAgent = new Agent({
        ...baseConfig,
        modelName: 'llama3.2:latest',
        temperature: 0.8 // Plus créatif pour la conversation
    });

    try {
        const chatResponse = await chatAgent.chat([
            { role: 'system', content: 'Tu es un assistant francophone expert en programmation.' },
            { role: 'user', content: 'Peux-tu m\'expliquer ce qu\'est TypeScript en quelques phrases ?' }
        ]);
        console.log('=== Réponse du chat ===\n');
        console.log(chatResponse.content);
        console.log('\n=== Historique complet du chat ===');
        chatResponse.history.forEach((msg) => {
            if (typeof msg === 'object' && msg.role && msg.content) {
                console.log(`\n[${msg.role}]: ${msg.content}`);
            }
        });

        const suiteResponse = await chatAgent.chat([...chatResponse.history, {
            role: 'user',
            content: 'Fais un exemple complet ?'
        }]);
        console.log('=== Suite du chat ===\n');
        console.log(suiteResponse.content);
        console.log('\n=== Historique complet du chat ===');
        suiteResponse.history.forEach((msg) => {
            if (typeof msg === 'object' && msg.role && msg.content) {
                console.log(`\n[${msg.role}]: ${msg.content}`);
            }
        });

    } catch (error) {
        console.error('Erreur lors du chat:', error);
    }
}

async function testToolChat() {
    console.log('\n=== Test du Chat avec Outils ===');
    const toolAgent = new Agent({
        ...baseConfig,
        modelName: 'llama3.2:latest',
        temperature: 0.2 // Plus précis pour les calculs
    });

    // Créer un outil de calcul simple
    const calculatorTool: Tool = {
        name: 'calculator',
        description: 'Effectue des opérations mathématiques simples',
        parameters: [
            {
                name: 'a',
                type: 'number',
                description: 'Premier nombre',
                required: true
            },
            {
                name: 'b',
                type: 'number',
                description: 'Deuxième nombre',
                required: true
            },
            {
                name: 'operation',
                type: 'string',
                description: 'Opération à effectuer (add, subtract, multiply, divide)',
                required: true
            }
        ],
        execute: async (params: Record<string, any>) => {
            const { a, b, operation } = params;
            switch (operation) {
                case 'add':
                    return { result: a + b };
                case 'subtract':
                    return { result: a - b };
                case 'multiply':
                    return { result: a * b };
                case 'divide':
                    if (b === 0) throw new Error('Division par zéro impossible');
                    return { result: a / b };
                default:
                    throw new Error('Opération non supportée');
            }
        }
    };

    // Ajouter l'outil à l'agent
    toolAgent.addTools([calculatorTool]);

    try {
        // Test simple avec un calcul
        const chatResponse = await toolAgent.chat([
            { 
                role: 'system', 
                content: 'Tu es un assistant mathématique. Utilise l\'outil calculator pour effectuer les calculs.' 
            },
            { 
                role: 'user', 
                content: 'Peux-tu calculer 15 + 27 et me donner le résultat ?' 
            }
        ], { 
            temperature: 0.2,
            stream: false,
            model: 'llama3.2:latest'
        });
        console.log('=== Réponse du chat avec outils ===\n');
        console.log(chatResponse.content);
        console.log('\n=== Historique du chat avec outils ===');
        chatResponse.history.forEach((msg) => {
            console.log(`\n[${msg.role}]: ${msg.content}`);
        });

        // Test avec une conversation plus complexe
        const complexChatResponse = await toolAgent.chat([
            { 
                role: 'system', 
                content: 'Tu es un assistant mathématique. Utilise l\'outil calculator pour effectuer les calculs.' 
            },
            { 
                role: 'user', 
                content: 'J\'ai besoin de faire plusieurs calculs : \n1. Additionne 10 et 5\n2. Multiplie le résultat par 3' 
            }
        ], { 
            temperature: 0.2,
            stream: false,
            model: 'llama3.2:latest'
        });
        console.log('\n=== Réponse du chat complexe avec outils ===\n');
        console.log(complexChatResponse.content);
        console.log('\n=== Historique du chat complexe ===');
        complexChatResponse.history.forEach((msg) => {
            console.log(`\n[${msg.role}]: ${msg.content}`);
        });

    } catch (error) {
        console.error('Erreur lors du chat avec outils:', error);
    }
}

async function testSchemaGeneration() {
    console.log('\n=== Test de Generate avec Schema ===');
    const schemaAgent = new Agent({
        ...baseConfig,
        modelName: 'llama3.2:latest',
        temperature: 0.5 // Équilibre entre créativité et structure
    });

    // Définir un schéma pour la réponse
    const codeExampleSchema = z.object({
        language: z.string(),
        code: z.string(),
        explanation: z.string()
    });

    try {
        const generateResponse = await schemaAgent.executeWithSchema(
            codeExampleSchema,
            {
                prompt: `Donne-moi un exemple simple de code TypeScript qui montre l'utilisation des types.
                        Format de réponse attendu:
                        {
                            "language": "typescript",
                            "code": "le code ici",
                            "explanation": "explication du code"
                        }`
            }
        );
        console.log('Réponse structurée:', generateResponse.parsedResponse);
    } catch (error) {
        console.error('Erreur lors de la génération:', error);
    }
}

async function main() {
    try {
        await testSimpleChat();
        /*await testToolChat();
        await testSchemaGeneration();*/
    } catch (error) {
        console.error('Erreur dans le programme principal:', error);
    }
}

main().catch(console.error);