import {exposedRock} from '../mining.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {duplexPair} from 'node:stream';
import {WebSocket} from 'ws';
import {ForestRoom} from '../multiplayer.js';
import {ForestConnection} from '../network.js';
import {createGameServer as createServer} from '../server.mjs';
import {InventoryStore} from '../inventory-store.mjs';
const createGameServer=()=>createServer({inventoryStore:new InventoryStore()});
import {canStand} from '../world.js';
const types=JSON.parse(readFileSync(new URL('../assets/collection.json',import.meta.url))).filter(o=>['People','Creatures','Monsters'].includes(o.category));
const join=(room,name='Tarin',character='tarin')=>room.join({name,character},{});

test('named sessions validate character, reject duplicate names, and never expose tokens in snapshots',()=>{
 const room=new ForestRoom(types),a=join(room),b=join(room,'Amy','amy');
 assert.equal(room.snapshot().players.length,2);assert.equal(b.kind,'amy');assert.notEqual(a.id,b.id);
 assert.throws(()=>join(room,' tarin ','amy'),/already/);assert.throws(()=>join(room,'','tarin'),/name/);assert.throws(()=>join(room,'Other','ghost'),/Choose/);
 assert(!JSON.stringify(room.snapshot()).includes(a.token));
});
test('server owns movement, walk animation, collision, and stale-input stopping',()=>{
 let now=0;const room=new ForestRoom(types,{now:()=>now}),a=join(room),old=a.y;
 room.input(a,{x:0,y:1,run:false});room.tick(.1);assert(a.y>old);assert(a.walking);assert(a.walkDistance>0);
 room.input(a,{x:Infinity,y:0});assert.equal(a.input.y,1);
 now=1000;const before=a.y;room.tick(.1);assert.equal(a.y,before);assert.equal(a.walking,false);
 for(let i=0;i<100;i++){now+=50;room.input(a,{x:1,y:0,run:true});room.tick(.05);}assert(canStand(room.world,a.x,a.y));
});
test('reconnect preserves player position; disconnected names expire and host role transfers',()=>{
 let now=0;const room=new ForestRoom(types,{now:()=>now}),a=join(room),b=join(room,'Amy','amy');
 room.input(a,{x:0,y:1});room.tick(.1);const y=a.y;room.leave(a);assert.equal(room.hostId(),b.id);assert.equal(room.snapshot().players.length,1);
 const restored=room.join({name:'Tarin',character:'tarin',token:a.token},{});assert.equal(restored.id,a.id);assert.equal(restored.y,y);
 room.leave(restored);now=16000;room.tick(.05);assert(!room.sessions.has(a.token));assert.doesNotThrow(()=>join(room));
});
test('forest regeneration is disabled for both the host and other players',()=>{
 const room=new ForestRoom(types),a=join(room),b=join(room,'Amy','amy'),seed=room.world.seed,revision=room.sequence;
 assert.throws(()=>room.regenerate(a,'host-seed'),/disabled/);assert.throws(()=>room.regenerate(b,'other-seed'),/disabled/);
 assert.equal(room.world.seed,seed);assert.equal(room.sequence,revision);
});

// Real HTTP upgrade + WebSocket frames over paired streams: no listening port required.
function transport(game,connections){return class extends WebSocket{
 constructor(url){const [client,server]=duplexPair();connections.push(client,server);game.server.emit('connection',server);super(url,{createConnection:()=>client});}
};}
function waitFor(predicate,timeout=2500){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-started>timeout){clearInterval(timer);reject(new Error('Timed out waiting for WebSocket state'));}},10);});}

