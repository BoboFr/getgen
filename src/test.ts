
import {z} from 'zod'
import { Agent } from './core';

const agent = new Agent({
    modelName: 'qwen2:latest'
});

const searchResponseSchame = z.object({
    capital: z.string(),
    information: z.object({
        population: z.number(),
        area: z.number(),
        currency: z.string()
    }),
    president: z.object({
        name: z.string(),
        party: z.string()
    })
});

(async() => {
    const res = await agent.executeWithSchema(searchResponseSchame, {prompt:'Give me information about France'});
    console.log(res);
})();