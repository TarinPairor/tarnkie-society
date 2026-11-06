import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ORES,rollOre,emptyInventory,inventorySlots} from '../items.js';
import {canMineBlock,exposedRock,miningRay,applyBrokenBlocks,MINING_REACH,MINING_SECONDS,ORE_MINING_SECONDS} from '../mining.js';
import {makeCave,TILE,SIZE,canStand,moveActor} from '../world.js';
import {ForestRoom} from '../multiplayer.js';
const xy=ore=>({x:Math.floor(ore.x/TILE),y:Math.floor(ore.y/TILE)});
function standBeside(world,{x,y}){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:(x+dx)*TILE+16,y:(y+dy)*TILE+16};if(canStand(world,p.x,p.y,7)&&canMineBlock(world,p,x,y))return p;}throw new Error('Rock is inaccessible');}
function setup(){let now=1000;const room=new ForestRoom([],{now:()=>now}),a=room.join({name:'T',character:'tarin'},{}),b=room.join({name:'A',character:'amy'},{});room.changeStage(a,'mine');room.changeStage(b,'mine');const world=room.worldFor(a);return {room,a,b,world,advance:(n=1)=>{for(let i=0;i<n;i++){now+=50;room.tick(.05);}}};}
function hold(room,p,target,advance,n=22){for(let i=0;i<n;i++){room.mineTarget(p,target.x,target.y);advance();}}
test('ore rarity follows copper 70%, iron 25%, gold 5%; inventory has 25 stacking slots',()=>{
 const counts=emptyInventory();for(let i=0;i<1000;i++)counts[rollOre(i/1000)]++;
 assert.deepEqual(counts,{copper:700,iron:250,gold:50});assert.equal(rollOre(.7),'iron');assert.equal(rollOre(.95),'gold');
 assert.equal(inventorySlots(emptyInventory()).filter(Boolean).length,0);const slots=inventorySlots({copper:123,iron:3,gold:1});assert.equal(slots.length,25);assert.deepEqual(slots[0],{type:'copper',count:123});assert.equal(slots.filter(Boolean).length,3);
});
test('ore is deterministic and buried veins stay hidden until adjacent rock is opened',()=>{
 const world=makeCave('ores'),ores=world.structures.filter(s=>s.kind==='ore');assert(ores.length>100);assert.deepEqual(ores,makeCave('ores').structures.filter(s=>s.kind==='ore'));assert.equal(new Set(ores.map(s=>s.id)).size,ores.length);
 const counts=emptyInventory();for(const ore of ores){assert(ORES[ore.oreType]);counts[ore.oreType]++;assert(world.blocked[xy(ore).y*SIZE+xy(ore).x]);}
 assert(counts.copper>counts.iron&&counts.iron>counts.gold&&counts.gold>0);
 const buried=ores.find(o=>!exposedRock(world,xy(o).x,xy(o).y)),{x,y}=xy(buried);assert.equal(exposedRock(world,x,y),false);applyBrokenBlocks(world,[y*SIZE+x-1]);assert(exposedRock(world,x,y));
});
test('five-block reach accepts its boundary and rejects distance, hidden rock, bounds and obstructed rays',()=>{
 const world={stage:'mine',blocked:new Uint8Array(SIZE*SIZE)},p={x:10*TILE+16,y:10*TILE+16};world.blocked[10*SIZE+15]=1;
 assert.equal(MINING_REACH,160);assert(canMineBlock(world,p,15,10));p.x-=.01;assert.equal(canMineBlock(world,p,15,10),false);p.x+=.01;
 assert.deepEqual(miningRay(world,p,1,0),{x:15,y:10});world.blocked[10*SIZE+12]=1;assert.equal(canMineBlock(world,p,15,10),false);assert.deepEqual(miningRay(world,p,1,0),{x:12,y:10});
 world.blocked.fill(1);world.blocked[10*SIZE+10]=0;assert.equal(canMineBlock(world,p,15,10),false);assert.equal(canMineBlock(world,p,-1,10),false);assert.equal(canMineBlock(world,p,12.5,10),false);assert.equal(canMineBlock({...world,stage:'forest'},p,11,10),false);
});
test('held mining shows progressive states then opens walkable rock without stone drops',()=>{
 const {room,a,world,advance}=setup();let target;
 for(let y=4;y<SIZE-4&&!target;y++)for(let x=4;x<SIZE-4;x++)if(exposedRock(world,x,y)&&!world.structures.some(o=>o.kind==='ore'&&xy(o).x===x&&xy(o).y===y)){target={x,y};break;}
 Object.assign(a,standBeside(world,target));hold(room,a,target,advance,7);assert(a.mining.progress>0&&a.mining.progress<1);assert(world.blocked[target.y*SIZE+target.x]);assert(room.snapshot(a.id).players.find(p=>p.id===a.id).mining.progress>0);
 hold(room,a,target,advance,15);assert.equal(world.blocked[target.y*SIZE+target.x],0);assert.equal(world.tiles[target.y*SIZE+target.x],4);assert.deepEqual(a.inventory,emptyInventory());assert(world.brokenBlocks.has(target.y*SIZE+target.x));
 moveActor(world,a,target.x*TILE+16-a.x,target.y*TILE+16-a.y);assert(Math.hypot(a.x-(target.x*TILE+16),a.y-(target.y*TILE+16))<1);
});
test('ore breaks award exactly once even when both players mine it; inventory survives stage changes and reconnects',()=>{
 const {room,a,b,world,advance}=setup(),ore=world.structures.find(o=>o.kind==='ore'&&exposedRock(world,xy(o).x,xy(o).y)),target=xy(ore);
 Object.assign(a,standBeside(world,target));Object.assign(b,{x:a.x,y:a.y});
 for(let i=0;i<22;i++){room.mineTarget(a,target.x,target.y);room.mineTarget(b,target.x,target.y);advance();}
 assert.equal(a.inventory[ore.oreType]+b.inventory[ore.oreType],1);assert(world.minedOres.has(ore.id));assert(room.snapshot(b.id).brokenBlocks.includes(target.y*SIZE+target.x));assert.deepEqual(room.snapshot(b.id).inventory,b.inventory);assert(!('inventory' in room.snapshot(b.id).players[0]));
 const saved={...a.inventory};room.changeStage(a,'forest');room.changeStage(a,'mine');assert.deepEqual(a.inventory,saved);
 const token=a.token;room.leave(a);assert.throws(()=>room.mineTarget(a,target.x,target.y),/Join/);const restored=room.join({name:'T',character:'tarin',token},{});assert.deepEqual(restored.inventory,saved);room.logout(restored);assert.deepEqual(room.join({name:'T',character:'tarin'},{}).inventory,saved);
});
test('release, target switches, timeout, movement out of range, hugs and stage changes stop breaking',()=>{
 const {room,a,world,advance}=setup(),ore=world.structures.find(o=>o.kind==='ore'&&exposedRock(world,xy(o).x,xy(o).y)),target=xy(ore);Object.assign(a,standBeside(world,target));
 hold(room,a,target,advance,2);room.mineTarget(a,null,null);advance(25);assert.equal(a.mining,null);assert(world.blocked[target.y*SIZE+target.x]);
 hold(room,a,target,advance,2);room.mineTarget(a,-1,0);assert.equal(a.mining,null);
 hold(room,a,target,advance,2);advance(20);assert.equal(a.mining,null);assert(world.blocked[target.y*SIZE+target.x]);
 hold(room,a,target,advance,2);a.x=0;a.y=0;advance();assert.equal(a.mining,null);
 Object.assign(a,standBeside(world,target));hold(room,a,target,advance,2);a.hugId='busy';advance();assert.equal(a.mining,null);delete a.hugId;
 hold(room,a,target,advance,2);room.changeStage(a,'forest');assert.equal(a.mining,null);advance(25);assert(world.blocked[target.y*SIZE+target.x]);
});
test('broken block updates apply idempotently only in caves, preserving separate overworld collision',()=>{
 const world=makeCave('updates'),index=world.blocked.findIndex((v,i)=>v&&i>3*SIZE);assert.deepEqual(applyBrokenBlocks(world,[index]),[index]);assert.deepEqual(applyBrokenBlocks(world,[index]),[]);assert.equal(world.tiles[index],4);assert.equal(world.blocked[index],0);
 const forest={stage:'forest',blocked:new Uint8Array([1]),tiles:new Uint8Array([1])};applyBrokenBlocks(forest,[0]);assert.equal(forest.blocked[0],1);
});

for(const type of ['stone','copper','iron','gold'])test(`${type} breaks after exactly ${type==='stone'?'0.5':'0.7'} seconds`,()=>{
 assert.equal(MINING_SECONDS,.5);assert.equal(ORE_MINING_SECONDS,.7);
 const {room,a,world,advance}=setup(),ore=world.structures.find(o=>o.kind==='ore'&&exposedRock(world,xy(o).x,xy(o).y)),target=xy(ore);
 if(type==='stone')world.structures=world.structures.filter(o=>o!==ore);else ore.oreType=type;
 Object.assign(a,standBeside(world,target));
 hold(room,a,target,advance,type==='stone'?9:13);assert.equal(world.blocked[target.y*SIZE+target.x],1);
 hold(room,a,target,advance,1);assert.equal(world.blocked[target.y*SIZE+target.x],0);
 assert.deepEqual(a.inventory,type==='stone'?emptyInventory():{...emptyInventory(),[type]:1});
});
