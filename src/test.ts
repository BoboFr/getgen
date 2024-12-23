import {z} from 'zod'
import { Agent } from './core';
import { Tool } from './types';

const agent = new Agent({
    modelName: 'qwen2:latest',
    debug: true
});

const promptAgent = new Agent({
    modelName: 'qwen2:latest'
});

const customerIDParserTool: Tool = {
    name: 'customer_parser_id',
    description: 'Get the real customer ID',
    parameters: [
        {
            name: 'customer_id',
            type: 'string',
            required: true,
            description: 'The customer ID to get'
        }
    ],
    execute: async (params) => {
        return {
            success: true,
            data: "C"+String(params.customer_id).padStart(7, '0')
        }
    }
};
agent.addTools([]);

const customerSchema = z.object({
    customer_id: z.string().describe("The customer's ID as 1234"),
    request: z.enum(["ACCOUNT_INFO", "ORDER_HISTORY", "UNKNOWN"]),
});

(async () => {
    const prompt = `Bonjour, je suis le client 1452 et je souhaite obtenir les informations sur mon compte.`;
    const res = await agent.executeWithSchema(customerSchema, {prompt});

    if(res.parsedResponse){
        console.log('Response:', res.parsedResponse);
    }

})();