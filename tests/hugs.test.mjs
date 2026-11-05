import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ForestRoom} from '../multiplayer.js';
import {HUG_DURATION,HUG_REQUEST_TTL,HUG_RANGE} from '../hug-config.js';
import {walkingSprite} from '../animation.js';
import {canStand} from '../world.js';
function setup(){let time=100;const room=new ForestRoom([],{now:()=>time});const a=room.join({name:'Tarin',character:'tarin'},{}),b=room.join({name:'Amy',character:'amy'},{}),c=room.join({name:'Other',character:'amy'},{});return {room,a,b,c,advance:ms=>time+=ms};}
test('hug waits for the addressed player’s explicit consent and exposes only involved requests',()=>{
 const {room,a,b,c}=setup(),request=room.hugs.request(a,b.id);
 assert(!a.hugId);assert(!b.hugId);assert.equal(room.snapshot(b.id).hugRequests[0].id,request.id);assert.equal(room.snapshot(c.id).hugRequests.length,0);
 assert.throws(()=>room.hugs.respond(c,request.id,true),/no longer/);assert(!a.hugId);
 assert.throws(()=>room.hugs.respond(b,request.id,'true'),/Accept/);assert(!a.hugId);
 const hug=room.hugs.respond(b,request.id,true);assert.equal(a.hugId,hug.id);assert.equal(b.hugId,hug.id);assert.equal(room.snapshot(a.id).hugRequests.length,0);
 assert.equal(room.snapshot(a.id).hugs.length,1);assert.equal(room.snapshot(a.id).players.find(p=>p.id===b.id).hugging,true);
 assert(Math.hypot(a.x-b.x,a.y-b.y)<=21);assert(canStand(room.world,a.x,a.y));assert(canStand(room.world,b.x,b.y));
});
test('denial never animates, notifies the requester, and prevents immediate repeat spam',()=>{
 const {room,a,b}=setup();const request=room.hugs.request(a,b.id);room.hugs.respond(b,request.id,false);
 assert.equal(room.hugs.active.size,0);assert(!a.hugId);assert.match(room.snapshot(a.id).hugNotice.text,/declined/);assert.equal(room.snapshot(b.id).hugNotice,null);
 assert.throws(()=>room.hugs.request(a,b.id),/Wait/);
});
test('busy, self, distant, blocked, and expired requests cannot create hugs',()=>{
 const {room,a,b,c,advance}=setup();assert.throws(()=>room.hugs.request(a,a.id),/closer/);
 b.x+=HUG_RANGE+20;assert.throws(()=>room.hugs.request(a,b.id),/closer/);b.x=a.x;
 const r=room.hugs.request(a,b.id);assert.throws(()=>room.hugs.request(c,b.id),/progress/);assert.throws(()=>room.hugs.request(b,a.id),/progress/);
 advance(HUG_REQUEST_TTL+1);assert.throws(()=>room.hugs.respond(b,r.id,true),/expired/);assert.equal(room.hugs.active.size,0);
 advance(3000);b.x=a.x+32;const index=Math.floor(a.y/32)*144+Math.floor((a.x+b.x)/2/32);room.world.blocked[index]=1;assert.throws(()=>room.hugs.request(a,b.id),/closer/);
});
test('moving apart cancels the request and stale accept messages do nothing',()=>{
 const {room,a,b}=setup(),r=room.hugs.request(a,b.id);b.y+=HUG_RANGE+1;room.tick(.05);
 assert.equal(room.hugs.requests.size,0);assert.throws(()=>room.hugs.respond(b,r.id,true),/no longer/);assert.equal(room.hugs.active.size,0);
});
test('accepted hugs stop input, use hug poses, finish, and allow walking again',()=>{
 const {room,a,b,advance}=setup(),r=room.hugs.request(a,b.id);room.hugs.respond(b,r.id,true);
 const before={x:a.x,y:a.y};room.input(a,{x:0,y:1,run:true});room.tick(.1);assert.equal(a.y,before.y);assert.equal(a.walking,false);
 assert.equal(walkingSprite({hugging:true,walking:true},'tarin'),'tarin-hug');assert.equal(walkingSprite({hugging:true},'amy'),'amy-hug');
 advance(HUG_DURATION+1);room.tick(.05);assert.equal(room.hugs.active.size,0);assert(!a.hugId);assert(!b.hugId);
 room.input(a,{x:0,y:1,run:false});room.tick(.05);assert(a.y>before.y);
});
test('disconnects, logout, and world regeneration clean pending and active hugs',()=>{
 for(const action of ['leave','logout','reset']){
  const {room,a,b}=setup();const r=room.hugs.request(a,b.id);room.hugs.respond(b,r.id,true);
  if(action==='reset')room.reset('new');else room[action](a);
  assert.equal(room.hugs.active.size,0);assert(!b.hugId);
 }
 const {room,a,b}=setup();room.hugs.request(a,b.id);room.leave(b);assert.equal(room.hugs.requests.size,0);
});
test('bundled hug poses match Tarin’s supplied sprite and Amy’s authored pixel art',()=>{
 const actors=JSON.parse(readFileSync(new URL('../assets/actors.json',import.meta.url)));
 for(const [kind,prefix,size] of [['tarin','tarin',40],['amy','Amy',16]]){
  const source=JSON.parse(readFileSync(new URL(`../../retro-png-maker/exports/my-chars/${prefix}-hug-${size}x${size}.json`,import.meta.url)));
  const hug=actors[kind+'-hug'];assert.deepEqual(hug.pixels,source.pixels);assert.equal(hug.pixels.length,size*size);assert.notDeepEqual(hug.pixels,actors[kind].pixels);
 }
 assert.deepEqual(actors['amy-hug'].pixels.slice(0,6*16),actors.amy.pixels.slice(0,6*16));
});
