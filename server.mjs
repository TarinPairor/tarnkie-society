import {PROTOCOL_VERSION,PROTOCOL_ERROR} from './protocol.js';
import {packCaveTerrain} from './terrain.js';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {WebSocketServer,WebSocket} from 'ws';
import {ForestRoom} from './multiplayer.js';

export function createGameServer(){
 const root=fileURLToPath(new URL('.',import.meta.url));
 const collection=JSON.parse(readFileSync(new URL('./assets/collection.json',import.meta.url)));
 const room=new ForestRoom(collection.filter(o=>['Creatures','Monsters'].includes(o.category)));
 const server=http.createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root)||pathname.includes('/node_modules/')||!['.html','.css','.js','.json','.png','.svg'].includes(path.extname(file))){res.writeHead(404);return res.end('Not found');}
  const data=await readFile(file);res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]);res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}});
 const wss=new WebSocketServer({noServer:true,maxPayload:4096});
 const send=(ws,message)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<1024*1024){ws.send(JSON.stringify(message));return true;}return false;};
 const terrainCache=new WeakMap();
 const broadcast=()=>{for(const ws of wss.clients)if(ws.player){
  const state=room.snapshot(ws.player.id),key=`${state.revision}:${state.stage}:${state.worldSeed}`;
  if(state.stage==='mine'&&ws.terrainKey!==key){const cave=room.worldFor(ws.player);if(!terrainCache.has(cave))terrainCache.set(cave,packCaveTerrain(cave));state.terrain=terrainCache.get(cave);}
  if(send(ws,state))ws.terrainKey=key;
 }};
 server.on('upgrade',(req,socket,head)=>{
  let sameOrigin=true;try{if(req.headers.origin)sameOrigin=new URL(req.headers.origin).host===req.headers.host;}catch{sameOrigin=false;}
  if(req.url!=='/ws'||!sameOrigin||wss.clients.size>=64){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  ws.alive=true;ws.rateAt=Date.now();ws.rate=0;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
  const joinTimeout=setTimeout(()=>{if(!ws.player)ws.close(1008,'Join required');},15000);joinTimeout.unref();
  ws.on('message',data=>{let context;try{
   if(Date.now()-ws.rateAt>=1000){ws.rateAt=Date.now();ws.rate=0;}if(++ws.rate>100){ws.close(1008,'Too many messages');return;}
   const m=JSON.parse(data.toString());context=m?.type;if(!m||typeof m!=='object')return;
   if(m.type==='join'&&!ws.player){if(m.protocolVersion!==PROTOCOL_VERSION)throw new Error(PROTOCOL_ERROR);ws.player=room.join(m,ws);clearTimeout(joinTimeout);send(ws,{type:'welcome',protocolVersion:PROTOCOL_VERSION,id:ws.player.id,token:ws.player.token,chatHistory:room.chatHistory});broadcast();}
   else if(m.type==='chat'&&ws.player){room.chat(ws.player,m.text);const message=room.chatHistory.at(-1);for(const client of wss.clients)if(client.player)send(client,{type:'chat-message',message});broadcast();}
   else if(m.type==='hug-request'&&ws.player){room.hugs.request(ws.player,m.targetId);broadcast();}
   else if(m.type==='hug-response'&&ws.player){room.hugs.respond(ws.player,m.requestId,m.accept);broadcast();}
   else if(m.type==='remove-player'&&ws.player){const target=room.removePlayer(ws.player,m.targetId);const socket=target.connection;send(socket,{type:'removed',message:'You were removed from the forest by another player. You can join again.'});socket.player=null;socket.close(4001,'Removed by player');broadcast();}
   else if(m.type==='input'&&ws.player)room.input(ws.player,m);
   else if(m.type==='use-portal'&&ws.player){room.usePortal(ws.player);broadcast();}
   else if(m.type==='regenerate'&&ws.player){room.regenerate(ws.player,m.seed);broadcast();}
   else if(m.type==='logout'){room.logout(ws.player);ws.player=null;ws.close(1000);broadcast();}
  }catch(error){send(ws,{type:'error',context,message:error instanceof SyntaxError?'Invalid message.':error.message});}});
  ws.on('close',()=>{clearTimeout(joinTimeout);room.leave(ws.player);broadcast();});
 });
 let ticks=0,last=Date.now();
 const timer=setInterval(()=>{const now=Date.now();room.tick((now-last)/1000);last=now;if(++ticks%2===0)broadcast();},50);
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},10000);
 const shutdown=()=>{clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();};
 server.on('close',shutdown);
 return {server,room,wss,shutdown};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),index=args.indexOf('--port'),port=index>=0?Number(args[index+1]):Number(process.env.PORT)||5174;
 const {server,shutdown}=createGameServer();let listeningPort=port;
 server.on('error',error=>{
  if(error.code==='EADDRINUSE'&&listeningPort<port+10){
   console.log(`Port ${listeningPort} is already in use. Trying ${listeningPort+1} for multiplayer…`);
   listeningPort++;server.listen(listeningPort,'0.0.0.0');
  }else{console.error(`Could not start multiplayer: ${error.message}`);shutdown();process.exitCode=1;}
 });
 server.on('listening',()=>console.log(`Forest multiplayer is ready. Open http://localhost:${listeningPort}/ (use this address, not any Python server).`));
 server.listen(listeningPort,'0.0.0.0');
}
