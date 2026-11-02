import {expect,test,vi} from 'vitest';
import {browserMcp,mcpReply} from '../../src/ui/motion-lab/mcp.ts';
test('MCP decodes matching JSON/SSE responses and rejects missing IDs and remote errors',()=>{
  expect(mcpReply('event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"ok":true}}\n\n',7)).toEqual({ok:true});
  expect(()=>mcpReply('{"jsonrpc":"2.0","id":8,"result":{}}',7)).toThrow('matching request');
  expect(()=>mcpReply('{"jsonrpc":"2.0","id":7,"error":{"message":"refused"}}',7)).toThrow('refused');
});
test('read-only MCP inspection keeps session headers private and redacts a reflected credential',async()=>{
  const requests:RequestInit[]=[];const send=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{requests.push(init!);const request=JSON.parse(init!.body as string);if(request.method==='notifications/initialized')return new Response(null,{status:202});return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result:request.method==='initialize'?{protocolVersion:'2025-03-26',echo:'synthetic-secret'}:{tools:[{name:'animate_character',inputSchema:{}},{name:'unrelated',inputSchema:{}}]}}),{headers:{'Content-Type':'application/json','mcp-session-id':'private-session'}});});
  const client=browserMcp('synthetic-secret',send as typeof fetch),result=await client.inspect();expect(result.tools.map(t=>t.name)).toEqual(['animate_character']);expect(JSON.stringify(result)).not.toContain('synthetic-secret');expect(JSON.stringify(result)).not.toContain('private-session');expect(requests[1].headers).toMatchObject({'Mcp-Session-Id':'private-session'});await expect(client.read('delete_character' as 'get_character',{})).rejects.toThrow('read-only');expect(send).toHaveBeenCalledTimes(3);
});
