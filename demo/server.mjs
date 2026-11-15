import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':['demo/index.html','text/html; charset=utf-8'],'/card.js':['dist/smart-heating-scheduler-card.js','text/javascript; charset=utf-8']};
createServer(async(req,res)=>{const file=files[new URL(req.url,'http://127.0.0.1').pathname];if(!file){res.writeHead(404);res.end('Not found');return;}try{const body=await readFile(file[0]);res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('Build the card first.');}}).listen(18765,'127.0.0.1',()=>console.log('Disconnected preview: http://127.0.0.1:18765/'));