test('two real WebSocket clients see character choice, movement, shared NPCs, regeneration, and logout',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams),states={};let welcomeA,welcomeB;const errors=[],chatEvents={a:[],b:[]};
 const options=who=>({url:'ws://localhost/ws',WebSocketClass,onState:s=>states[who]=s,onWelcome:m=>who==='a'?welcomeA=m:welcomeB=m,onStatus(){},onChat:m=>chatEvents[who].push(m),onError:m=>errors.push(m)});
 const a=new ForestConnection(options('a')),b=new ForestConnection(options('b'));
 t.after(()=>{a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'Tarin player',character:'tarin'});await waitFor(()=>welcomeA);
 b.connect({name:'Amy player',character:'amy'});await waitFor(()=>states.a?.players.length===2&&states.b?.players.length===2);
 assert.equal(states.a.players.find(p=>p.id===welcomeB.id).kind,'amy');assert.deepEqual(states.a.creatures,states.b.creatures);
 a.send({type:'chat',text:'Hi Amy!'});
 await waitFor(()=>states.b.players.find(p=>p.id===welcomeA.id)?.chat?.text==='Hi Amy!');
 b.send({type:'chat',text:'Follow me!'});
 await waitFor(()=>states.a.players.find(p=>p.id===welcomeB.id)?.chat?.text==='Follow me!');
 assert.deepEqual(chatEvents.a.map(m=>m.text),['Hi Amy!','Follow me!']);assert.deepEqual(chatEvents.b.map(m=>m.text),['Hi Amy!','Follow me!']);
 const before=states.a.players.find(p=>p.id===welcomeB.id).y;b.sendInput({x:0,y:1,run:false});
 await waitFor(()=>states.a.players.find(p=>p.id===welcomeB.id)?.y>before);
 assert.equal(states.a.players.find(p=>p.id===welcomeB.id).walking,true);
 b.sendInput({x:0,y:0,run:false});await waitFor(()=>states.a.players.find(p=>p.id===welcomeB.id)?.walking===false);
 a.send({type:'hug-request',targetId:welcomeB.id});
 await waitFor(()=>states.b.hugRequests?.length===1);
 assert.equal(states.a.hugs.length,0);
 b.send({type:'hug-response',requestId:states.b.hugRequests[0].id,accept:true});
 await waitFor(()=>states.a.hugs?.length===1&&states.b.hugs?.length===1);
 assert.deepEqual(states.a.hugs[0].players,[welcomeA.id,welcomeB.id]);
 assert(states.a.players.every(p=>p.hugging));
 b.regenerate('blocked');await waitFor(()=>errors.length>0);assert.match(errors[0],/disabled/);
 a.regenerate('both-see-this');await waitFor(()=>errors.length===2);assert.match(errors[1],/disabled/);assert.equal(states.a.seed,'TARIN-01');assert.equal(states.b.seed,'TARIN-01');
 const oldId=welcomeB.id;const oldToken=b.token;
 const peer=[...game.wss.clients].find(ws=>ws.player?.id===oldId);peer.terminate();b.socket.terminate();
 await waitFor(()=>states.a.players.length===1);
 await waitFor(()=>b.welcomed&&states.a.players.length===2);
 assert.equal(welcomeB.id,oldId);assert.equal(b.token,oldToken);
 assert.deepEqual(welcomeB.chatHistory.map(m=>m.text),['Hi Amy!','Follow me!']);assert.equal(chatEvents.b.length,2);
 b.disconnect();await waitFor(()=>states.a.players.length===1);assert.equal(states.a.players[0].id,welcomeA.id);
});

test('WebSocket login rejects an occupied name and can retry with a different name',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams);let ready=false,error,otherReady=false;
 const base={url:'ws://localhost/ws',WebSocketClass,onState(){},onStatus(){}};
 const a=new ForestConnection({...base,onWelcome(){ready=true;},onError(){}}),b=new ForestConnection({...base,onWelcome(){otherReady=true;},onError:m=>error=m});
 t.after(()=>{a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'Same name',character:'tarin'});await waitFor(()=>ready);
 b.connect({name:'Same name',character:'amy'});await waitFor(()=>error);assert.match(error,/already/);assert.equal(otherReady,false);
 b.connect({name:'New name',character:'amy'});await waitFor(()=>otherReady);assert.equal(game.room.snapshot().players.length,2);
});

test('server honors analog joystick strength and keeps keyboard diagonal speed bounded',()=>{
 const distanceFor=(x,y)=>{const room=new ForestRoom(types),a=join(room,'Test');const initial={x:a.x,y:a.y};room.input(a,{x,y});room.tick(.05);return Math.hypot(a.x-initial.x,a.y-initial.y);};
 const full=distanceFor(0,1),gentle=distanceFor(0,.25),diagonal=distanceFor(1,1);
 assert(Math.abs(gentle/full-.25)<1e-8);assert(Math.abs(diagonal-full)<1e-8);
});

test('only one connected player can be Amy; leaving releases the character',()=>{
 const room=new ForestRoom(types),a=join(room,'Amy one','amy');
 assert.throws(()=>join(room,'Amy two','amy'),/already being played/);
 assert(!room.snapshot().creatures.some(a=>a.kind==='amy'));
 room.logout(a);assert.doesNotThrow(()=>join(room,'Amy two','amy'));
});

