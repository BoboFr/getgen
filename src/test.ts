import {z} from 'zod'
import { Agent } from './core';
import { Tool } from './types';

const agent = new Agent({
    modelName: 'qwen2:latest',
    debug: true
});

const customerSchema = z.object({
    customer_id: z.string(),
});

const parseCustomerID: Tool = {
    name: 'parse_customer_id',
    description: 'Parse the customer ID from a string',
    parameters: [
        {
            name: 'customerid',
            type: 'string',
            description: 'The customer ID to parse',
            required: true
        }
    ],
    execute: async (params: Record<string, any>): Promise<any> => {
        console.log('params', params);
        const customerID = String(params.customerid).padStart(7, '0');
        return { customer_id: `C${customerID}` };
    }
};

(async () => {
    agent.addTools([parseCustomerID]);
    console.log('Available tools:', agent.listTools());
    const prompt = `Formate l'ID client 1451`;
    const res = await agent.executeWithSchema(customerSchema, {prompt});
    console.log('Response:', res.response);
    console.log('Parsed:', res.parsedResponse);
    if(res.toolCalls && res.toolCalls.length > 0) {
        console.log('Tool Call:', JSON.stringify(res.toolCalls[0], null, 2));
    } else {
        console.log('No tool calls made!');
    }
})();