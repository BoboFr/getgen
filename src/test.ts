
import {z} from 'zod'
import { Agent } from './core';

const agent = new Agent({
    modelName: 'qwen2:latest'
});

const searchResponseSchame = z.object({
    capital: z.string(),
    population: z.number(),
});

(async() => {
    const res = await agent.executeWithSchema(searchResponseSchame, {prompt:'What is the capital of France?'});
    console.log(res);
})();