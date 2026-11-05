export const TILE=32, SIZE=144;
export function randomFromSeed(seed){let value=2166136261;for(const c of String(seed)){value^=c.charCodeAt(0);value=Math.imul(value,16777619);}return ()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export function makeWorld(seed='TARIN-01'){
 const random=randomFromSeed(seed),tiles=new Uint8Array(SIZE*SIZE),blocked=new Uint8Array(SIZE*SIZE),trees=[],decor=[],structures=[];
 const settlements=[{x:72,y:72,name:'Fernwood'},{x:27,y:31,name:'Moss Hollow'},{x:114,y:30,name:'Pinewatch'},{x:32,y:112,name:'Clover Rest'},{x:113,y:111,name:'Willow End'}];
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=y*SIZE+x;tiles[i]=random()<.22?1:0;if(x<2||y<2||x>=SIZE-2||y>=SIZE-2)blocked[i]=1;}
 function road(x,y){for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const xx=x+ox,yy=y+oy;if(xx>1&&xx<SIZE-2&&yy>1&&yy<SIZE-2)tiles[yy*SIZE+xx]=2;}}
 // A connected trail network: every village links to the central village.
 for(const v of settlements){let x=v.x,y=v.y;while(x!==72||y!==72){road(x,y);if(x!==72&&(y===72||random()<.52))x+=Math.sign(72-x);else y+=Math.sign(72-y);}road(x,y);}
 for(const v of settlements){
  for(let y=v.y-7;y<=v.y+7;y++)for(let x=v.x-8;x<=v.x+8;x++)if(Math.hypot(x-v.x,y-v.y)<7)tiles[y*SIZE+x]=2;
  for(const [dx,dy] of [[-5,-3],[4,-4],[4,4]]){
   const x=v.x+dx,y=v.y+dy;structures.push({kind:'house',x:x*TILE,y:y*TILE,village:v.name});
   for(let yy=y-1;yy<=y;yy++)for(let xx=x-1;xx<=x+1;xx++)blocked[yy*SIZE+xx]=1;
   // Each front door meets the village square.
   let xx=x,yy=y+1;while(yy!==v.y){road(xx,yy);yy+=Math.sign(v.y-yy);}while(xx!==v.x){road(xx,yy);xx+=Math.sign(v.x-xx);}
  }
  structures.push({kind:'well',x:(v.x-2)*TILE,y:(v.y+2)*TILE});blocked[(v.y+2)*SIZE+v.x-2]=1;
  structures.push({kind:'sign',x:(v.x+1)*TILE,y:(v.y+1)*TILE,name:v.name});
  for(let j=-3;j<=3;j++){structures.push({kind:'fence',x:(v.x+j)*TILE,y:(v.y-7)*TILE});blocked[(v.y-7)*SIZE+v.x+j]=1;}
 }
 for(let y=2;y<SIZE-2;y++)for(let x=2;x<SIZE-2;x++){
  const i=y*SIZE+x,clearing=settlements.some(v=>Math.hypot(x-v.x,y-v.y)<10);
  if(blocked[i]||tiles[i]===2)continue;
  const density=.20+.12*Math.sin(x*.14)*Math.cos(y*.17);
  if(!clearing&&random()<density){trees.push({x:x*TILE+16,y:y*TILE+25,variant:Math.floor(random()*3),size:.85+random()*.35});blocked[i]=1;}
  else if(random()<.025)decor.push({x:x*TILE+16,y:y*TILE+24,kind:['flower','plant','mushroom','strawberry'][Math.floor(random()*4)],scale:.5+random()*.25});
 }
 // Walkable world perimeter and all obstacle checks use the same tile grid.
 return {seed,tiles,blocked,trees,decor,structures,settlements,spawn:{x:72*TILE+16,y:73*TILE+16}};
}
export function canStand(world,x,y,radius=8){
 if(x<radius||y<radius||x>=SIZE*TILE-radius||y>=SIZE*TILE-radius)return false;
 for(const dx of [-radius,radius])for(const dy of [-radius,radius])if(world.blocked[Math.floor((y+dy)/TILE)*SIZE+Math.floor((x+dx)/TILE)])return false;
 return true;
}
export function moveActor(world,actor,dx,dy){
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/6));let moved=false;
 for(let i=0;i<steps;i++){
  if(canStand(world,actor.x+dx/steps,actor.y,actor.radius||7)){actor.x+=dx/steps;moved ||=dx!==0;}
  if(canStand(world,actor.x,actor.y+dy/steps,actor.radius||7)){actor.y+=dy/steps;moved ||=dy!==0;}
 }
 return moved;
}
export function makeCreatures(world,types){
 const random=randomFromSeed(world.seed+'-creatures'),creatures=[];
 for(const type of types){
  // Human characters belong to real players, never to the wandering AI pool.
  if(type.id==='amy'||!['Creatures','Monsters'].includes(type.category))continue;
  const count=type.category==='Monsters'?1:2;
  for(let j=0;j<count;j++){
  let x,y,found=false;
  for(let attempt=0;attempt<1000;attempt++){
   x=(4+random()*(SIZE-8))*TILE;y=(4+random()*(SIZE-8))*TILE;
   if(canStand(world,x,y)&&Math.hypot(x-world.spawn.x,y-world.spawn.y)>=10*TILE&&creatures.every(a=>Math.hypot(a.x-x,a.y-y)>=6*TILE)){found=true;break;}
  }
  if(!found)continue;
  creatures.push({kind:type.id,name:type.name,x,y,homeX:x,homeY:y,angle:random()*Math.PI*2,timer:random()*3,state:'idle',speed:16+random()*16,phase:random()*6,radius:5,flip:false});
 }}return creatures;
}
export function updateCreature(world,actor,dt,random=Math.random){
 actor.timer-=dt;actor.walking=false;
 if(actor.timer<=0){actor.state=actor.state==='idle'?'wander':'idle';actor.timer=actor.state==='idle'?1+random()*3:1+random()*4;const far=Math.hypot(actor.x-actor.homeX,actor.y-actor.homeY)>240;actor.angle=far?Math.atan2(actor.homeY-actor.y,actor.homeX-actor.x):random()*Math.PI*2;}
 if(actor.state==='wander'){
  const dx=Math.cos(actor.angle)*actor.speed*dt,dy=Math.sin(actor.angle)*actor.speed*dt;
  actor.walking=moveActor(world,actor,dx,dy);actor.flip=dx<0;
  if(!actor.walking){actor.angle+=Math.PI*.65;actor.timer=Math.min(actor.timer,.6);}
 }
}
