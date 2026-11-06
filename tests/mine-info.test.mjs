import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,makeCave} from '../world.js';
import {MINE_INFO,mineEntranceAt} from '../mine-info.js';
test('mine entrance hit target covers the shaft art and accepts taps without activating elsewhere',()=>{
 const world=makeWorld(),entrance=world.structures.find(s=>s.kind==='mine-entrance');
 assert.equal(mineEntranceAt(world,entrance.x,entrance.y),entrance);
 assert.equal(mineEntranceAt(world,entrance.x,entrance.y-70),entrance);
 assert.equal(mineEntranceAt(world,entrance.x+100,entrance.y),null);
 assert.equal(mineEntranceAt(makeCave(),entrance.x,entrance.y),null);
 assert.equal(MINE_INFO,'Magic mines! Ever time you enter some thing is different 😕');
});
