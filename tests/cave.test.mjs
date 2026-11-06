import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SIZE,TILE,MINE_ENTRANCE,makeWorld,makeCave,canStand,moveActor} from '../world.js';
import {ForestRoom} from '../multiplayer.js';

test('forest is slightly thinner and the northeast-of-center mineshaft has a reachable entrance',()=>{
 const world=makeWorld('TARIN-01'),portal=world.portals[0];assert(world.trees.length<3200);assert(world.trees.length>2200);
 assert.equal(portal.target,'mine');assert.equal(portal.x,MINE_ENTRANCE.x*TILE+16);assert.equal(portal.y,MINE_ENTRANCE.y*TILE+16);assert(portal.x>SIZE*TILE/2&&portal.x<SIZE*TILE*.65);assert(portal.y<SIZE*TILE/2&&portal.y>SIZE*TILE*.35);assert(canStand(world,portal.x,portal.y,7));
 assert(world.structures.some(s=>s.kind==='mine-entrance'));
 const queue=[[72,73]],seen=new Set();for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*SIZE+xx;if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||seen.has(k)||!canStand(world,xx*TILE+16,yy*TILE+16,7))continue;seen.add(k);queue.push([xx,yy]);}}
 assert(seen.has(Math.floor(portal.y/TILE)*SIZE+Math.floor(portal.x/TILE)));
});
test('caves are deterministic, seed-dependent, and every walkable tile connects to the entry',()=>{
 for(const seed of ['TARIN-01','cave-2','cave-3']){
  const cave=makeCave(seed);assert.deepEqual(cave,makeCave(seed));assert.equal(cave.stage,'mine');assert(canStand(cave,cave.spawn.x,cave.spawn.y));assert.equal(cave.rooms.length,35);
  const start=Math.floor(cave.spawn.y/TILE)*SIZE+Math.floor(cave.spawn.x/TILE),queue=[start],seen=new Set([start]);
  for(let i=0;i<queue.length;i++){const n=queue[i],x=n%SIZE,y=Math.floor(n/SIZE);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*SIZE+xx;if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||cave.blocked[k]||seen.has(k))continue;seen.add(k);queue.push(k);}}
  assert(seen.size>1000&&seen.size<5000);assert.equal(seen.size,cave.tiles.filter(t=>t===4).length);assert(cave.tiles.some(t=>t===5));
  assert(seen.has(Math.floor(cave.portals[0].y/TILE)*SIZE+Math.floor(cave.portals[0].x/TILE)));
 }
 assert.notDeepEqual(makeCave('one').tiles,makeCave('two').tiles);
});
test('cave walls block movement and floor tiles allow walking',()=>{
 const cave=makeCave(),actor={...cave.spawn,radius:7};const before=actor.y;moveActor(cave,actor,0,5);assert(actor.y>before);
 for(let i=0;i<cave.blocked.length;i+=11)if(cave.blocked[i])assert(!canStand(cave,(i%SIZE)*TILE+16,Math.floor(i/SIZE)*TILE+16,7));
});
test('walking into portals changes stages independently and the exit returns to the forest safely',()=>{
 let now=0;const room=new ForestRoom([],{now:()=>now}),a=room.join({name:'Tarin',character:'tarin'},{}),b=room.join({name:'Amy',character:'amy'},{});
 Object.assign(a,room.world.portals[0]);room.tick(.05);assert.equal(a.stage,'mine');assert.equal(b.stage,'forest');
 assert.equal(room.snapshot(a.id).stage,'mine');assert.equal(room.snapshot(a.id).players.length,1);assert.equal(room.snapshot(b.id).players.length,1);assert(canStand(room.worldFor(a),a.x,a.y));
 room.chat(a,'I am in the mine');assert.equal(room.chatHistory.at(-1).text,'I am in the mine');
 assert.throws(()=>room.hugs.request(b,a.id),/closer/);
 Object.assign(b,room.world.portals[0]);room.tick(.05);assert.equal(room.snapshot(a.id).players.length,2);
 now=2000;Object.assign(a,room.worlds.mine.portals[0]);room.tick(.05);assert.equal(a.stage,'forest');assert.equal(b.stage,'mine');assert(canStand(room.worldFor(a),a.x,a.y));
 const outside={x:a.x,y:a.y};room.tick(.05);assert.equal(a.stage,'forest');assert.equal(a.x,outside.x);assert.equal(a.y,outside.y);
});
test('reconnecting inside the mine preserves the stage and position',()=>{
 const room=new ForestRoom([]),a=room.join({name:'Tarin',character:'tarin'},{});room.changeStage(a,'mine');const x=a.x,y=a.y;room.leave(a);
 const resumed=room.join({name:'Tarin',character:'tarin',token:a.token},{});assert.equal(resumed.stage,'mine');assert.equal(resumed.x,x);assert.equal(resumed.y,y);
});

