import {randomUUID} from 'node:crypto';
import {canStand} from './world.js';
import {HUG_RANGE,HUG_DURATION,HUG_REQUEST_TTL} from './hug-config.js';
export function closeEnough(world,a,b){
 if(!a||!b||a.dead||b.dead||(a.stage||'forest')!==(b.stage||'forest')||(a.stage==='mine'&&a.mineVersion!==b.mineVersion)||Math.hypot(a.x-b.x,a.y-b.y)>HUG_RANGE)return false;
 const steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/8));
 for(let i=0;i<=steps;i++)if(!canStand(world,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,2))return false;
 return true;
}
export class Hugs {
 constructor(room){this.room=room;this.requests=new Map();this.active=new Map();}
 player(id){return [...this.room.sessions.values()].find(p=>p.id===id&&p.connection);}
 notice(id,text){const p=this.player(id);if(p)p.hugNotice={id:randomUUID(),text};}
 busy(id){return [...this.requests.values()].some(r=>r.from===id||r.to===id)||[...this.active.values()].some(h=>h.players.includes(id));}
 request(from,targetId){
  this.clean();const to=this.player(targetId),now=this.room.now();
  if(!from?.connection||from===to||!closeEnough(this.room.worldFor(from),from,to))throw new Error('Move closer to another player to offer a hug.');
  if(this.busy(from.id)||this.busy(to.id))throw new Error('A hug or request is already in progress.');
  if(now-(from.lastHugRequest??-Infinity)<3000)throw new Error('Wait a moment before offering another hug.');
  const r={id:randomUUID(),from:from.id,to:to.id,fromName:from.name,toName:to.name,expiresAt:now+HUG_REQUEST_TTL};
  from.lastHugRequest=now;this.requests.set(r.id,r);return r;
 }
 respond(player,id,accept){
  const r=this.requests.get(id);if(!r||r.to!==player?.id)throw new Error('This hug request is no longer available.');
  if(typeof accept!=='boolean')throw new Error('Choose Accept or Deny.');
  this.requests.delete(id);const a=this.player(r.from),b=this.player(r.to),now=this.room.now();
  if(r.expiresAt<=now||!a||!b||!closeEnough(this.room.worldFor(a),a,b))throw new Error('The hug expired or the other player moved away.');
  if(!accept){this.notice(a.id,`${b.name} declined the hug.`);return;}
  // Use the same composition regardless of who initiated the request.
  const left=a.kind==='tarin'&&b.kind==='amy'?b:a,right=left===a?b:a;
  const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};let placement=null;
  for(const center of [middle,{x:a.x,y:a.y},{x:b.x,y:b.y}]){
   for(const [dx,dy] of [[0,0],[-8,0],[8,0],[0,-8],[0,8],[-8,-8],[8,-8],[-8,8],[8,8]]){
    const first={x:center.x+dx-3,y:center.y+dy},second={x:center.x+dx+3,y:center.y+dy};
    if(canStand(this.room.worldFor(a),first.x,first.y,7)&&canStand(this.room.worldFor(a),second.x,second.y,7)){placement={first,second};break;}
   }
   if(placement)break;
  }
  if(!placement)throw new Error('Move to a little more open space to hug.');
  Object.assign(left,placement.first);Object.assign(right,placement.second);
  const hug={id:randomUUID(),players:[a.id,b.id],startedAt:now,endsAt:now+HUG_DURATION};this.active.set(hug.id,hug);
  for(const p of [a,b]){p.hugId=hug.id;p.walking=false;p.walkDistance=0;p.input={x:0,y:0,run:false};}
  left.flip=false;right.flip=true;
  return hug;
 }
 finish(hug){for(const id of hug.players){const p=this.player(id);if(p){p.hugId=null;p.input={x:0,y:0,run:false};}}this.active.delete(hug.id);}
 clean(){const now=this.room.now();
  for(const r of this.requests.values())if(r.expiresAt<=now||!this.player(r.from)||!this.player(r.to)||!closeEnough(this.room.worldFor(this.player(r.from)),this.player(r.from),this.player(r.to))){this.requests.delete(r.id);this.notice(r.from,'Hug request ended. Move closer and try again.');}
  for(const h of this.active.values())if(h.endsAt<=now||h.players.some(id=>!this.player(id)))this.finish(h);
 }
 cancel(id){for(const r of this.requests.values())if(r.from===id||r.to===id){this.requests.delete(r.id);this.notice(r.from,'Hug request ended.');}for(const h of this.active.values())if(h.players.includes(id))this.finish(h);}
 reset(){for(const h of this.active.values())this.finish(h);this.requests.clear();}
 snapshot(id){return {hugRequests:[...this.requests.values()].filter(r=>!id||r.from===id||r.to===id),hugs:[...this.active.values()].map(h=>({...h,remainingMs:Math.max(0,h.endsAt-this.room.now())})),hugNotice:this.player(id)?.hugNotice||null};}
}
