// Used by local automated test adapters. Does not start a server or use credentials.
import {generationPrompt,generationSchema} from './schema.js';
import {OCR_PROMPT,extractImage} from './api.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {route,data}=JSON.parse(input);
if(route==='generate')console.log(JSON.stringify({prompt:generationPrompt(data),schema:generationSchema}));
else {extractImage(data);console.log(JSON.stringify({prompt:OCR_PROMPT,schema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}))}
