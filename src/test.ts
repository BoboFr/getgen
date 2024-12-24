import { Agent } from './core/Agent';
import { z } from 'zod';

async function main() {
    // Initialiser l'agent avec la configuration de base
    const agent = new Agent({
        modelName: 'llama3.2:latest',
        baseUrl: 'http://localhost:11434',
        temperature: 0.7,
        maxtokens: 2048
    });

    console.log('=== Test du Chat ===');
    try {
        const chatResponse = await agent.chat([
            { role: 'system', content: 'Tu es un assistant francophone expert en programmation.' },
            { role: 'user', content: 'Peux-tu m\'expliquer ce qu\'est TypeScript en quelques phrases ?' }
        ]);
        console.log('Réponse du chat:', chatResponse);
    } catch (error) {
        console.error('Erreur lors du chat:', error);
    }

    console.log('\n=== Test de Generate avec Schema ===');
    // Définir un schéma pour la réponse
    const codeExampleSchema = z.object({
        language: z.string(),
        code: z.string(),
        explanation: z.string()
    });

    try {
        const generateResponse = await agent.executeWithSchema(
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

// Exécuter le programme principal
main().catch(console.error);