test('real WebSocket clients transition between mine and forest without seeing players in the other stage',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams),states={},chat=[],terrainPackets={a:[],b:[]};let wa,wb;
 const options=who=>({url:'ws://localhost/ws',WebSocketClass,onState:s=>{states[who]=s;if(s.terrain)terrainPackets[who].push(s.terrain);},onWelcome:m=>who==='a'?wa=m:wb=m,onStatus(){},onError(){},onChat:m=>chat.push(m)});
 const a=new ForestConnection(options('a')),b=new ForestConnection(options('b'));
 t.after(()=>{a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'Miner',character:'tarin'});b.connect({name:'Explorer',character:'amy'});await waitFor(()=>wa&&wb&&states.a?.players.length===2);
 const pa=game.room.sessions.get(wa.token),pb=game.room.sessions.get(wb.token);
 const doorway=game.room.world.portals[0];Object.assign(pa,{x:doorway.x,y:doorway.y+60});a.send({type:'use-portal'});await waitFor(()=>states.a.stage==='mine'&&states.b.players.length===1);
 assert.equal(states.a.players.length,1);assert.equal(states.b.stage,'forest');assert.equal(states.a.creatures.length,0);
 a.sendInput({x:0,y:0,run:false,view:{x:pa.x-250,y:pa.y-180,width:500,height:360,stage:'mine',seed:game.room.worldFor(pa).seed}});
 await waitFor(()=>states.a.creatures.length>0);assert(states.a.creatures.every(c=>c.kind==='spider'&&c.stage==='mine'));assert(!states.b.creatures.some(c=>c.id.startsWith('cave-creature-')));

 assert.equal(terrainPackets.a.length,1);assert.equal(terrainPackets.a[0].seed,game.room.worldFor(pa).seed);assert.equal(terrainPackets.b.length,0);
 a.send({type:'chat',text:'Inside the mineshaft'});await waitFor(()=>chat.some(m=>m.text==='Inside the mineshaft'));
 Object.assign(pb,game.room.world.portals[0]);await waitFor(()=>states.a.players.length===2&&states.b.stage==='mine');
 assert.equal(terrainPackets.a.length,1);assert.equal(terrainPackets.b.length,1);assert.deepEqual(terrainPackets.b[0],terrainPackets.a[0]);
 pa.portalCooldown=0;Object.assign(pa,game.room.worlds.mine.portals[0]);await waitFor(()=>states.a.stage==='forest'&&states.b.players.length===1);
});

test('online roster includes players in other stages without exposing their positions or tokens',()=>{
 const room=new ForestRoom(types),a=join(room),b=join(room,'Amy','amy');room.changeStage(b,'mine');
 const snapshot=room.snapshot(a.id);assert.equal(snapshot.players.length,1);assert.equal(snapshot.onlinePlayers.length,2);
 const amy=snapshot.onlinePlayers.find(p=>p.id===b.id);assert.equal(amy.stage,'mine');assert.equal(amy.kind,'amy');assert(!('x' in amy));assert(!('token' in amy));
 room.leave(b);assert.equal(room.snapshot(a.id).onlinePlayers.length,1);
});
test('player removals release sessions, character choices, names, and pending hugs',()=>{
 const room=new ForestRoom(types),a=join(room),b=join(room,'Amy','amy');room.hugs.request(a,b.id);
 assert.throws(()=>room.removePlayer({...a},b.id),/Join/);assert.throws(()=>room.removePlayer(a,a.id),/Leave/);
 assert.equal(room.removePlayer(a,b.id),b);assert.equal(room.snapshot(a.id).onlinePlayers.length,1);assert(!room.sessions.has(b.token));assert.equal(room.hugs.requests.size,0);
 assert.throws(()=>room.removePlayer(a,b.id),/no longer online/);assert.doesNotThrow(()=>join(room,'Amy','amy'));
});
test('a non-host can remove the host, disconnecting the target without auto-reconnect and allows a new join',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams),states={};let wa,wb,removed;const errors=[];
 const base={url:'ws://localhost/ws',WebSocketClass,onStatus(){},onError:m=>errors.push(m)};
 const a=new ForestConnection({...base,onWelcome:m=>wa=m,onState:s=>states.a=s,onRemoved:m=>removed=m}),b=new ForestConnection({...base,onWelcome:m=>wb=m,onState:s=>states.b=s});
 t.after(()=>{a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'Host',character:'tarin'});await waitFor(()=>wa);
 b.connect({name:'Guest',character:'amy'});await waitFor(()=>wb&&states.a?.onlinePlayers.length===2);
 b.send({type:'remove-player',targetId:wa.id});await waitFor(()=>removed&&states.b.onlinePlayers.length===1);
 assert.match(removed,/removed/);assert.equal(a.wantsConnection,false);assert.equal(a.token,null);assert.equal(a.welcomed,false);assert.equal(game.room.sessions.size,1);assert.equal(states.b.hostId,wb.id);
 a.connect({name:'Host',character:'tarin'});await waitFor(()=>states.b.onlinePlayers.length===2&&a.welcomed);assert.equal(game.room.sessions.size,2);

});

