import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {InventoryStore,createPersistentInventoryStore} from '../inventory-store.mjs';
import {ForestRoom} from '../multiplayer.js';
import {emptyInventory} from '../items.js';
import {SIZE,TILE} from '../world.js';
import {exposedRock} from '../mining.js';
function temporary(t){const dir=mkdtempSync(path.join(tmpdir(),'forest-inventory-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return path.join(dir,'inventories.json');}
function mine(room,p,advance){room.changeStage(p,'mine');const world=room.worldFor(p),ore=world.structures.find(s=>s.kind==='ore'&&exposedRock(world,Math.floor(s.x/TILE),Math.floor(s.y/TILE))),x=Math.floor(ore.x/TILE),y=Math.floor(ore.y/TILE),offset=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=>world.blocked[(y+dy)*SIZE+x+dx]===0);Object.assign(p,{x:(x+offset[0])*TILE+16,y:(y+offset[1])*TILE+16});for(let i=0;i<15;i++){room.mineTarget(p,x,y);advance();}return {world,ore,index:y*SIZE+x};}
test('atomic file saves keep separate character counts across new store instances',t=>{
 const filePath=temporary(t),store=new InventoryStore({filePath});assert.deepEqual(store.load('tarin'),emptyInventory());
 store.save('tarin',{copper:7,iron:3,gold:1});store.save('amy',{copper:2,iron:4,gold:5});
 const loaded=new InventoryStore({filePath});assert.deepEqual(loaded.load('tarin'),{copper:7,iron:3,gold:1});assert.deepEqual(loaded.load('amy'),{copper:2,iron:4,gold:5});
 const copy=loaded.load('tarin');copy.gold=99;assert.equal(loaded.load('tarin').gold,1);assert.deepEqual(readdirSync(path.dirname(filePath)),['inventories.json']);assert.equal(JSON.parse(readFileSync(filePath,'utf8')).version,1);
});
test('invalid saves or ore counts fail without overwriting existing saved inventory',t=>{
 const filePath=temporary(t),store=new InventoryStore({filePath});store.save('tarin',{copper:1});const original=readFileSync(filePath,'utf8');
 for(const count of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'12'])assert.throws(()=>store.save('tarin',{copper:count}),/Invalid/);
 assert.equal(readFileSync(filePath,'utf8'),original);assert.throws(()=>store.save('__proto__',{copper:10}),/Unknown/);
 for(const invalid of ['not json','null','{"version":2,"characters":{}}','{"version":1,"characters":{"amy":{"gold":-1}}}']){writeFileSync(filePath,invalid);assert.throws(()=>new InventoryStore({filePath}));assert.equal(readFileSync(filePath,'utf8'),invalid);}
});
test('logout, expired disconnects, removals, renamed logins and server restarts restore saved character inventory',t=>{
 const filePath=temporary(t);let now=1000;const makeRoom=()=>new ForestRoom([],{inventoryStore:new InventoryStore({filePath}),now:()=>now}),room=makeRoom(),advance=()=>{now+=50;room.tick(.05);};
 let tarin=room.join({name:'First T',character:'tarin'},{}),amy=room.join({name:'First A',character:'amy'},{});mine(room,tarin,advance);const tarinInventory={...tarin.inventory};assert.equal(Object.values(tarinInventory).reduce((a,b)=>a+b),1);
 // Already on disk before disconnect: a crash does not depend on browser logout.
 assert.deepEqual(new InventoryStore({filePath}).load('tarin'),tarinInventory);
 mine(room,amy,advance);const amyInventory={...amy.inventory};room.logout(tarin);room.leave(amy);now+=16000;room.tick(.05);assert(!room.sessions.has(amy.token));
 tarin=room.join({name:'Different name',character:'tarin'},{});amy=room.join({name:'Different A',character:'amy'},{});assert.deepEqual(tarin.inventory,tarinInventory);assert.deepEqual(amy.inventory,amyInventory);
 room.removePlayer(tarin,amy.id);amy=room.join({name:'Back again',character:'amy'},{});assert.deepEqual(amy.inventory,amyInventory);
 const restarted=makeRoom();assert.deepEqual(restarted.join({name:'Fresh browser',character:'tarin'},{}).inventory,tarinInventory);assert.deepEqual(restarted.join({name:'Another browser',character:'amy'},{}).inventory,amyInventory);
});
test('older disconnected sessions cannot roll back a character claimed and updated by someone else',()=>{
 let now=1000;const store=new InventoryStore(),room=new ForestRoom([],{inventoryStore:store,now:()=>now}),advance=()=>{now+=50;room.tick(.05);},old=room.join({name:'Old',character:'tarin'},{});
 mine(room,old,advance);room.leave(old);const current=room.join({name:'Current',character:'tarin'},{});mine(room,current,advance);const latest={...current.inventory};assert.equal(Object.values(latest).reduce((a,b)=>a+b),2);
 room.leave(current);const restored=room.join({name:'Old',character:'tarin',token:old.token},{});assert.deepEqual(restored.inventory,latest);room.logout(current);assert.deepEqual(store.load('tarin'),latest);
 room.leave(restored);const switched=room.join({name:'Old',character:'amy',token:old.token},{});assert.deepEqual(switched.inventory,emptyInventory());room.logout(switched);assert.deepEqual(store.load('tarin'),latest);
});
test('failed storage writes leave ore unbroken and inventory unchanged',()=>{
 let now=1000;const store=new InventoryStore(),errors=[],room=new ForestRoom([],{inventoryStore:store,now:()=>now,onInventoryError:(p,e)=>errors.push(e)}),p=room.join({name:'T',character:'tarin'},{});store.save=()=>{throw new Error('Disk full');};
 const {world,ore,index}=mine(room,p,()=>{now+=50;room.tick(.05);});assert(errors.length>0);assert.equal(world.blocked[index],1);assert(!world.minedOres.has(ore.id));assert.deepEqual(p.inventory,emptyInventory());
});

test('persistent store factory restores saved data in the configured directory',t=>{
 const filePath=temporary(t),dataDir=path.dirname(filePath),first=createPersistentInventoryStore({dataDir});
 first.save('tarin',{copper:10,iron:6,gold:2});
 assert.deepEqual(createPersistentInventoryStore({dataDir}).load('tarin'),{copper:10,iron:6,gold:2});
});
for(const character of ['tarin','amy'])test(`${character} keeps every collected ore across repeated regenerated mine visits, logout and disk reload`,t=>{
 const filePath=temporary(t);let now=1000;
 const createRoom=()=>new ForestRoom([],{inventoryStore:new InventoryStore({filePath}),now:()=>now});
 let room=createRoom(),p=room.join({name:'First name',character},{}),expected=emptyInventory();
 for(let visit=0;visit<4;visit++){
  const {ore}=mine(room,p,()=>{now+=50;room.tick(.05);});expected[ore.oreType]++;
  assert.deepEqual(new InventoryStore({filePath}).load(character),expected,'ore saved immediately before exiting');
  const version=p.mineVersion;room.changeStage(p,'forest');assert.deepEqual(room.snapshot(p.id).inventory,expected);
  room.changeStage(p,'mine');assert.notEqual(p.mineVersion,version);assert.deepEqual(room.snapshot(p.id).inventory,expected,'regenerated cave preserves inventory');
  room.logout(p);room=createRoom();p=room.join({name:`New browser ${visit}`,character},{});
  assert.deepEqual(room.snapshot(p.id).inventory,expected,'new session on restarted server restores every ore');
 }
});