test('each mine exit prepares a different cave for the next entry without changing the forest',()=>{
 const room=new ForestRoom([]),a=room.join({name:'Tarin',character:'tarin'},{}),forest=room.world.tiles.slice();
 const layouts=[];
 for(let visit=0;visit<3;visit++){
  room.changeStage(a,'mine');layouts.push(room.worldFor(a));
  assert.equal(room.snapshot(a.id).worldSeed,room.worldFor(a).seed);assert(canStand(room.worldFor(a),a.x,a.y));
  room.changeStage(a,'forest');
 }
 assert.notDeepEqual(layouts[0].tiles,layouts[1].tiles);assert.notDeepEqual(layouts[1].tiles,layouts[2].tiles);
 assert.deepEqual(room.world.tiles,forest);assert.equal(room.mineWorlds.size,1);
});
test('players remaining underground keep their old cave while new entries get a fresh one',()=>{
 const room=new ForestRoom([]),a=room.join({name:'Tarin',character:'tarin'},{}),b=room.join({name:'Amy',character:'amy'},{});
 room.changeStage(a,'mine');room.changeStage(b,'mine');const old=room.worldFor(b);assert.equal(room.snapshot(a.id).players.length,2);
 room.changeStage(a,'forest');assert.equal(room.worldFor(b),old);assert.equal(room.snapshot(b.id).worldSeed,old.seed);
 room.changeStage(a,'mine');assert.notEqual(room.worldFor(a).seed,old.seed);assert.equal(room.worldFor(b),old);
 assert.equal(room.snapshot(a.id).players.length,1);assert.equal(room.snapshot(b.id).players.length,1);
 assert.throws(()=>room.hugs.request(a,b.id),/closer/);
 room.leave(b);const restored=room.join({name:'Amy',character:'amy',token:b.token},{});assert.equal(room.worldFor(restored),old);
});

test('tiny cave rooms stay within 3–5 tiles and tunnels stay 1–5 tiles wide',()=>{
 for(const seed of ['narrow-1','narrow-2','narrow-3']){
  const cave=makeCave(seed);assert(cave.passages.length>cave.rooms.length);
  for(const room of cave.rooms){assert(room.rx*2+1>=3&&room.rx*2+1<=5);assert(room.ry*2+1>=3&&room.ry*2+1<=5);}
  for(const passage of cave.passages){assert(passage.width>=1&&passage.width<=5);assert(passage.path.length>2);}
  // Chambers and tunnel junctions remain compact, with no open 11×11 square.
  const squares=new Uint8Array(SIZE*SIZE);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(!cave.blocked[y*SIZE+x]){const i=y*SIZE+x;squares[i]=1+Math.min(x?squares[i-1]:0,y?squares[i-SIZE]:0,x&&y?squares[i-SIZE-1]:0);assert(squares[i]<=10);}
 }
});