test('stale clients without the current protocol cannot join with an old cave generator',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams),ws=new WebSocketClass('ws://localhost/ws');let error;
 t.after(()=>{ws.terminate();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 ws.on('open',()=>ws.send(JSON.stringify({type:'join',name:'Old browser',character:'tarin'})));
 ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='error')error=m.message;});
 await waitFor(()=>error);assert.match(error,/updated/);assert.match(error,/refresh/);assert.equal(game.room.sessions.size,0);
});

test('only one connected Amy and one connected Tarin are allowed across all stages',()=>{
 const room=new ForestRoom(types),tarin=join(room,'One','tarin'),amy=join(room,'Two','amy');room.changeStage(tarin,'mine');
 assert.throws(()=>join(room,'Duplicate Tarin','tarin'),/Tarin is already/);assert.throws(()=>join(room,'Duplicate Amy','amy'),/Amy is already/);
 assert.equal(room.snapshot(amy.id).onlinePlayers.length,2);
 room.logout(tarin);assert.doesNotThrow(()=>join(room,'New Tarin','tarin'));
 room.leave(amy);assert.doesNotThrow(()=>join(room,'New Amy','amy'));
 assert.throws(()=>room.join({name:'Two',character:'amy',token:amy.token},{}),/Amy is already/);
 assert.equal(room.snapshot().onlinePlayers.length,2);
});
test('WebSocket logins reject duplicate Tarins and allow the unused Amy slot',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams);let aReady=false,bReady=false,rejection;
 const base={url:'ws://localhost/ws',WebSocketClass,onState(){},onStatus(){}};
 const a=new ForestConnection({...base,onWelcome(){aReady=true;},onError(){}}),b=new ForestConnection({...base,onWelcome(){bReady=true;},onError:m=>rejection=m});
 t.after(()=>{a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'First',character:'tarin'});await waitFor(()=>aReady);
 b.connect({name:'Second',character:'tarin'});await waitFor(()=>rejection);assert.match(rejection,/Tarin is already/);assert.equal(bReady,false);assert.equal(game.room.snapshot().onlinePlayers.length,1);
 b.connect({name:'Second',character:'amy'});await waitFor(()=>bReady);assert.equal(game.room.snapshot().onlinePlayers.length,2);
});

test('held WebSocket mining shares cracks and broken terrain, awards ore once and retains excavations on reconnect',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams),states={},welcomes={};
 const options=who=>({url:'ws://localhost/ws',WebSocketClass,onState:s=>states[who]=s,onWelcome:m=>welcomes[who]=m,onStatus(){},onError:m=>assert.fail(m)});
 const a=new ForestConnection(options('a')),b=new ForestConnection(options('b'));let heartbeat;
 t.after(()=>{clearInterval(heartbeat);a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'Miner T',character:'tarin'});await waitFor(()=>welcomes.a);b.connect({name:'Miner A',character:'amy'});await waitFor(()=>welcomes.b);
 const pa=[...game.room.sessions.values()].find(p=>p.id===welcomes.a.id),pb=[...game.room.sessions.values()].find(p=>p.id===welcomes.b.id);game.room.changeStage(pa,'mine');game.room.changeStage(pb,'mine');
 const world=game.room.worldFor(pa),ore=world.structures.find(s=>s.kind==='ore'&&exposedRock(world,Math.floor(s.x/32),Math.floor(s.y/32))),x=Math.floor(ore.x/32),y=Math.floor(ore.y/32),offset=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=>!world.blocked[(y+dy)*144+x+dx]);
 Object.assign(pa,{x:(x+offset[0])*32+16,y:(y+offset[1])*32+16});Object.assign(pb,{x:pa.x,y:pa.y});
 heartbeat=setInterval(()=>a.send({type:'mine-target',x,y,progress:9999,amount:9999}),100);a.send({type:'mine-target',x,y,progress:9999});
 await waitFor(()=>states.b?.players.find(p=>p.id===pa.id)?.mining?.progress>0);assert.equal(world.blocked[y*144+x],1);
 await waitFor(()=>states.b?.brokenBlocks.includes(y*144+x));clearInterval(heartbeat);a.send({type:'mine-target',x:null,y:null});
 assert.equal(states.a.inventory[ore.oreType],1);assert.equal(states.b.inventory[ore.oreType],0);assert.equal(world.blocked[y*144+x],0);
 b.send({type:'mine-target',x,y});await new Promise(r=>setTimeout(r,150));assert.equal(pb.inventory[ore.oreType],0);
 const oldId=pa.id;[...game.wss.clients].find(ws=>ws.player?.id===oldId).terminate();a.socket.terminate();await waitFor(()=>a.welcomed&&states.a?.brokenBlocks.includes(y*144+x));assert.equal(welcomes.a.id,oldId);assert.equal(states.a.inventory[ore.oreType],1);
});
