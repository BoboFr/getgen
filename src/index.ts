import { Agent } from './core/Agent';
import { z } from 'zod';

function displayToolResults(toolCalls: any[], indent = '') {
    toolCalls.forEach(call => {
        console.log(`${indent}🔧 Outil utilisé : ${call.tool}`);
        console.log(`${indent}  Paramètres :`, call.parameters);
        console.log(`${indent}  Résultat :`, call.result);
        console.log();
    });
}

// Définition du schéma de réponse pour la recherche
const searchResponseSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    url: z.string().url(),
    relevance: z.number().min(0).max(100)
});

async function main() {
    // Agent de recherche avec l'outil de recherche web
    const searchAgent = new Agent();
    
    // Test de l'agent de recherche avec typage
    console.log('\n🔍 Recherche d\'informations sur ChatGPT :');
    const searchResult = await searchAgent.executeWithSchema(searchResponseSchema, {
        prompt: "Recherche des informations sur Microsoft's et retourne un résultat structuré"
    });

    // Affichage des résultats de recherche
    if (searchResult.validationError) {
        console.log('❌ Erreur :', searchResult.validationError);
    } else if (searchResult.parsedResponse) {
        console.log('\n✅ Résultat :');
        console.log(JSON.stringify(searchResult.parsedResponse, null, 2));
    }

    if (searchResult.toolCalls && searchResult.toolCalls.length > 0) {
        console.log('\n🛠️ Outils utilisés pour la recherche :');
        displayToolResults(searchResult.toolCalls);
    }
}

main().catch(console.error);