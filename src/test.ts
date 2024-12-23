import {z} from 'zod'
import { Agent } from './core';
import { Tool } from './types';

const agent = new Agent({
    modelName: 'qwen2:latest',
    debug: true
});

const customerSchema = z.object({
    customer_id: z.string().describe("The customer's ID as 1234"),
    request: z.enum(["ACCOUNT_INFO", "ORDER_HISTORY", "UNKNOWN"]),
});

(async () => {
    const prompt = `Bonjour, je suis le client 1452 et je souhaite obtenir les informations sur mon la guerre de centenaire.`;
    const res = await agent.executeWithSchema(customerSchema, {prompt});

    if(res.parsedResponse){
        console.log('Response:', res.parsedResponse);
    }

})();