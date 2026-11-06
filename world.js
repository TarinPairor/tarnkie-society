export const TILE=32, SIZE=144;
export const MINE_ENTRANCE=Object.freeze({x:86,y:60});
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
 const entrance=MINE_ENTRANCE;
 // A short northeast branch from Fernwood reaches the relocated mine.
 for(let x=72;x<=entrance.x;x++)road(x,72);
 for(let y=entrance.y;y<=72;y++)road(entrance.x,y);
 for(let y=entrance.y-2;y<=entrance.y;y++)for(const x of [entrance.x-1,entrance.x+1])blocked[y*SIZE+x]=1;
 structures.push({kind:'mine-entrance',x:entrance.x*TILE+16,y:entrance.y*TILE+16});
 for(let y=2;y<SIZE-2;y++)for(let x=2;x<SIZE-2;x++){
  const i=y*SIZE+x,clearing=Math.hypot(x-entrance.x,y-entrance.y)<6||settlements.some(v=>Math.hypot(x-v.x,y-v.y)<10);
  if(blocked[i]||tiles[i]===2)continue;
  const density=.17+.10*Math.sin(x*.14)*Math.cos(y*.17);
  if(!clearing&&random()<density){trees.push({x:x*TILE+16,y:y*TILE+25,variant:Math.floor(random()*3),size:.85+random()*.35});blocked[i]=2;}
  else if(random()<.025)decor.push({x:x*TILE+16,y:y*TILE+24,kind:['flower','plant','mushroom','strawberry'][Math.floor(random()*4)],scale:.5+random()*.25});
 }
 // Walkable world perimeter and all obstacle checks use the same tile grid.
 return {seed,stage:'forest',portals:[{x:entrance.x*TILE+16,y:entrance.y*TILE+16,target:'mine',halfWidth:29,front:32,back:24}],tiles,blocked,trees,decor,structures,settlements,spawn:{x:72*TILE+16,y:73*TILE+16}};
}
export function canStand(world,x,y,radius=8){
 if(x<radius||y<radius||x>=SIZE*TILE-radius||y>=SIZE*TILE-radius)return false;
 const minX=Math.floor((x-radius)/TILE),maxX=Math.floor((x+radius)/TILE),minY=Math.floor((y-radius)/TILE),maxY=Math.floor((y+radius)/TILE);
 for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++){
  const obstacle=world.blocked[ty*SIZE+tx];if(!obstacle)continue;
  if(obstacle===1)return false;
  // Trees block only their 10×8 trunk footprint, not the entire 32×32 tile.
  const trunkX=tx*TILE+16,trunkY=ty*TILE+26;
  if(x+radius>trunkX-5&&x-radius<trunkX+5&&y+radius>trunkY-4&&y-radius<trunkY+4)return false;
 }
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

