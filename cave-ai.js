import {TILE,SIZE,SPRINT_SPEED,canStand,moveActor,updateCreature,randomFromSeed} from './world.js';
export const CAVE_NOTICE_RADIUS=15*TILE,CAVE_FOLLOW_RADIUS=20*TILE,CAVE_CHASE_SPEED=SPRINT_SPEED/3;
export const CAVE_MONSTER_LIMIT=2;
export function outsidePlayerViews(x,y,players){
 return players.every(p=>{const v=p.view;if(!v)return false;const margin=2*TILE;return x<v.x-margin||y<v.y-margin||x>v.x+v.width+margin||y>v.y+v.height+margin;});
}
export function makeCaveMonsters(world,types,players){
 const type=types.find(t=>t.id==='spider'&&t.category==='Monsters')||types.find(t=>t.category==='Monsters');
 if(!type||!players.length||players.some(p=>!p.view))return [];
 const random=randomFromSeed(world.seed+'-cave-monsters'),actors=[];
 const rooms=world.rooms.filter(r=>r.rx>=2&&r.ry>=2).map(r=>({...r,order:random()})).sort((a,b)=>a.order-b.order);
 for(const room of rooms){
  if(actors.length>=CAVE_MONSTER_LIMIT)break;
  const x=room.x*TILE+16,y=room.y*TILE+16;
  // Spawn only in the larger natural chambers, with open floor on all sides.
  if(Math.hypot(x-world.spawn.x,y-world.spawn.y)<10*TILE||!outsidePlayerViews(x,y,players)||actors.some(a=>Math.hypot(a.x-x,a.y-y)<20*TILE))continue;
  if(![-1,0,1].every(dy=>[-1,0,1].every(dx=>canStand(world,x+dx*TILE,y+dy*TILE,5))))continue;
  actors.push({id:`cave-creature-${actors.length}`,stage:'mine',kind:type.id,name:type.name,x,y,homeX:x,homeY:y,angle:random()*Math.PI*2,timer:1+random()*3,state:'idle',speed:16+random()*16,phase:random()*6,radius:5,flip:false,walking:false,targetId:null});
 }
 return actors;
}
export function cavePath(world,actor,target){
 const start=Math.floor(actor.y/TILE)*SIZE+Math.floor(actor.x/TILE),end=Math.floor(target.y/TILE)*SIZE+Math.floor(target.x/TILE);
 const previous=new Int32Array(SIZE*SIZE).fill(-1),queue=[start];previous[start]=start;
 for(let i=0;i<queue.length&&previous[end]===-1;i++){
  const index=queue[i],x=index%SIZE,y=Math.floor(index/SIZE);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy,next=yy*SIZE+xx;
   if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||previous[next]!==-1||world.blocked[next]||!canStand(world,xx*TILE+16,yy*TILE+16,5)||!canStand(world,(x+xx)*TILE/2+16,(y+yy)*TILE/2+16,5))continue;
   previous[next]=index;queue.push(next);
  }
 }
 if(previous[end]===-1)return [];
 const path=[];for(let index=end;;index=previous[index]){path.push({x:index%SIZE*TILE+16,y:Math.floor(index/SIZE)*TILE+16});if(index===start)break;}
 path.reverse();
 // Keep centering at tight corners, but avoid stepping backward on a straight repath.
 if(path.length>1){const point=path[1],steps=Math.ceil(Math.hypot(point.x-actor.x,point.y-actor.y)/4);let clear=true;
  for(let i=0;i<=steps;i++){const t=steps?i/steps:0;if(!canStand(world,actor.x+(point.x-actor.x)*t,actor.y+(point.y-actor.y)*t,5)){clear=false;break;}}
  if(clear)path.shift();
 }
 path.push({x:target.x,y:target.y});return path;
}
export function updateCaveMonster(world,actor,players,dt,random=Math.random){
 let target=players.find(p=>p.id===actor.targetId&&Math.hypot(p.x-actor.x,p.y-actor.y)<=CAVE_FOLLOW_RADIUS);
 if(!target)target=players.filter(p=>Math.hypot(p.x-actor.x,p.y-actor.y)<=CAVE_NOTICE_RADIUS).sort((a,b)=>Math.hypot(a.x-actor.x,a.y-actor.y)-Math.hypot(b.x-actor.x,b.y-actor.y))[0];
 if(!target){
  if(actor.targetId){actor.targetId=null;actor.state='idle';actor.timer=1+random()*2;actor.path=[];}
  updateCreature(world,actor,dt,random);return;
 }
 const switched=actor.targetId!==target.id;actor.targetId=target.id;actor.state='follow';actor.walking=false;
 const targetTile=Math.floor(target.y/TILE)*SIZE+Math.floor(target.x/TILE),terrain=world.brokenBlocks?.size||0;
 actor.pathTimer=(actor.pathTimer||0)-dt;
 if(switched||actor.pathTimer<=0||actor.pathTile!==targetTile||actor.pathTerrain!==terrain){actor.path=cavePath(world,actor,target);actor.pathTimer=.6;actor.pathTile=targetTile;actor.pathTerrain=terrain;}
 if(Math.hypot(target.x-actor.x,target.y-actor.y)<=(actor.radius||5)+(target.radius||7))return;
 if(actor.path?.length)actor.path[actor.path.length-1]={x:target.x,y:target.y};
 let remaining=CAVE_CHASE_SPEED*dt;
 while(remaining>0&&actor.path?.length){
  const point=actor.path[0],dx=point.x-actor.x,dy=point.y-actor.y,distance=Math.hypot(dx,dy);
  if(distance<.01){actor.path.shift();continue;}
  const step=Math.min(distance,remaining),x=actor.x,y=actor.y;
  const moved=moveActor(world,actor,dx/distance*step,dy/distance*step);if(dx)actor.flip=dx<0;actor.walking ||=moved;
  remaining-=step;if(!moved||Math.hypot(actor.x-x,actor.y-y)<step*.8){actor.pathTimer=0;break;}
  if(step===distance)actor.path.shift();
 }
}
