// Development-only, direct browser MCP inspection. Credentials and session headers stay in memory.
interface RpcReply {jsonrpc:string;id?:number;result?:unknown;error?:{message?:string}}
export interface McpTool {name:string;description?:string;inputSchema:{properties?:Record<string,{description?:string;[key:string]:unknown}>;[key:string]:unknown}}
export function mcpReply(text:string,id:number):unknown{
  const replies:RpcReply[]=text.trim().startsWith('{')?[JSON.parse(text)]:text.split(/\r?\n\r?\n/).flatMap(event=>{const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');return data?[JSON.parse(data)]:[]});
  const reply=replies.find(r=>r.id===id);if(!reply)throw new Error('MCP response has no matching request ID.');if(reply.error)throw new Error(reply.error.message??'MCP request failed.');if(!Object.hasOwn(reply,'result'))throw new Error('MCP response has no result.');return reply.result;
}
export function browserMcp(key:string,send:typeof fetch=fetch){
  if(!key)throw new Error('Connect the localhost agent session first.');let id=0,session:string|null=null,protocol='2025-03-26';
  const clean=(value:unknown):unknown=>typeof value==='string'?value.replaceAll(key,'[redacted]'):Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)])):value;
  async function request(method:string,params?:unknown,notification=false){
    const current=++id,response=await send('https://api.pixellab.ai/mcp',{method:'POST',credentials:'omit',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session?{'Mcp-Session-Id':session}:{}),...(method==='initialize'?{}:{'MCP-Protocol-Version':protocol})},body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id:current}),method,...(params?{params}:{})}),signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`PixelLab MCP returned HTTP ${response.status}. No request was resent.`);session=response.headers.get('mcp-session-id')??session;if(notification){await response.body?.cancel();return null;}
    try{return clean(mcpReply(await response.text(),current));}catch(e){throw new Error(String((e as Error).message).replaceAll(key,'[redacted]'));}
  }
  return{
    async inspect(){const initialized=await request('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'pixeldoll-motion-lab',version:'research'}}) as {protocolVersion?:string};protocol=initialized.protocolVersion??protocol;await request('notifications/initialized',undefined,true);const tools=await request('tools/list') as {tools:McpTool[]};if(!Array.isArray(tools.tools))throw new Error('MCP did not return a tool catalog.');return{initialized,tools:tools.tools.filter(t=>['animate_character','list_characters','get_character','get_balance','get_image'].includes(t.name))};},
    async read(name:'list_characters'|'get_character'|'get_balance',args:Record<string,unknown>){if(!['list_characters','get_character','get_balance'].includes(name))throw new Error('Only read-only MCP tools are enabled here.');return request('tools/call',{name,arguments:args});},
  };
}
