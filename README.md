# GetGen

Un framework TypeScript moderne pour créer des applications d'intelligence artificielle avec Ollama.

## 🌟 Caractéristiques

- 🚀 Framework léger et performant
- 🔧 Outils d'IA intégrés
- 📦 Support complet de TypeScript
- ⚡ Intégration native avec Ollama
- 🛡️ Validation des données avec Zod
- 🧪 Tests unitaires avec Jest

## 📋 Prérequis

- Node.js (v16 ou supérieur)
- TypeScript
- Ollama (installé et configuré sur votre machine)

## 🚀 Installation

```bash
npm install getgen
```

## 🛠️ Configuration

1. Créez un fichier `.env` à la racine de votre projet
2. Configurez vos variables d'environnement :

```env
OLLAMA_HOST=http://localhost:11434
```

## 📖 Guide d'utilisation

### Configuration de base

```typescript
import { Agent } from 'getgen';

// Configuration personnalisée
const agent = new Agent({
    modelName: 'llama3.2:3b',    // Modèle Ollama à utiliser
    baseUrl: 'http://localhost:11434', // URL de l'API Ollama
    temperature: 0.7,          // Contrôle de la créativité
    maxtokens: 2048,          // Limite de tokens par réponse
    maxRetries: 3             // Tentatives en cas d'erreur
});
```

### Utilisation avec validation Zod

```typescript
import { z } from 'zod';

// Définition d'un schéma de validation
const searchResponseSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    url: z.string().url(),
    relevance: z.number().min(0).max(100)
});

// Exécution avec validation du schéma
async function searchInfo() {
    const result = await agent.executeWithSchema(searchResponseSchema, {
        prompt: "Recherche des informations sur TurboSelf"
    });

    if (result.validationError) {
        console.log('❌ Erreur :', result.validationError);
    } else if (result.parsedResponse) {
        console.log('✅ Résultat :', result.parsedResponse);
    }

    // Affichage des outils utilisés
    if (result.toolCalls) {
        result.toolCalls.forEach(call => {
            console.log(`🔧 Outil : ${call.tool}`);
            console.log(`   Paramètres :`, call.parameters);
            console.log(`   Résultat :`, call.result);
        });
    }
}
```

### Gestion des outils

```typescript
import { Tool } from 'getgen';

// Définition d'un outil
const searchTool: Tool = {
    name: 'search',
    description: 'Recherche des informations sur le web',
    parameters: [
        {
            name: 'query',
            type: 'string',
            description: 'Terme de recherche',
            required: true
        }
    ]
};

// Ajout d'outils à l'agent
agent.addTools([searchTool]);

// Liste des outils disponibles
const tools = agent.listTools();
```

### Exécution sans schéma

```typescript
// Exécution simple sans validation
const result = await agent.executeRaw({
    prompt: "Quelle est la capitale de la France ?",
    tools: [] // Optionnel : liste d'outils à utiliser
});

console.log('Réponse :', result.response);
```

## 🏗️ Structure du projet

```
getgen/
├── src/
│   ├── core/       # Composants principaux
│   │   ├── Agent.ts     # Agent principal
│   │   └── AIClient.ts  # Client Ollama
│   ├── tools/      # Outils d'IA
│   ├── types/      # Définitions de types
│   └── index.ts    # Point d'entrée
├── tests/          # Tests unitaires
└── ...
```

## 🧪 Tests

Le framework utilise Jest pour les tests unitaires. Pour exécuter les tests :

```bash
npm test
```

## 📚 Documentation API

### Classe Agent

#### Constructor
```typescript
new Agent(options?: AgentOptions)
```
- `options.modelName`: Nom du modèle Ollama (défaut: 'llama3.2:3b')
- `options.baseUrl`: URL de l'API Ollama (défaut: 'http://localhost:11434')
- `options.temperature`: Température des réponses (défaut: 0.7)
- `options.maxtokens`: Limite de tokens (défaut: 2048)
- `options.maxRetries`: Nombre max de tentatives (défaut: 3)

#### Méthodes
- `addTools(tools: Tool[])`: Ajoute des outils à l'agent
- `listTools()`: Retourne la liste des outils disponibles
- `executeWithSchema<S>(schema: S, options: ExecuteOptions)`: Exécute avec validation
- `executeRaw(options: ExecuteOptions)`: Exécute sans validation

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push sur la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence ISC. Voir le fichier `LICENSE` pour plus de détails.

## ✨ Auteurs

- [Votre nom]

## 🙏 Remerciements

- Ollama pour leur excellent modèle d'IA
- La communauté TypeScript
- Tous les contributeurs