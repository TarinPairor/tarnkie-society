import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceWalk,walkingSprite,spriteFlip} from '../animation.js';
const actors=JSON.parse(readFileSync(new URL('../assets/actors.json',import.meta.url)));

test('Tarin and Amy alternate two steps, loop, and return to standing when stopped',()=>{
 for(const [kind,stride] of [['tarin',14],['amy',6]]){
  const actor={walking:false};assert.equal(walkingSprite(actor,kind),kind);
  actor.walking=true;advanceWalk(actor,1);assert.equal(walkingSprite(actor,kind),kind+'-walk-1');
  advanceWalk(actor,stride);assert.equal(walkingSprite(actor,kind),kind+'-walk-2');
  advanceWalk(actor,stride);assert.equal(walkingSprite(actor,kind),kind+'-walk-1');
  actor.walking=false;advanceWalk(actor,0);assert.equal(walkingSprite(actor,kind),kind);assert.equal(actor.walkDistance,0);
 }
 assert.equal(walkingSprite({walking:true,walkDistance:20},'frog'),'frog');
});
test('walking cadence follows actual travel, not elapsed time or held keys',()=>{
 const walking={walking:true},running={walking:true};
 for(let i=0;i<10;i++){advanceWalk(walking,2);advanceWalk(running,3.4);}
 assert(Math.abs(running.walkDistance/walking.walkDistance-1.7)<.001);
 const before=running.walkDistance;walkingSprite(running,'tarin');walkingSprite(running,'tarin');assert.equal(running.walkDistance,before);
 running.walking=false;advanceWalk(running,0);assert.equal(walkingSprite(running,'tarin'),'tarin');
});
test('bundled frames use the supplied custom art and keep consistent dimensions',()=>{
 for(const [kind,size,sourcePrefix] of [['tarin',40,'tarin'],['amy',16,'Amy']]){
  const idle=actors[kind];assert.equal(idle.width,size);assert.equal(idle.height,size);
  const frames=[1,2].map(i=>actors[`${kind}-walk-${i}`]);
  for(const [i,frame] of frames.entries()){
   assert.equal(frame.width,size);assert.equal(frame.height,size);assert.equal(frame.pixels.length,size*size);
   assert.notDeepEqual(frame.pixels,idle.pixels);
   const source=JSON.parse(readFileSync(new URL(`../../retro-png-maker/exports/my-chars/${sourcePrefix}-walk-${i+1}-${size}x${size}.json`,import.meta.url)));
   assert.deepEqual(frame.pixels,source.pixels);
  }
  assert.notDeepEqual(frames[0].pixels,frames[1].pixels);
 }
 for(const n of [1,2])assert.deepEqual(actors[`amy-walk-${n}`].pixels.slice(0,9*16),actors.amy.pixels.slice(0,9*16));
});

test('Tarin’s left-facing source is mirrored for rightward movement only',()=>{
 for(const distance of [0,14]){
  const left={walking:true,walkDistance:distance,flip:true},right={walking:true,walkDistance:distance,flip:false};
  assert.match(walkingSprite(left,'tarin'),/^tarin-walk-/);
  assert.equal(spriteFlip(left,'tarin'),false);assert.equal(spriteFlip(right,'tarin'),true);
 }
 assert.equal(spriteFlip({hugging:true,flip:true},'tarin'),false);
 assert.equal(spriteFlip({hugging:true,flip:false},'amy'),false);
 assert.equal(spriteFlip({flip:true},'amy'),true);
});
