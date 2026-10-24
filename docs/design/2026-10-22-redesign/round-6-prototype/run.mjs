// Separate local, keyless design server. Does not load the app config or any .env file.
import { createServer } from '../../../../app/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=fileURLToPath(new URL('./',import.meta.url));
const resolvePackage=createRequire(new URL('../../../../app/package.json',import.meta.url)).resolve;
const alias=Object.fromEntries(['tokens.css','components.css'].map(entry=>['@shilo/bronze-ui/'+entry,resolvePackage('@shilo/bronze-ui/'+entry)]));
const server=await createServer({root,configFile:false,envDir:false,resolve:{alias},publicDir:fileURLToPath(new URL('../../../../app/public/fixtures/s2/',import.meta.url)),server:{host:'127.0.0.1',port:5202,strictPort:true,fs:{allow:[root,fileURLToPath(new URL('../round-5-mockups/',import.meta.url)),fileURLToPath(new URL('../../../../app/src/lib/',import.meta.url)),fileURLToPath(new URL('../../../../app/node_modules/@shilo/bronze-ui/',import.meta.url))]}},appType:'spa'});
await server.listen();
console.log('Isolated Bronze prototype: http://127.0.0.1:5202');
