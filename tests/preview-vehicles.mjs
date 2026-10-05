import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files=new Map([['/','tests/vehicle-showroom.html'],...['three.min.js','world-systems.js','motion-sync.js','vehicles-client.js'].map(file=>['/'+file,file])]);
createServer(async(request,response)=>{const file=files.get(new URL(request.url,'http://localhost').pathname);if(!file){response.writeHead(404);return response.end();}try{const content=await readFile(new URL('../'+file,import.meta.url));response.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript','cache-control':'no-store'});response.end(content);}catch{response.writeHead(500);response.end();}}).listen(4192,'127.0.0.1',()=>console.log('Prévia dos veículos: http://localhost:4192/'));
