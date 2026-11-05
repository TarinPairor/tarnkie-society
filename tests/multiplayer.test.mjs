import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {duplexPair} from 'node:stream';
import {WebSocket} from 'ws';
import {ForestRoom} from '../multiplayer.js';
import {ForestConnection} from '../network.js';
import {createGameServer} from '../server.mjs';
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
test('forest changes are shared, host-only, and reset every player to a walkable spawn',()=>{
 const room=new ForestRoom(types),a=join(room),b=join(room,'Amy','amy');const revision=room.sequence;
 assert.throws(()=>room.regenerate(b,'no'),/first connected/);room.regenerate(a,'shared-new-seed');
 const state=room.snapshot();assert.equal(state.seed,'shared-new-seed');assert(state.revision>revision);
 for(const p of state.players){assert.equal(p.x,room.world.spawn.x);assert.equal(p.y,room.world.spawn.y);assert.equal(p.walking,false);}
});

// Real HTTP upgrade + WebSocket frames over paired streams: no listening port required.
function transport(game,connections){return class extends WebSocket{
 constructor(url){const [client,server]=duplexPair();connections.push(client,server);game.server.emit('connection',server);super(url,{createConnection:()=>client});}
};}
function waitFor(predicate,timeout=2500){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-started>timeout){clearInterval(timer);reject(new Error('Timed out waiting for WebSocket state'));}},10);});}

test('two real WebSocket clients see character choice, movement, shared NPCs, regeneration, and logout',async t=>{
 const game=createGameServer(),streams=[],WebSocketClass=transport(game,streams),states={};let welcomeA,welcomeB;const errors=[];
 const options=who=>({url:'ws://localhost/ws',WebSocketClass,onState:s=>states[who]=s,onWelcome:m=>who==='a'?welcomeA=m:welcomeB=m,onStatus(){},onError:m=>errors.push(m)});
 const a=new ForestConnection(options('a')),b=new ForestConnection(options('b'));
 t.after(()=>{a.disconnect();b.disconnect();game.shutdown();for(const s of streams)s.destroy();game.server.close();});
 a.connect({name:'Tarin player',character:'tarin'});await waitFor(()=>welcomeA);
 b.connect({name:'Amy player',character:'amy'});await waitFor(()=>states.a?.players.length===2&&states.b?.players.length===2);
 assert.equal(states.a.players.find(p=>p.id===welcomeB.id).kind,'amy');assert.deepEqual(states.a.creatures,states.b.creatures);
 const before=states.a.players.find(p=>p.id===welcomeB.id).y;b.sendInput({x:0,y:1,run:false});
 await waitFor(()=>states.a.players.find(p=>p.id===welcomeB.id)?.y>before);
 assert.equal(states.a.players.find(p=>p.id===welcomeB.id).walking,true);
 b.sendInput({x:0,y:0,run:false});await waitFor(()=>states.a.players.find(p=>p.id===welcomeB.id)?.walking===false);
 b.regenerate('blocked');await waitFor(()=>errors.length>0);assert.match(errors[0],/first connected/);
 a.regenerate('both-see-this');await waitFor(()=>states.a.seed==='both-see-this'&&states.b.seed==='both-see-this');
 const oldId=welcomeB.id;const oldToken=b.token;
 const peer=[...game.wss.clients].find(ws=>ws.player?.id===oldId);peer.terminate();b.socket.terminate();
 await waitFor(()=>states.a.players.length===1);
 await waitFor(()=>b.welcomed&&states.a.players.length===2);
 assert.equal(welcomeB.id,oldId);assert.equal(b.token,oldToken);
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
 const room=new ForestRoom(types),a=join(room,'Full'),b=join(room,'Gentle'),c=join(room,'Diagonal');
 const initial=room.world.spawn;room.input(a,{x:0,y:1});room.input(b,{x:0,y:.25});room.input(c,{x:1,y:1});room.tick(.05);
 const full=a.y-initial.y,gentle=b.y-initial.y,diagonal=Math.hypot(c.x-initial.x,c.y-initial.y);
 assert(Math.abs(gentle/full-.25)<1e-8);assert(Math.abs(diagonal-full)<1e-8);
});
