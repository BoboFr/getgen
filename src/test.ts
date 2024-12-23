
import {z} from 'zod'
import { Agent } from './core';

const agent = new Agent({
    modelName: 'qwen2:latest'
});

const searchResponseSchame = z.object({
    capital: z.string(),
    information: z.object({
        population: z.number(),
        area: z.number()
    })
});

(async() => {
    const res = await agent.executeWithSchema(searchResponseSchame, {prompt:'Give me information about Paris'});
    console.log(res);
})();