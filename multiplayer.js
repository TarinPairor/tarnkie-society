import {cleanChat,CHAT_DURATION,CHAT_COOLDOWN,CHAT_HISTORY_LIMIT} from './chat.js';
import {Hugs} from './hugs.js';
import {randomUUID} from 'node:crypto';
import {TILE,makeWorld,makeCave,makeCreatures,insidePortal,moveActor,updateCreature} from './world.js';
import {advanceWalk} from './animation.js';

export class ForestRoom {
 constructor(types,{seed='TARIN-01',now=()=>Date.now()}={}){
  this.types=types;this.now=now;this.sessions=new Map();this.sequence=0;this.chatHistory=[];this.hugs=new Hugs(this);this.reset(seed);
 }
 reset(seed){this.hugs.reset();this.world=makeWorld(seed);this.mineVersion=0;this.mineWorlds=new Map([[0,makeCave(seed)]]);this.worlds={forest:this.world,mine:this.mineWorlds.get(0)};this.creatures=makeCreatures(this.world,this.types);this.sequence++;
  for(const p of this.sessions.values()){Object.assign(p,this.world.spawn,{stage:'forest',mineVersion:null,walking:false,walkDistance:0,input:{x:0,y:0,run:false},chat:null});}
 }
 join({name,character,token},connection){
  if(typeof name!=='string'||!name.trim()||name.trim().length>24||/[\u0000-\u001f\u007f]/.test(name))throw new Error('Enter a name from 1 to 24 characters.');
  if(!['tarin','amy'].includes(character))throw new Error('Choose Tarin or Amy.');
  name=name.trim();let p=this.sessions.get(token);
  if(p?.connection)throw new Error('This session is already connected.');
  if([...this.sessions.values()].some(other=>other!==p&&other.name.toLowerCase()===name.toLowerCase()))throw new Error('That name is already in the forest. Choose another.');
  if([...this.sessions.values()].some(other=>other!==p&&other.connection&&other.kind===character)){const label=character==='amy'?'Amy':'Tarin';throw new Error(`${label} is already being played. Choose the other character or wait until ${label} leaves.`);}
  if(!p){if(this.sessions.size>=64)throw new Error('The forest is full. Try again shortly.');p={id:randomUUID(),token:randomUUID(),...this.world.spawn,stage:'forest',radius:7,walkDistance:0,walking:false,flip:false};this.sessions.set(p.token,p);}
  Object.assign(p,{name,kind:character,connection,input:{x:0,y:0,run:false},inputAt:this.now(),disconnectedAt:null});
  return p;
 }
 leave(p){if(!p)return;this.hugs.cancel(p.id);p.connection=null;p.chat=null;p.walking=false;p.input={x:0,y:0,run:false};p.disconnectedAt=this.now();}
 logout(p){if(p){this.hugs.cancel(p.id);this.sessions.delete(p.token);}}
 removePlayer(actor,targetId){
  if(!actor?.connection||this.sessions.get(actor.token)!==actor)throw new Error('Join the forest before removing players.');
  if(actor.id===targetId)throw new Error('Use Leave to disconnect yourself.');
  const target=[...this.sessions.values()].find(p=>p.id===targetId&&p.connection);
  if(!target)throw new Error('That player is no longer online.');
  this.logout(target);return target;
 }
 hostId(){return [...this.sessions.values()].find(p=>p.connection)?.id||null;}
 input(p,message){if(p?.hugId)return;if(!p||!Number.isFinite(message.x)||!Number.isFinite(message.y)||Math.abs(message.x)>1||Math.abs(message.y)>1)return;
  p.input={x:message.x,y:message.y,run:message.run===true};p.inputAt=this.now();
 }
 chat(p,text){
  if(!p?.connection||this.sessions.get(p.token)!==p)throw new Error('Join the forest before sending a message.');
  const message=cleanChat(text),now=this.now();
  if(now-(p.lastChatAt??-Infinity)<CHAT_COOLDOWN)throw new Error('Wait a moment before sending another message.');
  p.lastChatAt=now;p.chat={id:randomUUID(),text:message,expiresAt:now+CHAT_DURATION};
  this.chatHistory.push({id:p.chat.id,playerId:p.id,name:p.name,kind:p.kind,text:message,sentAt:now});if(this.chatHistory.length>CHAT_HISTORY_LIMIT)this.chatHistory.shift();
  return p.chat;
 }
 regenerate(){throw new Error('Forest regeneration is temporarily disabled.');}
 worldFor(player){return player?.stage==='mine'?this.mineWorlds.get(player.mineVersion??this.mineVersion):this.world;}
 refreshMine(){
  this.mineVersion++;const cave=makeCave(`${this.world.seed}:mine-visit:${this.mineVersion}`);
  this.mineWorlds.set(this.mineVersion,cave);this.worlds.mine=cave;this.pruneMines();
 }
 pruneMines(){for(const version of this.mineWorlds.keys())if(version!==this.mineVersion&&![...this.sessions.values()].some(p=>p.stage==='mine'&&p.mineVersion===version))this.mineWorlds.delete(version);}

