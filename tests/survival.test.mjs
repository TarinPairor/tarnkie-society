import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ForestRoom} from '../multiplayer.js';
import {InventoryStore} from '../inventory-store.mjs';
import {emptyInventory} from '../items.js';
const types=[{id:'spider',name:'Cave spider',category:'Monsters'},{id:'frog',name:'Frog',category:'Creatures'}];
function setup(options={}){let now=1000;const room=new ForestRoom(types,{...options,now:()=>now}),a=room.join({name:'T',character:'tarin'},{}),b=room.join({name:'A',character:'amy'},{});return {room,a,b,advance:(n=1)=>{for(let i=0;i<n;i++){now+=50;room.tick(.05);}}};}
function enemy(p,kind='spider'){return {kind,x:p.x,y:p.y,homeX:p.x,homeY:p.y,radius:5,state:'idle',timer:100,speed:24,angle:0,phase:0};}
function give(room,p,items={copper:9,iron:4,gold:2}){Object.assign(p.inventory,items);room.inventoryStore.save(p.kind,p.inventory);return {...p.inventory};}
test('monster contact kills once, drops every ore, and clears saved inventory immediately',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'forest-death-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filePath=path.join(dir,'inventory.json');
 const {room,a,advance}=setup({inventoryStore:new InventoryStore({filePath})});room.changeStage(a,'mine');const world=room.worldFor(a),items=give(room,a);world.creatures=[enemy(a)];
 room.input(a,{x:1,y:0});advance();assert.equal(a.dead,true);assert.equal(a.walking,false);assert.deepEqual(a.inventory,emptyInventory());assert.deepEqual(new InventoryStore({filePath}).load('tarin'),emptyInventory());
 assert.equal(world.drops.length,1);assert.deepEqual(world.drops[0].items,items);assert.equal(world.drops[0].x,a.x);assert.equal(world.drops[0].y,a.y);assert.equal(room.snapshot(a.id).players.find(p=>p.id===a.id).dead,true);
 advance(30);assert.equal(world.drops.length,1);assert.deepEqual(a.inventory,emptyInventory());
});
test('animals are harmless, forest monsters are lethal, and other cave instances cannot hit you',()=>{
 const {room,a,b,advance}=setup();room.creatures=[enemy(a,'frog')];advance();assert.equal(a.dead,false);
 room.creatures=[enemy(a)];advance();assert.equal(a.dead,true);room.survival.respawn(a);room.creatures=[];
 room.changeStage(a,'mine');room.changeStage(b,'mine');const old=room.worldFor(b);old.creatures=[];room.changeStage(a,'forest');room.changeStage(a,'mine');const fresh=room.worldFor(a);fresh.creatures=[];old.creatures=[enemy(a)];advance();assert.equal(a.dead,false);
});
test('dead players cannot move, mine, enter portals, chat, hug, pick up loot or respawn automatically',()=>{
 const {room,a,b,advance}=setup();room.changeStage(a,'mine');room.changeStage(b,'mine');const world=room.worldFor(a);give(room,a);world.creatures=[enemy(a)];advance();const position={x:a.x,y:a.y};
 room.input(a,{x:1,y:1,run:true});room.mineTarget(a,10,10);room.changeStage(a,'forest');assert.equal(a.stage,'mine');assert.throws(()=>room.usePortal(a),/Respawn/);assert.throws(()=>room.chat(a,'Hello'),/Respawn/);assert.throws(()=>room.hugs.request(a,b.id),/closer/);
 // Move the living player away so it cannot pick up this bag during the test.
 room.changeStage(b,'forest');advance(80);assert.equal(a.dead,true);assert.deepEqual({x:a.x,y:a.y},position);assert.deepEqual(a.inventory,emptyInventory());assert.equal(a.mining,null);assert.equal(world.drops.length,1);
 room.leave(a);const restored=room.join({name:'T',character:'tarin',token:a.token},{});assert.equal(restored.dead,true);room.logout(restored);const renamed=room.join({name:'New T',character:'tarin'},{});assert.equal(renamed.dead,true);assert.deepEqual(renamed.inventory,emptyInventory());
});
test('respawn requires a dead active session, returns to the stage entry, and permits recovering the loot once',()=>{
 const {room,a,advance}=setup();assert.throws(()=>room.survival.respawn(a),/already alive/);room.changeStage(a,'mine');const world=room.worldFor(a),items=give(room,a);a.y+=64;world.creatures=[enemy(a)];advance();const drop={...world.drops[0]};
 room.survival.respawn(a);assert.equal(a.dead,false);assert.equal(a.x,world.spawn.x);assert.equal(a.y,world.spawn.y);assert.deepEqual(a.inventory,emptyInventory());assert.equal(world.drops.length,1);
 Object.assign(world.creatures[0],{x:a.x,y:a.y});advance();assert.equal(a.dead,false,'short spawn grace prevents immediate death');world.creatures=[];
 Object.assign(a,{x:drop.x,y:drop.y});advance();assert.deepEqual(a.inventory,items);assert.equal(world.drops.length,0);assert.deepEqual(room.inventoryStore.load(a.kind),items);advance();assert.deepEqual(a.inventory,items);
 room.leave(a);assert.throws(()=>room.survival.respawn(a),/Join/);
});
test('any living player can collect a bag, and simultaneous collectors cannot duplicate it',()=>{
 const {room,a,b,advance}=setup();const items=give(room,a);room.creatures=[enemy(a)];room.survival.contact(a);room.creatures=[];Object.assign(b,{x:a.x,y:a.y});advance();assert.deepEqual(b.inventory,items);assert.deepEqual(a.inventory,emptyInventory());assert.equal(room.world.drops.length,0);advance();assert.deepEqual(b.inventory,items);
});
test('leaving a cave with dropped ore retains it and re-entering returns to the recoverable cave',()=>{
 const {room,a,advance}=setup();room.changeStage(a,'mine');const world=room.worldFor(a),version=a.mineVersion;give(room,a);world.creatures=[enemy(a)];advance();world.creatures=[];room.survival.respawn(a);
 // The loot is at the spawn point, so exit before a tick can pick it up.
 room.changeStage(a,'forest');room.pruneMines();assert(room.mineWorlds.has(version));assert.equal(world.drops.length,1);room.changeStage(a,'mine');assert.equal(room.worldFor(a),world);advance();assert.equal(world.drops.length,0);assert.equal(a.inventory.copper,9);
});
test('storage failure cannot create a duplicate death bag or destroy inventory during pickup',()=>{
 const errors=[],{room,a,advance}=setup({onInventoryError:(p,e)=>errors.push(e)}),items=give(room,a),save=room.inventoryStore.save.bind(room.inventoryStore);room.inventoryStore.save=()=>{throw new Error('Disk full');};room.creatures=[enemy(a)];advance();assert.equal(a.dead,false);assert.deepEqual(a.inventory,items);assert.equal(room.world.drops,undefined);assert(errors.length>0);
 room.inventoryStore.save=save;room.survival.contact(a);room.creatures=[];room.survival.respawn(a);room.inventoryStore.save=()=>{throw new Error('Disk full');};advance();assert.equal(room.world.drops.length,1);assert.deepEqual(a.inventory,emptyInventory());
 room.inventoryStore.save=save;advance();assert.equal(room.world.drops.length,0);assert.deepEqual(a.inventory,items);
});

test('two living players reaching the same bag receive only one copy in total',()=>{
 const {room,a,b,advance}=setup(),items=give(room,a);room.creatures=[enemy(a)];room.survival.contact(a);room.creatures=[];room.survival.respawn(a);Object.assign(b,{x:a.x,y:a.y});advance();
 for(const type of Object.keys(items))assert.equal(a.inventory[type]+b.inventory[type],items[type]);assert.equal(room.world.drops.length,0);
});

test('a pursuing cave spider reaches contact range and kills its target',()=>{
 const {room,a,advance}=setup();room.changeStage(a,'mine');const world=room.worldFor(a);give(room,a);world.creatures=[{...enemy(a),y:a.y-60}];
 advance();assert.equal(a.dead,false);assert.equal(world.creatures[0].targetId,a.id);advance(35);assert.equal(a.dead,true);assert.equal(world.drops.length,1);
});