test('walking into the visible doorway transfers even when slightly off center',()=>{
 for(const offset of [-24,-16,0,16,24]){
  let now=0;const room=new ForestRoom([],{now:()=>now}),p=room.join({name:'Miner',character:'tarin'},{}),portal=room.world.portals[0];
  Object.assign(p,{x:portal.x+offset,y:portal.y+100});
  for(let i=0;i<100&&p.stage==='forest';i++){now+=50;room.input(p,{x:0,y:-1,run:false});room.tick(.05);}
  assert.equal(p.stage,'mine',`Entrance offset ${offset} must transfer`);assert(canStand(room.worldFor(p),p.x,p.y));
 }
});
test('explicit entry/exit actions work nearby, reject distant requests, and respect cooldown',()=>{
 let now=0;const room=new ForestRoom([],{now:()=>now}),p=room.join({name:'Miner',character:'tarin'},{});
 assert.throws(()=>room.usePortal(p),/closer/);
 const portal=room.world.portals[0];Object.assign(p,{x:portal.x,y:portal.y+70});room.usePortal(p);assert.equal(p.stage,'mine');
 assert.throws(()=>room.usePortal(p),/Wait/);now=2000;Object.assign(p,{x:room.worldFor(p).portals[0].x,y:room.worldFor(p).portals[0].y+60});room.usePortal(p);assert.equal(p.stage,'forest');
});

test('caves have curved passages, large multi-tunnel hubs, and alternate looping routes',()=>{
 for(const seed of ['curves-1','curves-2','curves-3']){
  const cave=makeCave(seed),hubs=cave.rooms.filter(room=>room.hub);assert.equal(hubs.length,4);
  assert(cave.passages.length>=cave.rooms.length+6);
  for(const room of hubs){
   assert(room.rx*2+1===5);assert(room.ry*2+1===5);
   const degree=cave.passages.filter(p=>(p.from.x===room.x&&p.from.y===room.y)||(p.to.x===room.x&&p.to.y===room.y)).length;
   assert(degree>=3,'Large sections must connect multiple tunnels');
  }
  for(const p of cave.passages){
   const dx=p.to.x-p.from.x,dy=p.to.y-p.from.y,length=Math.hypot(dx,dy);
   assert(p.path.some(point=>Math.abs(dx*(point.y-p.from.y)-dy*(point.x-p.from.x))/length>2),'Every tunnel must bend away from a straight centerline');
   for(let i=1;i<p.path.length;i++)assert(Math.hypot(p.path[i].x-p.path[i-1].x,p.path[i].y-p.path[i-1].y)<=Math.SQRT2);
  }
 }
});

test('mine movement ignores every overworld obstacle and forest movement ignores cave walls',()=>{
 const underground=new ForestRoom([]),miner=underground.join({name:'Miner',character:'tarin'},{});underground.changeStage(miner,'mine');
 const cave=underground.worldFor(miner);assert.notEqual(cave.blocked,underground.world.blocked);underground.world.blocked.fill(1);
 const mineY=miner.y;underground.input(miner,{x:0,y:1,run:false});underground.tick(.05);assert(miner.y>mineY,'Forest obstacles must not stop cave walking');
 const outside=new ForestRoom([]),walker=outside.join({name:'Walker',character:'tarin'},{});outside.worlds.mine.blocked.fill(1);
 const forestY=walker.y;outside.input(walker,{x:0,y:1,run:false});outside.tick(.05);assert(walker.y>forestY,'Cave walls must not stop forest walking');
 // Conversely, a real cave wall must stop the miner even if the forest is empty.
 underground.world.blocked.fill(0);const tx=Math.floor(miner.x/TILE),ty=Math.floor(miner.y/TILE)+1;cave.blocked[ty*SIZE+tx]=1;cave.tiles[ty*SIZE+tx]=5;
 for(let i=0;i<20;i++){underground.input(miner,{x:0,y:1,run:true});underground.tick(.05);}
 assert(miner.y<ty*TILE,'Mine collision must come from that mine instance');
});

test('single-tile tunnels stay connected through bends and the cave uses the full 1–5 width range',()=>{
 const widths=new Set();
 for(const seed of ['single-file-1','single-file-2','single-file-3']){
  const cave=makeCave(seed);
  for(const p of cave.passages){widths.add(p.width);for(let i=1;i<p.path.length;i++)assert.equal(Math.abs(p.path[i].x-p.path[i-1].x)+Math.abs(p.path[i].y-p.path[i-1].y),1,'Curves must have a cardinally connected path');}
 }
 assert.deepEqual([...widths].sort(),[1,2,3,4,5]);
});