 usePortal(p){
  if(!p?.connection||this.sessions.get(p.token)!==p)throw new Error('Join the forest first.');
  if(p.hugId)throw new Error('Finish your hug before entering.');
  if(this.now()<(p.portalCooldown||0))throw new Error('Wait a moment before using the entrance again.');
  const portal=this.worldFor(p).portals.find(portal=>Math.hypot(p.x-portal.x,p.y-portal.y)<=96);
  if(!portal)throw new Error('Move closer to the mine entrance or exit.');
  this.changeStage(p,portal.target);
 }
 changeStage(p,target){
  const destination=this.worlds[target];if(!destination||!p?.connection||p.hugId||p.stage===target)return;
  const leavingMine=p.stage==='mine'&&target==='forest';
  this.hugs.cancel(p.id);p.stage=target;p.mineVersion=target==='mine'?this.mineVersion:null;
  const spawn=target==='forest'?{x:this.world.portals[0].x,y:this.world.portals[0].y+3*TILE}:destination.spawn;
  Object.assign(p,spawn,{walking:false,walkDistance:0,chat:null,input:{x:0,y:0,run:false},portalCooldown:this.now()+1200});
  if(leavingMine)this.refreshMine();
 }

 tick(dt){this.hugs.clean();dt=Math.min(.1,Math.max(0,dt));
  for(const p of this.sessions.values()){
   if(!p.connection){if(this.now()-p.disconnectedAt>15000)this.sessions.delete(p.token);continue;}
   if(p.hugId){p.walking=false;continue;}
   const input=this.now()-p.inputAt>300?{x:0,y:0,run:false}:p.input,length=Math.hypot(input.x,input.y),speed=input.run?170:100,x=p.x,y=p.y;
   p.walking=length>0&&moveActor(this.worldFor(p),p,input.x/Math.max(1,length)*speed*dt,input.y/Math.max(1,length)*speed*dt);if(input.x)p.flip=input.x<0;
   advanceWalk(p,Math.hypot(p.x-x,p.y-y));
   if(this.now()>=(p.portalCooldown||0)){const portal=this.worldFor(p).portals.find(portal=>insidePortal(portal,p));if(portal)this.changeStage(p,portal.target);}
  }
  this.pruneMines();
  for(const a of this.creatures){const x=a.x,y=a.y;updateCreature(this.world,a,dt);advanceWalk(a,Math.hypot(a.x-x,a.y-y));}
 }
 snapshot(forId){const viewer=[...this.sessions.values()].find(p=>p.id===forId),stage=viewer?.stage||'forest';const visible=a=>({id:a.id,name:a.name,kind:a.kind,stage:a.stage||'forest',x:a.x,y:a.y,walking:a.walking,walkDistance:a.walkDistance||0,flip:a.flip,phase:a.phase||0,hugging:!!a.hugId,chat:a.chat&&a.chat.expiresAt>this.now()?{id:a.chat.id,text:a.chat.text,remainingMs:a.chat.expiresAt-this.now()}:null});
  return {type:'state',stage,onlinePlayers:[...this.sessions.values()].filter(p=>p.connection).map(p=>({id:p.id,name:p.name,kind:p.kind,stage:p.stage||'forest'})),onlineCount:[...this.sessions.values()].filter(p=>p.connection).length,...this.hugs.snapshot(forId),seed:this.world.seed,worldSeed:this.worldFor(viewer).seed,revision:this.sequence,hostId:this.hostId(),players:[...this.sessions.values()].filter(p=>p.connection&&(p.stage||'forest')===stage&&(stage!=='mine'||p.mineVersion===viewer?.mineVersion)).map(visible),creatures:(stage==='forest'?this.creatures:[]).map((a,i)=>({...visible(a),id:`creature-${i}`}))};
 }
}
