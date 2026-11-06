import {randomUUID} from 'node:crypto';
import {emptyInventory,ORES} from './items.js';
import {canStand} from './world.js';
export class Survival {
 constructor(room){this.room=room;this.deaths=new Map();this.monsterKinds=new Set(room.types.filter(t=>t.category==='Monsters').map(t=>t.id));}
 active(p){return p?.connection&&this.room.sessions.get(p.token)===p;}
 save(p,items){try{this.room.inventoryStore.save(p.kind,items);return true;}catch(error){this.room.onInventoryError(p,error);return false;}}
 restore(p){const death=this.deaths.get(p.kind);p.dead=!!death;if(death)Object.assign(p,death);}
 kill(p){
  if(!this.active(p)||p.dead)return false;
  const world=this.room.worldFor(p),items={...p.inventory};
  if(!this.save(p,emptyInventory()))return false;
  if(Object.values(items).some(count=>count>0))(world.drops??=[]).push({id:randomUUID(),owner:p.kind,x:p.x,y:p.y,items});
  Object.assign(p.inventory,emptyInventory());this.deaths.set(p.kind,{stage:p.stage,mineVersion:p.mineVersion,x:p.x,y:p.y});
  this.room.hugs.cancel(p.id);Object.assign(p,{dead:true,walking:false,mining:null,breakEffect:null,chat:null,input:{x:0,y:0,run:false}});return true;
 }
 contact(p){
  if(!this.active(p)||p.dead||this.room.now()<(p.invulnerableUntil||0))return;
  const world=this.room.worldFor(p),monsters=p.stage==='mine'?(world.creatures||[]):this.room.creatures;
  if(monsters.some(a=>this.monsterKinds.has(a.kind)&&Math.hypot(a.x-p.x,a.y-p.y)<=(a.radius||5)+(p.radius||7)))this.kill(p);
 }
 respawn(p){
  if(!this.active(p))throw new Error('Join the game before respawning.');
  if(!p.dead)throw new Error('You are already alive.');
  const world=this.room.worldFor(p);this.deaths.delete(p.kind);
  Object.assign(p,world.spawn,{dead:false,walking:false,walkDistance:0,view:null,mining:null,breakEffect:null,chat:null,input:{x:0,y:0,run:false},portalCooldown:this.room.now()+1200,invulnerableUntil:this.room.now()+2000});
 }
 pickup(p){
  if(!this.active(p)||p.dead)return;
  const world=this.room.worldFor(p),drops=world.drops||[];
  for(let i=drops.length-1;i>=0;i--){
   const drop=drops[i],distance=Math.hypot(drop.x-p.x,drop.y-p.y);if(distance>24)continue;
   const steps=Math.max(1,Math.ceil(distance/4));let clear=true;
   for(let j=0;j<=steps;j++)if(!canStand(world,p.x+(drop.x-p.x)*j/steps,p.y+(drop.y-p.y)*j/steps,2)){clear=false;break;}
   if(!clear)continue;
   const next={...p.inventory};for(const type of Object.keys(ORES))next[type]+=drop.items[type]||0;
   if(!this.save(p,next))continue;
   Object.assign(p.inventory,next);drops.splice(i,1);
  }
 }
 pinned(version){return [...this.deaths.values()].some(d=>d.stage==='mine'&&d.mineVersion===version)||(this.room.mineWorlds.get(version)?.drops?.length||0)>0;}
 recoveryMine(p){return [...this.room.mineWorlds].find(([,world])=>world.drops?.some(d=>d.owner===p.kind))?.[0]??this.room.mineVersion;}
}