// Rooms and their linking tunnels are carved together, guaranteeing connectivity.
export function makeCave(seed='TARIN-01'){
 const random=randomFromSeed(seed+'-mine'),tiles=new Uint8Array(SIZE*SIZE).fill(5),blocked=new Uint8Array(SIZE*SIZE).fill(1),structures=[];
 const carve=(x,y)=>{if(x>2&&y>2&&x<SIZE-3&&y<SIZE-3){tiles[y*SIZE+x]=4;blocked[y*SIZE+x]=0;}};
 const brush=(x,y,r=2)=>{const shift=Number.isInteger(r)?0:.5;for(let dy=Math.ceil(-r);dy<=Math.ceil(r);dy++)for(let dx=Math.ceil(-r);dx<=Math.ceil(r);dx++)if((dx-shift)**2+(dy-shift)**2<=r*r+.5)carve(x+dx,y+dy);};
 // Curving passages connect roomy hubs, with extra links for branching loops.
 // Tunnels vary from one to five tiles wide; small chambers are three to five across.
 const rooms=[],byCell=new Map();
 for(let row=0;row<6;row++)for(let col=0;col<6;col++){
  if(row===5&&col===5)continue;
  const hub=[[1,1],[4,1],[2,3],[4,4]].some(([x,y])=>x===col&&y===row),large=hub||random()<.22;
  const room={x:15+col*22+Math.floor(random()*5)-2,y:19+row*22+Math.floor(random()*5)-2,rx:large?2:1+Math.floor(random()*2),ry:large?2:1+Math.floor(random()*2),col,row,hub};
  if(row===0&&col===0){room.x=15;room.y=19;room.rx=2;room.ry=2;}
  rooms.push(room);byCell.set(`${col},${row}`,room);
  for(let dy=-room.ry;dy<=room.ry;dy++)for(let dx=-room.rx;dx<=room.rx;dx++)if((dx/room.rx)**2+(dy/room.ry)**2<=1)carve(room.x+dx,room.y+dy);
  brush(room.x,room.y,1);
 }
 const stack=[rooms[0]],connected=new Set([rooms[0]]),passages=[],edges=new Set();
 const neighborsOf=room=>[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>byCell.get(`${room.col+dx},${room.row+dy}`)).filter(Boolean);
 const edgeKey=(a,b)=>[a.row*6+a.col,b.row*6+b.col].sort((x,y)=>x-y).join(':');
 function connect(from,to){
  const key=edgeKey(from,to);if(edges.has(key))return;edges.add(key);
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
  const bend=(random()<.5?-1:1)*(3+random()*2),wiggle=(random()-.5)*3,path=[];
  const width=1+Math.floor(random()**1.7*5),steps=Math.ceil(length*3);
  for(let i=0;i<=steps;i++){
   const t=i/steps,offset=Math.sin(Math.PI*t)*bend+Math.sin(Math.PI*2*t)*wiggle;
   const x=Math.round(from.x+dx*t+nx*offset),y=Math.round(from.y+dy*t+ny*offset);
   const previous=path.at(-1);
   // A one-tile passage must never connect only at a diagonal corner.
   if(previous&&previous.x!==x&&previous.y!==y){const bridge=Math.abs(dx)>=Math.abs(dy)?{x,y:previous.y}:{x:previous.x,y};path.push(bridge);brush(bridge.x,bridge.y,(width-1)/2);}
   if(!path.length||path.at(-1).x!==x||path.at(-1).y!==y)path.push({x,y});brush(x,y,(width-1)/2);
  }
  passages.push({from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},width,path});
 }
 // First build a connected backbone, then open additional branches and loops.
 while(stack.length){
  const from=stack.at(-1),neighbors=neighborsOf(from).filter(room=>!connected.has(room));
  if(!neighbors.length){stack.pop();continue;}
  const to=neighbors[Math.floor(random()*neighbors.length)];connected.add(to);stack.push(to);connect(from,to);
 }
 // Large chambers are true junctions rather than isolated pockets off a corridor.
 for(const room of rooms.filter(room=>room.hub))for(const neighbor of neighborsOf(room))connect(room,neighbor);
 const extra=[];for(const room of rooms)for(const other of neighborsOf(room))if(room.row*6+room.col<other.row*6+other.col&&!edges.has(edgeKey(room,other)))extra.push([room,other]);
 for(let i=extra.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[extra[i],extra[j]]=[extra[j],extra[i]];}
 for(const [a,b] of extra.slice(0,6))connect(a,b);
 for(let i=0;i<rooms.length;i++)if(i%4===0)structures.push({kind:'mine-support',x:rooms[i].x*TILE+16,y:rooms[i].y*TILE+16});
 for(let y=14;y<=21;y++)brush(15,y,1);
 // Validate connectivity using player-sized clearance at tile centers and crossings.
 const visited=new Uint8Array(SIZE*SIZE),queue=[19*SIZE+15];visited[queue[0]]=1;
 for(let i=0;i<queue.length;i++){const index=queue[i],x=index%SIZE,y=Math.floor(index/SIZE);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,next=yy*SIZE+xx;if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||blocked[next]||visited[next]||!canStand({blocked},xx*TILE+16,yy*TILE+16,7)||!canStand({blocked},(x+xx)*TILE/2+16,(y+yy)*TILE/2+16,7))continue;visited[next]=1;queue.push(next);}}
 for(let i=0;i<tiles.length;i++)if(!blocked[i]&&!visited[i]){blocked[i]=1;tiles[i]=5;}
 structures.push({kind:'mine-exit',x:15*TILE+16,y:15*TILE+16});
 for(let i=0;i<1000;i++){const x=4+Math.floor(random()*(SIZE-8)),y=4+Math.floor(random()*(SIZE-8));if(blocked[y*SIZE+x]&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!blocked[(y+dy)*SIZE+x+dx]))structures.push({kind:'ore',x:x*TILE+16,y:y*TILE+20,variant:Math.floor(random()*3)});}
 return {seed,stage:'mine',tiles,blocked,trees:[],decor:[],structures,settlements:[],rooms,passages,portals:[{x:15*TILE+16,y:15*TILE+16,target:'forest',halfWidth:22,front:28,back:24}],spawn:{x:15*TILE+16,y:19*TILE+16}};
}

export function insidePortal(portal,actor){
 return Math.abs(actor.x-portal.x)<=portal.halfWidth&&actor.y>=portal.y-portal.back&&actor.y<=portal.y+portal.front;
}
