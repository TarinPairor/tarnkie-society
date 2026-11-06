import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SIZE,TILE,makeCave,moveActor} from '../world.js';
import {encodeTiles,decodeTiles,packCaveTerrain,applyCaveTerrain} from '../terrain.js';

test('every gray floor tile can be reached using real player movement and collision',()=>{
 for(const seed of ['TARIN-01','TARIN-01:mine-visit:1','TARIN-01:mine-visit:2','TARIN-01:mine-visit:3','curves-2']){
  const cave=makeCave(seed),start=Math.floor(cave.spawn.y/TILE)*SIZE+Math.floor(cave.spawn.x/TILE),queue=[start],seen=new Set(queue);
  for(let i=0;i<queue.length;i++){
   const index=queue[i],x=index%SIZE,y=Math.floor(index/SIZE);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,yy=y+dy,k=yy*SIZE+xx;if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||cave.tiles[k]!==4||seen.has(k))continue;
    const actor={x:x*TILE+16,y:y*TILE+16,radius:7};moveActor(cave,actor,dx*TILE,dy*TILE);
    assert(Math.abs(actor.x-(xx*TILE+16))<.001&&Math.abs(actor.y-(yy*TILE+16))<.001,`Blocked gray floor in ${seed} at ${xx},${yy}`);
    seen.add(k);queue.push(k);
   }
  }
  assert.equal(seen.size,cave.tiles.filter(t=>t===4).length,seed);
 }
});
test('server terrain replaces a mismatched client layout exactly',()=>{
 const server=makeCave('server-seed'),client=makeCave('server-seed'),packet=JSON.parse(JSON.stringify(packCaveTerrain(server)));
 client.tiles.fill(4);client.blocked.fill(1);applyCaveTerrain(client,packet);
 assert.deepEqual(client.tiles,server.tiles);assert.deepEqual(client.blocked,server.blocked);assert.deepEqual(client.structures,server.structures);
 assert.deepEqual(decodeTiles(encodeTiles(server.tiles)),server.tiles);
});
test('invalid terrain is rejected before it can make the rendered floor disagree with collision',()=>{
 for(const runs of [[],[4,0],[4,-1],[8,SIZE*SIZE],[4,SIZE*SIZE+1],[4,1,5]])assert.throws(()=>decodeTiles(runs));
 const cave=makeCave('validate'),packet=packCaveTerrain(cave);
 assert.throws(()=>applyCaveTerrain(cave,{...packet,seed:'other'}));assert.throws(()=>applyCaveTerrain(cave,{...packet,blocked:[1,SIZE*SIZE]}));
});

test('terrain packets cannot apply overworld obstacles to a cave or cave obstacles to the forest',async()=>{
 const {makeWorld}=await import('../world.js');const forest=makeWorld(),mine=makeCave();
 assert.throws(()=>packCaveTerrain(forest),/Only cave/);
 assert.throws(()=>applyCaveTerrain(forest,packCaveTerrain(mine)),/does not match/);
 assert.throws(()=>applyCaveTerrain(mine,{...packCaveTerrain(mine),stage:'forest'}),/does not match/);
});
