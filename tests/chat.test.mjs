import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ForestRoom} from '../multiplayer.js';
import {CHAT_DURATION,CHAT_LIMIT,CHAT_COOLDOWN,QUICK_MESSAGES,cleanChat,wrapChat} from '../chat.js';
const setup=()=>{let now=0;const room=new ForestRoom([],{now:()=>now}),a=room.join({name:'Sender',character:'tarin'},{}),b=room.join({name:'Reader',character:'amy'},{});return {room,a,b,advance:n=>now+=n};};
test('chat preserves Unicode and literal markup, normalizes whitespace, and validates length',()=>{
 assert.equal(cleanChat('  Hi   Amy!\n ❤️ '),'Hi Amy! ❤️');assert.equal(cleanChat('<b>Hello</b>'),'<b>Hello</b>');
 for(const value of ['',null,{},'\n\t','\u0000','a'.repeat(CHAT_LIMIT+1)])assert.throws(()=>cleanChat(value));
 for(const message of QUICK_MESSAGES)assert.equal(cleanChat(message),message);
});
test('server attributes speech to the connected sender and expires overhead messages',()=>{
 const {room,a,b,advance}=setup();room.chat(a,'Hello!');
 const fromB=room.snapshot(b.id).players.find(p=>p.id===a.id);assert.equal(fromB.chat.text,'Hello!');assert.equal(fromB.name,'Sender');assert.equal(fromB.chat.remainingMs,CHAT_DURATION);
 assert.equal(room.snapshot(a.id).players.find(p=>p.id===b.id).chat,null);
 advance(CHAT_DURATION+1);assert.equal(room.snapshot(b.id).players.find(p=>p.id===a.id).chat,null);
});
test('spam cooldown is per player, newest message replaces the old bubble, and invalid messages do not consume cooldown',()=>{
 const {room,a,b,advance}=setup();assert.throws(()=>room.chat(a,''));room.chat(a,'One');assert.throws(()=>room.chat(a,'Two'),/Wait/);
 assert.doesNotThrow(()=>room.chat(b,'Hi!'));advance(CHAT_COOLDOWN);room.chat(a,'Two');assert.equal(room.snapshot().players.find(p=>p.id===a.id).chat.text,'Two');
});
test('leave and world resets clear speech; inactive or forged sessions cannot send',()=>{
 const {room,a,b}=setup();room.chat(a,'Before');room.reset('new');assert.equal(room.snapshot().players.find(p=>p.id===a.id).chat,null);
 assert.throws(()=>room.chat({...b},'Forged'),/Join/);room.leave(a);assert.equal(a.chat,null);assert.throws(()=>room.chat(a,'After'),/Join/);
});
test('bubbles wrap long words, Unicode and phrases without dropping text',()=>{
 for(const text of ['hello my friend','a'.repeat(140),'你好一起散步吧','❤️ hello!']){
  const lines=wrapChat(text,s=>Array.from(s).length*6,60);assert(lines.every(line=>Array.from(line).length<=10));assert.equal(lines.join('').replace(/ /g,''),text.replace(/ /g,''));
 }
});
