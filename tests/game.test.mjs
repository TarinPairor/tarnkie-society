import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../world.js';
import {advanceWalk,walkingSprite} from '../animation.js';
import {ForestConnection} from '../network.js';
import {createTouchControls} from '../touch.js';
import {QUICK_MESSAGES,CHAT_LIMIT,cleanChat,wrapChat} from '../chat.js';
import {HUG_RANGE,HUG_DURATION} from '../hug-config.js';
const {SIZE,TILE,makeWorld,canStand,moveActor,makeCreatures,updateCreature,randomFromSeed}=engine;
const collection=JSON.parse(readFileSync(new URL('../assets/collection.json',import.meta.url)));
const types=collection.filter(o=>['People','Creatures','Monsters'].includes(o.category));
test('forest generation is deterministic, substantial, and seed-dependent',()=>{
 const a=makeWorld('test'),b=makeWorld('test'),c=makeWorld('different');
 assert.deepEqual(a,b);assert.notDeepEqual(a.tiles,c.tiles);assert(a.trees.length>2000);assert.equal(a.tiles.length,144*144);
 assert.equal(a.structures.filter(s=>s.kind==='house').length,15);assert(canStand(a,a.spawn.x,a.spawn.y));
});
test('every village and cottage entrance can be reached from spawn across multiple seeds',()=>{
 for(const seed of ['TARIN-01','amy','forest-3','test-4','seed-5']){
  const world=makeWorld(seed),seen=new Set(),queue=[[72,73]];
  for(let i=0;i<queue.length;i++){
   const [x,y]=queue[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,yy=y+dy,index=yy*SIZE+xx;
    if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||seen.has(index)||world.blocked[index])continue;
    seen.add(index);queue.push([xx,yy]);
   }
  }
  for(const v of world.settlements)assert(seen.has(v.y*SIZE+v.x),`${seed}: ${v.name}`);
  for(const h of world.structures.filter(s=>s.kind==='house'))assert(seen.has((h.y/TILE+1)*SIZE+h.x/TILE),'Cottage door reachable');
 }
});
test('collision prevents walking through trees, buildings, fences, or world bounds',()=>{
 const world=makeWorld('collision'),actor={...world.spawn,radius:7};
 for(const obstacle of [...world.trees.slice(0,50),...world.structures.filter(s=>s.kind!=='sign')])assert.equal(canStand(world,obstacle.x+8,obstacle.y+8),false);
 const small={blocked:new Uint8Array(SIZE*SIZE)};small.blocked[10*SIZE+12]=1;
 const p={x:10*TILE+16,y:10*TILE+16};moveActor(small,p,200,0);assert(p.x<12*TILE);assert(canStand(small,p.x,p.y));
 assert(!canStand(world,-1,100));assert(!canStand(world,100,SIZE*TILE));assert(canStand(world,actor.x,actor.y));
});
test('all creature types spawn and wander without combat or escaping the terrain',()=>{
 const world=makeWorld('wander'),actors=makeCreatures(world,types),random=randomFromSeed('ai');
 assert.equal(actors.length,types.length*7);for(const t of types)assert(actors.some(a=>a.kind===t.id));
 const before=actors.map(a=>[a.x,a.y]);let moved=0;
 for(let n=0;n<400;n++)for(const a of actors)updateCreature(world,a,.04,random);
 actors.forEach((a,i)=>{assert(canStand(world,a.x,a.y,a.radius));assert(['idle','wander'].includes(a.state));if(Math.hypot(a.x-before[i][0],a.y-before[i][1])>2)moved++;});
 assert(moved>actors.length*.75);assert(!actors.some(a=>'damage' in a||'health' in a));
});
test('game loads real Tarin, renders, accepts WASD, pauses, regenerates, and toggles map',async()=>{
 const elements=new Map();let frames=0;
 const context=new Proxy({measureText:()=>({width:24})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 function element(selector){if(!elements.has(selector))elements.set(selector,{width:800,height:500,value:'TARIN-01',hidden:false,style:{},tagName:'CANVAS',handlers:{},classList:{add(){}},getContext:()=>context,getBoundingClientRect:()=>({width:1000,height:600}),setAttribute(){},appendChild(){},focus(){},setPointerCapture(){},addEventListener(n,fn){this.handlers[n]=fn;}});return elements.get(selector);}
 const windowEvents={};
 const sandbox={QUICK_MESSAGES,CHAT_LIMIT,cleanChat,wrapChat,HUG_RANGE,HUG_DURATION,...engine,advanceWalk,walkingSprite,ForestConnection,createTouchControls,console,Math,Uint32Array,Set,Map,fetch:async url=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL('../'+url,import.meta.url)))}),document:{querySelector:element,querySelectorAll:()=>[],createElement:()=>element('surface'+Math.random()),addEventListener(){}},window:{addEventListener(n,f){windowEvents[n]=f;}},matchMedia:()=>({matches:false}),ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb();}},requestAnimationFrame(){frames++;},history:{replaceState(){}},location:{hash:''},crypto:{getRandomValues:a=>(a[0]=123,a)}};
 vm.createContext(sandbox);
 const code=readFileSync(new URL('../game.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/start\(\);\s*$/,'globalThis.started=start();');
 vm.runInContext(code,sandbox);await sandbox.started;
 assert.equal(element('#loading').hidden,true);assert(frames>0);
 assert.doesNotThrow(()=>windowEvents.keyup({}));
 assert.doesNotThrow(()=>windowEvents.keyup({key:undefined}));
 assert.doesNotThrow(()=>windowEvents.keydown({target:null}));
 vm.runInContext(`
  localId='test-player';joined=true;connection.welcomed=true;
  connection.sendInput=input=>globalThis.sentInput=input;
  const state={seed:'TARIN-01',revision:1,hostId:localId,creatures:[],players:[{id:localId,name:'Test',kind:'amy',x:world.spawn.x,y:world.spawn.y,walking:false}]};
  receiveState(state);globalThis.before={x:player.x,y:player.y};keys.add('s');update(.04);
  state.players[0].y+=20;state.players[0].walking=true;receiveState(state);update(.04);render();globalThis.after={x:player.x,y:player.y};`,sandbox);
 assert(sandbox.after.y>sandbox.before.y);assert.equal(sandbox.sentInput.y,1);
 assert.doesNotThrow(()=>windowEvents.keydown({target:null}));
 windowEvents.keyup({key:'S'});vm.runInContext('globalThis.isHoldingS=keys.has("s")',sandbox);assert.equal(sandbox.isHoldingS,false);
 vm.runInContext('setPaused(true)',sandbox);assert.equal(element('#paused').hidden,false);
 element('#resume').onclick();assert.equal(element('#paused').hidden,true);
 element('#show-map').onclick();assert.equal(element('#map-panel').hidden,false);
 element('#toggle-map').onclick();assert.equal(element('#map-panel').hidden,true);
 vm.runInContext(`keys.add('w');menu.open=true;menu.handlers.toggle();globalThis.menuState=menuOpen;globalThis.heldKeys=keys.size;`,sandbox);
 assert.equal(sandbox.menuState,true);assert.equal(sandbox.heldKeys,0);
 windowEvents.keydown({key:'Escape',target:{tagName:'CANVAS'},preventDefault(){}});assert.equal(element('#menu').open,false);
 vm.runInContext('connection.regenerate=seed=>globalThis.requestedSeed=seed',sandbox);
 element('#random-seed').onclick();assert.equal(sandbox.requestedSeed,'FERN-3F');

 vm.runInContext(`
  connection.send=message=>globalThis.sentHug=message;
  state.players.push({id:'other',name:'Other player',kind:'tarin',x:player.x+10,y:player.y,walking:false});
  receiveState(state);updateHugUI();
 `,sandbox);
 assert.equal(element('#hug-action').hidden,false);
 windowEvents.keydown({key:'h',repeat:false,target:{tagName:'CANVAS'},preventDefault(){}});
 assert.equal(sandbox.sentHug.type,'hug-request');assert.equal(sandbox.sentHug.targetId,'other');
 vm.runInContext(`state.hugRequests=[{id:'request-one',from:'other',to:localId,fromName:'Other player'}];receiveState(state);updateHugUI();`,sandbox);
 assert.equal(element('#hug-prompt').hidden,false);assert.match(element('#hug-question').textContent,/Other player/);
 element('#hug-accept').onclick();assert.equal(sandbox.sentHug.type,'hug-response');assert.equal(sandbox.sentHug.accept,true);
 vm.runInContext(`
  state.hugRequests=[];state.players.forEach(p=>p.hugging=true);state.hugs=[{id:'hug-one',players:[localId,'other'],remainingMs:HUG_DURATION}];
  receiveState(state);render();updateHugUI();
 `,sandbox);
 assert.equal(element('#hug-prompt').hidden,true);assert.equal(element('#hug-action').hidden,true);
 vm.runInContext(`state.players.forEach(p=>p.hugging=false);state.hugs=[];state.hugRequests=[{id:'request-two',from:'other',to:localId,fromName:'Other player'}];receiveState(state);`,sandbox);
 windowEvents.keydown({key:'q',repeat:false,target:{tagName:'CANVAS'},preventDefault(){}});assert.equal(sandbox.sentHug.accept,false);

 vm.runInContext(`state.hugRequests=[];receiveState(state);connection.send=message=>globalThis.sentMessage=message;setChatOpen(true);keys.add('d');update(.04);`,sandbox);
 assert.equal(element('#chat-panel').hidden,false);assert.equal(sandbox.sentInput.x,0);
 element('#chat-input').value='  Hello   Amy!  ';element('#chat-form').handlers.submit({preventDefault(){}});
 assert.equal(sandbox.sentMessage.type,'chat');assert.equal(sandbox.sentMessage.text,'Hello Amy!');
 vm.runInContext(`state.players[0].chat={id:'chat-one',text:'Hello Amy!',remainingMs:6000};receiveState(state);render();`,sandbox);
 assert.equal(element('#chat-input').value,'');assert.equal(element('#chat-feedback').textContent,'Sent.');
 assert.match(element('#chat-announcement').textContent,/Hello Amy!/);
 vm.runInContext(`sendChat(QUICK_MESSAGES[0]);`,sandbox);assert.equal(sandbox.sentMessage.text,'Hi!');
 windowEvents.keydown({key:'Escape',target:{tagName:'INPUT'},preventDefault(){}});assert.equal(element('#chat-panel').hidden,true);
 assert(readFileSync(new URL('../assets/tarin.json',import.meta.url),'utf8').includes('tarin-front'));
});
