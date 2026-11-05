import {cleanChat,CHAT_DURATION,CHAT_COOLDOWN} from './chat.js';
import {Hugs} from './hugs.js';
import {randomUUID} from 'node:crypto';
import {makeWorld,makeCreatures,moveActor,updateCreature} from './world.js';
import {advanceWalk} from './animation.js';

export class ForestRoom {
 constructor(types,{seed='TARIN-01',now=()=>Date.now()}={}){
  this.types=types;this.now=now;this.sessions=new Map();this.sequence=0;this.hugs=new Hugs(this);this.reset(seed);
 }
 reset(seed){this.hugs.reset();this.world=makeWorld(seed);this.creatures=makeCreatures(this.world,this.types);this.sequence++;
  for(const p of this.sessions.values()){Object.assign(p,this.world.spawn,{walking:false,walkDistance:0,input:{x:0,y:0,run:false},chat:null});}
 }
 join({name,character,token},connection){
  if(typeof name!=='string'||!name.trim()||name.trim().length>24||/[\u0000-\u001f\u007f]/.test(name))throw new Error('Enter a name from 1 to 24 characters.');
  if(!['tarin','amy'].includes(character))throw new Error('Choose Tarin or Amy.');
  name=name.trim();let p=this.sessions.get(token);
  if(p?.connection)throw new Error('This session is already connected.');
  if([...this.sessions.values()].some(other=>other!==p&&other.name.toLowerCase()===name.toLowerCase()))throw new Error('That name is already in the forest. Choose another.');
  if(!p){if(this.sessions.size>=64)throw new Error('The forest is full. Try again shortly.');p={id:randomUUID(),token:randomUUID(),...this.world.spawn,radius:7,walkDistance:0,walking:false,flip:false};this.sessions.set(p.token,p);}
  Object.assign(p,{name,kind:character,connection,input:{x:0,y:0,run:false},inputAt:this.now(),disconnectedAt:null});
  return p;
 }
 leave(p){if(!p)return;this.hugs.cancel(p.id);p.connection=null;p.chat=null;p.walking=false;p.input={x:0,y:0,run:false};p.disconnectedAt=this.now();}
 logout(p){if(p){this.hugs.cancel(p.id);this.sessions.delete(p.token);}}
 hostId(){return [...this.sessions.values()].find(p=>p.connection)?.id||null;}
 input(p,message){if(p?.hugId)return;if(!p||!Number.isFinite(message.x)||!Number.isFinite(message.y)||Math.abs(message.x)>1||Math.abs(message.y)>1)return;
  p.input={x:message.x,y:message.y,run:message.run===true};p.inputAt=this.now();
 }
 chat(p,text){
  if(!p?.connection||this.sessions.get(p.token)!==p)throw new Error('Join the forest before sending a message.');
  const message=cleanChat(text),now=this.now();
  if(now-(p.lastChatAt??-Infinity)<CHAT_COOLDOWN)throw new Error('Wait a moment before sending another message.');
  p.lastChatAt=now;p.chat={id:randomUUID(),text:message,expiresAt:now+CHAT_DURATION};return p.chat;
 }
 regenerate(p,seed){if(p?.id!==this.hostId())throw new Error('Only the first connected player can change the forest.');if(typeof seed!=='string'||!seed.trim()||seed.length>48)throw new Error('Enter a forest seed from 1 to 48 characters.');this.reset(seed.trim());}
 tick(dt){this.hugs.clean();dt=Math.min(.1,Math.max(0,dt));
  for(const p of this.sessions.values()){
   if(!p.connection){if(this.now()-p.disconnectedAt>15000)this.sessions.delete(p.token);continue;}
   if(p.hugId){p.walking=false;continue;}
   const input=this.now()-p.inputAt>300?{x:0,y:0,run:false}:p.input,length=Math.hypot(input.x,input.y),speed=input.run?170:100,x=p.x,y=p.y;
   p.walking=length>0&&moveActor(this.world,p,input.x/Math.max(1,length)*speed*dt,input.y/Math.max(1,length)*speed*dt);if(input.x)p.flip=input.x<0;
   advanceWalk(p,Math.hypot(p.x-x,p.y-y));
  }
  for(const a of this.creatures){const x=a.x,y=a.y;updateCreature(this.world,a,dt);advanceWalk(a,Math.hypot(a.x-x,a.y-y));}
 }
 snapshot(forId){const visible=a=>({id:a.id,name:a.name,kind:a.kind,x:a.x,y:a.y,walking:a.walking,walkDistance:a.walkDistance||0,flip:a.flip,phase:a.phase||0,hugging:!!a.hugId,chat:a.chat&&a.chat.expiresAt>this.now()?{id:a.chat.id,text:a.chat.text,remainingMs:a.chat.expiresAt-this.now()}:null});
  return {type:'state',...this.hugs.snapshot(forId),seed:this.world.seed,revision:this.sequence,hostId:this.hostId(),players:[...this.sessions.values()].filter(p=>p.connection).map(visible),creatures:this.creatures.map((a,i)=>({...visible(a),id:`creature-${i}`}))};
 }
}
