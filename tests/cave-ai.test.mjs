import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeCaveMonsters,updateCaveMonster,outsidePlayerViews,CAVE_NOTICE_RADIUS,CAVE_FOLLOW_RADIUS,CAVE_CHASE_SPEED,CAVE_MONSTER_LIMIT} from '../cave-ai.js';
import {TILE,SIZE,SPRINT_SPEED,makeCave,canStand} from '../world.js';
import {ForestRoom} from '../multiplayer.js';
const types=[{id:'spider',name:'Cave spider',category:'Monsters'}];
const spider=(x=1000,y=1000)=>({id:'spider',x,y,homeX:x,homeY:y,radius:5,speed:24,state:'idle',timer:1,angle:0,flip:false,walking:false,targetId:null});
const openWorld=()=>({stage:'mine',blocked:new Uint8Array(SIZE*SIZE),brokenBlocks:new Set()});
function camera(p,w=800,h=500){return {x:Math.max(0,p.x-w/2),y:Math.max(0,p.y-h/2),width:w,height:h};}
test('rare cave spiders spawn only in large natural chambers outside every current camera',()=>{
 for(const seed of ['TARIN-01','cave-spiders','another-mine']){
  const world=makeCave(seed),players=[{...world.spawn,view:camera(world.spawn)}];
  const actors=makeCaveMonsters(world,types,players);assert(actors.length>0);assert(actors.length<=CAVE_MONSTER_LIMIT);assert.deepEqual(actors,makeCaveMonsters(world,types,players));
  for(const a of actors){assert.equal(a.kind,'spider');assert.equal(a.stage,'mine');assert(canStand(world,a.x,a.y,5));assert(outsidePlayerViews(a.x,a.y,players));assert(world.rooms.some(r=>r.rx>=2&&r.ry>=2&&a.x===r.x*TILE+16&&a.y===r.y*TILE+16));}
  const watcher={x:actors[0].x,y:actors[0].y,view:camera(actors[0])};assert(!makeCaveMonsters(world,types,[...players,watcher]).some(a=>a.x===watcher.x&&a.y===watcher.y));
 }
});
test('spawns wait for camera bounds and never appear in a full-map viewport or without a monster asset',()=>{
 const world=makeCave('view');assert.deepEqual(makeCaveMonsters(world,types,[{...world.spawn}]),[]);assert.deepEqual(makeCaveMonsters(world,types,[]),[]);
 assert.deepEqual(makeCaveMonsters(world,types,[{view:{x:0,y:0,width:SIZE*TILE,height:SIZE*TILE}}]),[]);assert.deepEqual(makeCaveMonsters(world,[],[{view:camera(world.spawn)}]),[]);
});
test('spiders acquire at 15 blocks, retain to 20, and chase at exactly one third sprint speed',()=>{
 const world=openWorld(),a=spider(1008,1008),p={id:'t',x:a.x+15*TILE+.1,y:a.y};
 updateCaveMonster(world,a,[p],.05,()=>.5);assert.equal(a.targetId,null);p.x-=.1;
 const old=a.x;updateCaveMonster(world,a,[p],.05);assert.equal(a.targetId,'t');assert.equal(a.state,'follow');assert.equal(CAVE_CHASE_SPEED,SPRINT_SPEED/3);assert(Math.abs(a.x-old-CAVE_CHASE_SPEED*.05)<1e-8);
 p.x=a.x+19*TILE;updateCaveMonster(world,a,[p],.05);assert.equal(a.targetId,'t');
 p.x=a.x+CAVE_FOLLOW_RADIUS+.1;updateCaveMonster(world,a,[p],.05,()=>.5);assert.equal(a.targetId,null);assert.equal(a.state,'idle');
 const boundary=spider(1008,1008);boundary.targetId='t';p.x=boundary.x+CAVE_FOLLOW_RADIUS;p.y=boundary.y;updateCaveMonster(world,boundary,[p],.05);assert.equal(boundary.targetId,'t');assert.equal(CAVE_NOTICE_RADIUS,15*TILE);
});
test('idle spiders alternate normal animal wandering and idling, and stop chasing departed targets',()=>{
 const world=openWorld(),a=spider();a.timer=0;updateCaveMonster(world,a,[],.1,()=>0);assert.equal(a.state,'wander');assert(a.walking);assert.equal(a.x,1002.4);
 a.timer=0;updateCaveMonster(world,a,[],.1,()=>0);assert.equal(a.state,'idle');assert.equal(a.walking,false);
 a.targetId='departed';a.state='follow';updateCaveMonster(world,a,[],.05,()=>.5);assert.equal(a.targetId,null);assert.equal(a.state,'idle');
});
test('pathfinding follows around bends in one-tile tunnels without crossing rock',()=>{
 const world=openWorld();world.blocked.fill(1);
 for(let x=10;x<=16;x++)world.blocked[10*SIZE+x]=0;for(let y=10;y<=16;y++)world.blocked[y*SIZE+16]=0;
 const a=spider(10*TILE+16,10*TILE+16),p={id:'t',x:16*TILE+16,y:16*TILE+16};let turned=false;
 for(let i=0;i<200;i++){const before={x:a.x,y:a.y};updateCaveMonster(world,a,[p],.05);assert(canStand(world,a.x,a.y,5));assert(Math.hypot(a.x-before.x,a.y-before.y)<=CAVE_CHASE_SPEED*.05+1e-8);if(a.y>11*TILE)turned=true;}
 assert(turned);assert(Math.hypot(a.x-p.x,a.y-p.y)<=18);
});
test('cave monster state is shared only within its mine instance and old instances keep their own population',()=>{
 const room=new ForestRoom(types),a=room.join({name:'T',character:'tarin'},{}),b=room.join({name:'A',character:'amy'},{});room.changeStage(a,'mine');room.tick(.05);assert.equal(room.snapshot(a.id).creatures.length,0);
 const report=p=>room.input(p,{x:0,y:0,view:{...camera(p),stage:p.stage,seed:room.worldFor(p).seed}});
 report(a);room.tick(.05);const cave=room.worldFor(a),actors=cave.creatures;assert(actors.length>0);assert(room.snapshot(a.id).creatures.every(c=>c.stage==='mine'));assert(!room.snapshot(b.id).creatures.some(c=>c.id.startsWith('cave-creature-')));
 room.changeStage(b,'mine');report(b);room.tick(.05);assert.deepEqual(room.snapshot(a.id).creatures,room.snapshot(b.id).creatures);assert.equal(cave.creatures,actors);
 room.changeStage(a,'forest');room.changeStage(a,'mine');assert.notEqual(room.worldFor(a),cave);assert.equal(room.worldFor(b).creatures,actors);report(a);room.tick(.05);assert(room.worldFor(a).creatures.length>0);assert.notEqual(room.worldFor(a).creatures,actors);
 const target=actors[0];Object.assign(b,{x:target.x+30,y:target.y});room.tick(.05);assert.equal(target.targetId,b.id);room.changeStage(b,'forest');room.tick(.05);assert(!room.snapshot(a.id).players.some(p=>p.id===b.id));
});
