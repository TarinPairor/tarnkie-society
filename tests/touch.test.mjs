import {test} from 'node:test';
import assert from 'node:assert/strict';
import {joystickVector,createTouchControls} from '../touch.js';
function element(){const handlers={},capture=new Set(),attributes={};return {handlers,attributes,style:{},addEventListener(n,f){handlers[n]=f;},setAttribute(n,v){attributes[n]=v;},setPointerCapture(id){capture.add(id);},hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id),getBoundingClientRect:()=>({left:10,top:20,width:132,height:132})};}
const event=(pointerId,clientX=76,clientY=86)=>({pointerId,clientX,clientY,button:0,preventDefault(){}});
function setup(){const joystick=element(),thumb=element(),sprint=element();let active=true;const control=createTouchControls({joystick,thumb,sprint,enabled:()=>active});return {joystick,thumb,sprint,control,disable:()=>active=false};}

test('joystick dead zone removes drift and bounds diagonal input to a unit circle',()=>{
 assert.equal(joystickVector(2,2,40).x,0);assert.equal(joystickVector(2,2,40).y,0);
 const diagonal=joystickVector(100,100,40);assert(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-10);assert(Math.abs(Math.hypot(diagonal.thumbX,diagonal.thumbY)-40)<1e-10);
 assert(joystickVector(20,0,40).x>0&&joystickVector(20,0,40).x<1);
 assert.deepEqual(joystickVector(0,0,40),{x:0,y:0,thumbX:0,thumbY:0});
});
test('two thumbs can steer and sprint independently, with captured touches outside controls',()=>{
 const {joystick,sprint,control}=setup();
 joystick.handlers.pointerdown(event(1,500,86));assert.equal(control.input().x,1);
 sprint.handlers.pointerdown(event(2));assert.equal(control.input().run,true);
 joystick.handlers.pointermove(event(1,76,-100));assert.equal(control.input().y,-1);assert.equal(control.input().run,true);
 sprint.handlers.pointerup(event(2));assert.equal(control.input().run,false);assert.equal(control.input().y,-1);
 joystick.handlers.pointerup(event(1));assert.deepEqual(control.input(),{x:0,y:0,run:false});
});
test('unrelated fingers cannot hijack the joystick or release another finger’s sprint',()=>{
 const {joystick,sprint,control}=setup();joystick.handlers.pointerdown(event(1,500,86));
 joystick.handlers.pointerdown(event(3,76,0));joystick.handlers.pointermove(event(3,76,0));joystick.handlers.pointerup(event(3));assert.equal(control.input().x,1);
 sprint.handlers.pointerdown(event(2));sprint.handlers.pointerup(event(4));assert.equal(control.input().run,true);
});
test('pointer cancellation, capture loss, and menu resets stop movement and release sprint',()=>{
 for(const reason of ['pointercancel','lostpointercapture']){
  const {joystick,sprint,thumb,control}=setup();joystick.handlers.pointerdown(event(1,0,86));sprint.handlers.pointerdown(event(2));
  joystick.handlers[reason](event(1));sprint.handlers[reason](event(2));assert.deepEqual(control.input(),{x:0,y:0,run:false});assert.equal(thumb.style.transform,'translate(0px, 0px)');
 }
 const {joystick,sprint,control,disable}=setup();joystick.handlers.pointerdown(event(1,0,86));sprint.handlers.pointerdown(event(2));control.reset();assert.deepEqual(control.input(),{x:0,y:0,run:false});assert(!joystick.hasPointerCapture(1));assert(!sprint.hasPointerCapture(2));
 disable();joystick.handlers.pointerdown(event(3,500,86));sprint.handlers.pointerdown(event(4));assert.deepEqual(control.input(),{x:0,y:0,run:false});
});
