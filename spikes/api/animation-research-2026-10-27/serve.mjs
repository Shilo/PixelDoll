// Static local evidence viewer only. It has no credential endpoint and accepts no writes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../out/animation-research-2026-10-27');
http.createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  let file;
  try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}
  catch{res.writeHead(400);res.end();return;}
  if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','png':'image/png','json':'application/json'})[file.split('.').at(-1)]??'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  fs.createReadStream(file).pipe(res);
}).listen(5269,'127.0.0.1',()=>console.log('Evidence gallery: http://127.0.0.1:5269/'));
