import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SIZE,TILE,canStand,moveActor,makeWorld} from '../world.js';
import {TREE_WIDTH,TREE_HEIGHT,hiddenByTrees,treeCoversPoint} from '../trees.js';

test('trees have larger canopies but block just the small trunk footprint',()=>{
 const world={blocked:new Uint8Array(SIZE*SIZE)},tx=10,ty=10;world.blocked[ty*SIZE+tx]=2;
 assert(TREE_WIDTH>58);assert(TREE_HEIGHT>77);
 assert.equal(canStand(world,tx*TILE+16,ty*TILE+26,7),false);
 assert.equal(canStand(world,tx*TILE+16,ty*TILE+10,7),true);
 assert.equal(canStand(world,tx*TILE+3,ty*TILE+26,7),true);
 const actor={x:tx*TILE+16,y:ty*TILE+10,radius:7};moveActor(world,actor,0,40);assert(actor.y<ty*TILE+26);assert(canStand(world,actor.x,actor.y,7));
});
test('small trunks still collide with large actor boxes that contain the entire footprint',()=>{
 const world={blocked:new Uint8Array(SIZE*SIZE)};world.blocked[10*SIZE+10]=2;
 assert.equal(canStand(world,10*TILE+16,10*TILE+26,10),false);
 world.blocked[10*SIZE+10]=1;assert.equal(canStand(world,10*TILE+3,10*TILE+3,1),false);
});
test('a player can stand under opaque foliage and stays hidden from all viewers',()=>{
 const tree={x:336,y:345,size:1,variant:0},actor={x:336,y:330,kind:'tarin'};
 assert.equal(hiddenByTrees([tree],actor),true);
 assert.equal(hiddenByTrees([tree],{...actor,kind:'amy'}),true);
 assert.equal(treeCoversPoint(tree,actor.x,actor.y-25),true);
 assert.equal(hiddenByTrees([tree],{...actor,y:355}),false);
 assert.equal(hiddenByTrees([tree],{...actor,x:400}),false);
});
test('pine canopy cutouts do not incorrectly conceal players beside the tree',()=>{
 const pine={x:336,y:345,size:1,variant:1};
 assert.equal(treeCoversPoint(pine,310,265),false);
 assert.equal(hiddenByTrees([pine],{x:336,y:330,kind:'tarin'}),true);
});
test('generated trees use trunk collision while buildings retain solid collision',()=>{
 const world=makeWorld('trunks');
 for(const t of world.trees.slice(0,50)){
  const tx=Math.floor(t.x/TILE),ty=Math.floor(t.y/TILE);assert.equal(world.blocked[ty*SIZE+tx],2);
  assert(!canStand(world,t.x,ty*TILE+26,4));
 }
 for(const s of world.structures.filter(s=>s.kind==='house'))assert.equal(world.blocked[Math.floor(s.y/TILE)*SIZE+Math.floor(s.x/TILE)],1);
});
