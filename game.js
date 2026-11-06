import {ORES,emptyInventory,inventorySlots} from './items.js';
import {canMineBlock,exposedRock,miningRay,applyBrokenBlocks,MINING_REACH} from './mining.js';
import {PROTOCOL_VERSION,PROTOCOL_ERROR} from './protocol.js';
import {applyCaveTerrain} from './terrain.js';
import {MINE_INFO,mineEntranceAt} from './mine-info.js';
import {TREE_WIDTH,TREE_HEIGHT,hiddenByTrees,sharesTreeCover} from './trees.js';
import {QUICK_MESSAGES,CHAT_LIMIT,cleanChat,wrapChat,mergeChatHistory} from './chat.js';
import {HUG_RANGE,HUG_DURATION} from './hug-config.js';
import {createTouchControls,createMiningJoystick} from './touch.js';
import {ForestConnection} from './network.js';
import {walkingSprite,spriteFlip} from './animation.js';
import {TILE,SIZE,makeWorld,makeCave,makeCreatures,randomFromSeed} from './world.js';
const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d'),map=$('#map'),mapCtx=map.getContext('2d');
const keys=new Set(),sprites=new Map(),treeSprites=[],grassSprites=[];
let world,creatures=[],player,collection=[],camera={x:0,y:0},paused=false,ready=false,time=0,previous=0,viewWidth=800,viewHeight=500,mapVisible=false;
let mineInfoAnchor=null,mineInfoUntil=0,nearbyPortal=null;
let inventoryOpen=false,inventory=emptyInventory();
let miningControls=null,mouseMining=null,miningTarget=null,lastMineKey=null,lastMineSent=0;
let rosterSignature='';
let menuOpen=false,connection=null,joined=false,localId=null,revision=null,remotePlayers=[];
let hugRequests=[],hugEffects=new Map(),currentHugRequest=null,hugTarget=null,lastHugNotice=null,noticeUntil=0,lastOutgoingHug=null;
let serverChatMessages=[],chatSettings={bubbles:true,server:true};
try{const saved=JSON.parse(localStorage.getItem('forest-chat-settings'));if(typeof saved?.bubbles==='boolean')chatSettings.bubbles=saved.bubbles;if(typeof saved?.server==='boolean')chatSettings.server=saved.server;}catch{}
let chatOpen=false,pendingChat=null,lastChatIds=new Map();
let selectedCharacter='tarin',savedProfile=null,touchControls=null;
function clearInput(){keys.clear();touchControls?.reset();miningControls?.reset();stopMining();}
try{savedProfile=JSON.parse(sessionStorage.getItem('forest-profile'));}catch{}
const menu=$('#menu');
menu.addEventListener('toggle',()=>{menuOpen=menu.open;if(menuOpen){setChatOpen(false);setInventoryOpen(false);}clearInput();if(player)player.walking=false;if(!menuOpen)canvas.focus();});
function closeMenu(){menu.open=false;menuOpen=false;clearInput();canvas.focus();}
const zoom=1.6,reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function sprite(data){const c=surface(data.width,data.height),cctx=c.getContext('2d');data.pixels.forEach((color,i)=>{if(color){cctx.fillStyle=color;cctx.fillRect(i%data.width,Math.floor(i/data.width),1,1);}});return c;}
function makeTextures(){
 const random=randomFromSeed('forest-art');
 for(let v=0;v<4;v++){
  const c=surface(32,32),g=c.getContext('2d');g.fillStyle=['#65834b','#6b894f','#baa16c','#587746'][v];g.fillRect(0,0,32,32);
  for(let j=0;j<15;j++){g.fillStyle=v===2?(j%2?'#c5ad79':'#ac955f'):(j%2?'#829958':'#567343');g.fillRect(Math.floor(random()*15)*2,Math.floor(random()*15)*2,j%3===0?4:2,2);}
  grassSprites.push(c);
 }
 for(const base of ['#a9ada9','#1c2024']){
  const c=surface(32,32),g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,32,32);
  for(let i=0;i<13;i++){g.fillStyle=base==='#a9ada9'?(i%2?'#b8bbb5':'#939994'):(i%2?'#282d32':'#161a1d');g.fillRect(Math.floor(random()*15)*2,Math.floor(random()*15)*2,2+i%3,2);}
  grassSprites.push(c);
 }
 const rock=surface(32,32),rg=rock.getContext('2d');rg.fillStyle='#383e43';rg.fillRect(0,0,32,32);
 for(const [x,y,w] of [[3,5,7],[19,3,6],[11,15,9],[2,25,6],[23,23,5]]){rg.fillStyle='#495157';rg.fillRect(x,y,w,2);rg.fillStyle='#292f34';rg.fillRect(x+1,y+3,w-2,2);}
 grassSprites.push(rock);
 for(let v=0;v<3;v++){
  const c=surface(48,64),g=c.getContext('2d');const rect=(x,y,w,h,color)=>{g.fillStyle=color;g.fillRect(x,y,w,h)};
  rect(21,45,8,19,'#514b32');rect(22,45,3,18,'#7b6941');
  if(v===1){
   const layers=[[20,1,8,6],[16,7,16,8],[12,15,24,8],[8,23,32,9],[4,32,40,10],[2,42,44,8]];
   for(const [x,y,w,h] of layers){rect(x,y,w,h,'#284d37');rect(x+3,y,w-6,h-3,'#3d6641');rect(x+5,y,w/2-3,3,'#64834a');}
  }else{
   const shades=v===0?['#2e5439','#426b40','#5c8148','#769352']:['#36573a','#557444','#75914e','#8da257'];
   rect(9,43,32,8,shades[0]);rect(3,29,42,16,shades[0]);rect(7,15,36,22,shades[0]);rect(14,5,25,20,shades[0]);
   rect(5,26,36,15,shades[1]);rect(10,13,29,22,shades[1]);rect(16,4,18,14,shades[1]);
   rect(9,23,27,12,shades[2]);rect(13,12,21,16,shades[2]);rect(19,5,11,8,shades[2]);
   rect(13,18,8,5,shades[3]);rect(22,10,8,5,shades[3]);rect(8,29,7,4,shades[3]);rect(26,32,7,4,shades[0]);
  }
  treeSprites.push(c);
 }
}
const mapBackground=surface(SIZE,SIZE),mapBackgroundCtx=mapBackground.getContext('2d');
function generate(seed,stage='forest',terrain=null){
 world=stage==='mine'?makeCave(seed):makeWorld(seed);if(terrain)applyCaveTerrain(world,terrain);const types=collection.filter(o=>['Creatures','Monsters'].includes(o.category));creatures=stage==='forest'?makeCreatures(world,types):[];
 player={...world.spawn,radius:7,flip:false,walking:false};camera={x:player.x,y:player.y};
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const i=y*SIZE+x;mapBackgroundCtx.fillStyle=world.stage==='mine'?(world.blocked[i]?'#202428':'#a9ada9'):world.tiles[i]===2?'#c4ad78':world.blocked[i]?'#34573b':'#6d8950';mapBackgroundCtx.fillRect(x,y,1,1);
 }
 for(const v of world.settlements){mapBackgroundCtx.fillStyle='#ebce91';mapBackgroundCtx.fillRect(v.x-1,v.y-1,3,3);}
 for(const portal of world.portals){mapBackgroundCtx.fillStyle='#f1c477';mapBackgroundCtx.fillRect(portal.x/TILE-2,portal.y/TILE-2,4,4);}
 $('#world-info').textContent=world.stage==='mine'?'Mineshaft · connected caverns · 144 × 144 tiles':`${creatures.length} wanderers · mine northeast of Fernwood · 144 × 144 tiles`;
 clearInput();$('#seed').value=seed;try{history.replaceState(null,'',`#${encodeURIComponent(seed)}`);}catch{}
}
function resize(){const r=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.round(r.width));canvas.height=Math.max(1,Math.round(r.height));viewWidth=canvas.width/zoom;viewHeight=canvas.height/zoom;ctx.imageSmoothingEnabled=false;}
new ResizeObserver(resize).observe(canvas);
function setPaused(value){if(value){setChatOpen(false);setInventoryOpen(false);}paused=value;clearInput();$('#paused').hidden=!value;$('#pause').setAttribute('aria-pressed',String(value));$('#pause').innerHTML=`${value?'Resume':'Pause'} <kbd>P</kbd>`;}
$('#pause').onclick=()=>{if(ready){setPaused(!paused);if(paused)closeMenu();}};$('#resume').onclick=()=>{setPaused(false);closeMenu();};
function toggleMap(){mapVisible=!mapVisible;$('#map-panel').hidden=!mapVisible;$('#show-map').innerHTML=`${mapVisible?'Hide':'Show'} map <kbd>M</kbd>`;$('#show-map').setAttribute('aria-pressed',String(mapVisible));}
$('#toggle-map').onclick=toggleMap;$('#show-map').onclick=toggleMap;
$('#seed-form').addEventListener('submit',e=>{e.preventDefault();showHugNotice('Forest changes are temporarily disabled.');});
$('#random-seed').onclick=()=>{showHugNotice('Forest changes are temporarily disabled.');};
window.addEventListener('keydown',e=>{
 if(!joined||typeof e.key!=='string')return;
 if(e.key==='Escape'&&inventoryOpen){e.preventDefault();setInventoryOpen(false);canvas.focus();return;}
 if(e.key.toLowerCase()==='i'&&!e.repeat&&!['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){e.preventDefault();setInventoryOpen(!inventoryOpen);if(!inventoryOpen)canvas.focus();return;}
 if(e.key==='Escape'&&chatOpen){e.preventDefault();setChatOpen(false);canvas.focus();return;}
 if(e.key==='Escape'&&menu.open){e.preventDefault();closeMenu();return;}
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;
 const key=e.key.toLowerCase();
 if(e.target?.tagName==='BUTTON'&&!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key))return;
 if((key==='enter'||key==='c')&&!e.repeat&&!menuOpen&&!paused){e.preventDefault();setChatOpen(!chatOpen);return;}
 if(chatOpen||inventoryOpen)return;
 if(!e.repeat&&currentHugRequest&&['e','q','escape'].includes(key)){e.preventDefault();respondToHug(key==='e');return;}
 if(key==='e'&&!e.repeat&&nearbyPortal){e.preventDefault();useNearbyPortal();return;}
 if(key==='h'&&!e.repeat){e.preventDefault();offerHug();return;}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','p','m',' '].includes(key))e.preventDefault();
 if(key==='p'&&!e.repeat&&ready){setPaused(!paused);return;}if(key==='m'&&!e.repeat){toggleMap();return;}
 if(joined&&!paused&&!menuOpen)keys.add(key);
});
window.addEventListener('keyup',e=>{if(typeof e.key==='string')keys.delete(e.key.toLowerCase());});window.addEventListener('blur',()=>{if(ready)setPaused(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready)setPaused(true);});
canvas.addEventListener('pointerdown',event=>{
 setInventoryOpen(false);setChatOpen(false);closeMenu();mineInfoAnchor=null;$('#mine-info').hidden=true;
 if(!joined)return;
 const bounds=canvas.getBoundingClientRect(),x=left+(event.clientX-bounds.left)*canvas.width/bounds.width/zoom,y=top+(event.clientY-bounds.top)*canvas.height/bounds.height/zoom;
 if(world.stage==='mine'&&event.pointerType!=='touch'&&(event.button===0||event.button===undefined)&&!paused){event.preventDefault();mouseMining={id:event.pointerId,clientX:event.clientX,clientY:event.clientY};canvas.setPointerCapture(event.pointerId);updateMining();}
 const entrance=mineEntranceAt(world,x,y);if(entrance){mineInfoAnchor=entrance;mineInfoUntil=Date.now()+5000;$('#mine-info').textContent=MINE_INFO;updateMineInfo();}
});
canvas.addEventListener('pointermove',event=>{if(mouseMining?.id===event.pointerId){mouseMining.clientX=event.clientX;mouseMining.clientY=event.clientY;}});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(mouseMining?.id===event.pointerId)stopMining();});
canvas.addEventListener('contextmenu',event=>{if(world?.stage==='mine')event.preventDefault();});
$('#seed').addEventListener('focus',()=>keys.clear());
touchControls=createTouchControls({joystick:$('#joystick'),thumb:$('#joystick-thumb'),sprint:$('#sprint'),enabled:()=>joined&&connection?.welcomed&&!paused&&!menuOpen&&!chatOpen&&!inventoryOpen&&!player?.hugging});
miningControls=createMiningJoystick({joystick:$('#mining-joystick'),thumb:$('#mining-thumb'),enabled:()=>miningAvailable()});
window.addEventListener('resize',clearInput);
window.addEventListener('orientationchange',clearInput);

function update(dt){
 updateMining();
 const enabled=joined&&connection?.welcomed&&!paused&&!menuOpen&&!chatOpen&&!inventoryOpen&&!player.hugging;
 const touch=touchControls.input(),keyboardX=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),keyboardY=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
 const keyboardMoving=keyboardX!==0||keyboardY!==0;
 connection?.sendInput({x:enabled?(keyboardMoving?keyboardX:touch.x):0,y:enabled?(keyboardMoving?keyboardY:touch.y):0,run:enabled&&(keys.has('shift')||touch.run),view:{x:Math.max(0,Math.round((camera.x-viewWidth/2)/TILE)*TILE),y:Math.max(0,Math.round((camera.y-viewHeight/2)/TILE)*TILE),width:Math.ceil(viewWidth),height:Math.ceil(viewHeight),stage:world.stage,seed:world.seed}});
 const blend=1-Math.exp(-dt*22);
 for(const actor of [player,...remotePlayers,...creatures]){if(actor.targetX!==undefined){actor.x+=(actor.targetX-actor.x)*blend;actor.y+=(actor.targetY-actor.y)*blend;}}
 const smoothing=reducedMotion?1:1-Math.exp(-dt*9);camera.x+=(player.x-camera.x)*smoothing;camera.y+=(player.y-camera.y)*smoothing;
 camera.x=Math.max(viewWidth/2,Math.min(SIZE*TILE-viewWidth/2,camera.x));camera.y=Math.max(viewHeight/2,Math.min(SIZE*TILE-viewHeight/2,camera.y));
}
function receiveState(state){
 if(!ready)return;
 const worldSeed=state.worldSeed||state.seed;
 const reset=!!state.terrain||revision!==state.revision||world.seed!==worldSeed||world.stage!==(state.stage||'forest');
 if(reset){generate(worldSeed,state.stage||'forest',state.terrain);revision=state.revision;hugEffects.clear();mineInfoAnchor=null;$('#mine-info').hidden=true;}
 function merge(old,next){const existing=new Map(old.map(a=>[a.id,a]));return next.map(a=>{const previous=existing.get(a.id);return {...a,x:!reset&&previous?previous.x:a.x,y:!reset&&previous?previous.y:a.y,targetX:a.x,targetY:a.y,breakUntil:time+(a.breakEffect?.remainingMs||0)/1000,chatUntil:time+(a.chat?.remainingMs||0)/1000};});}
 const self=state.players.find(a=>a.id===localId);if(!self)return;
 const oldSelf=player;if(self.hugging&&!oldSelf.hugging)clearInput();player={...self,x:reset?self.x:oldSelf.x,y:reset?self.y:oldSelf.y,targetX:self.x,targetY:self.y,breakUntil:time+(self.breakEffect?.remainingMs||0)/1000,chatUntil:time+(self.chat?.remainingMs||0)/1000};
 inventory={...emptyInventory(),...state.inventory};world.minedOres=new Set(state.minedOres||[]);
 for(const index of applyBrokenBlocks(world,state.brokenBlocks)){mapBackgroundCtx.fillStyle='#a9ada9';mapBackgroundCtx.fillRect(index%SIZE,Math.floor(index/SIZE),1,1);}
 renderInventory();
 if(reset)camera={x:self.x,y:self.y};
 remotePlayers=merge(remotePlayers,state.players.filter(a=>a.id!==localId));creatures=merge(creatures,state.creatures);
 $('#player-count').textContent=`${state.players.length} in this area · ${state.onlineCount??state.players.length} online`;
 renderOnlinePlayers(state.onlinePlayers||state.players,state.hostId);
 $('#seed').disabled=true;$('#random-seed').disabled=true;$('#seed-submit').disabled=true;
 $('#seed-note').textContent='Forest changes are temporarily disabled.';
 hugRequests=state.hugRequests||[];
 const sent=hugRequests.find(r=>r.from===localId);if(sent&&sent.id!==lastOutgoingHug){lastOutgoingHug=sent.id;showHugNotice('Hug request sent.');}
 const incoming=hugRequests.find(r=>r.to===localId);
 if(incoming&&incoming.id!==currentHugRequest?.id)clearInput();
 currentHugRequest=incoming||null;
 const liveIds=new Set();
 for(const h of state.hugs||[]){liveIds.add(h.id);if(!hugEffects.has(h.id))hugEffects.set(h.id,{...h,started:time-(HUG_DURATION-h.remainingMs)/1000});}
 for(const id of hugEffects.keys())if(!liveIds.has(id))hugEffects.delete(id);
 if(state.hugNotice&&state.hugNotice.id!==lastHugNotice){lastHugNotice=state.hugNotice.id;showHugNotice(state.hugNotice.text);}
 for(const p of state.players){if(p.chat&&lastChatIds.get(p.id)!==p.chat.id){lastChatIds.set(p.id,p.chat.id);$('#chat-announcement').textContent=`${p.name}: ${p.chat.text}`;}}
 for(const id of lastChatIds.keys())if(!state.players.some(p=>p.id===id))lastChatIds.delete(id);
 if(pendingChat&&self.chat?.text===pendingChat.text){if(pendingChat.clearDraft&&$('#chat-input').value===pendingChat.draft)$('#chat-input').value='';pendingChat=null;$('#chat-feedback').textContent='Sent.';}


}

let left=0,top=0;
const visible=(x,y,margin=100)=>x>left-margin&&y>top-margin&&x<left+viewWidth+margin&&y<top+viewHeight+margin;
function shadow(x,y,width){ctx.fillStyle='#173e302f';ctx.fillRect(Math.round(x-width/2),Math.round(y-3),width,5);}
function drawSprite(kind,x,y,size,flip=false,bob=0){
 const s=sprites.get(kind);if(!s)return;
 const height=size*s.height/s.width;ctx.save();ctx.translate(Math.round(x),Math.round(y+bob));if(flip)ctx.scale(-1,1);ctx.drawImage(s,Math.round(-size/2),Math.round(-height),size,height);ctx.restore();
}
function drawTree(tree){const width=TREE_WIDTH*tree.size,height=TREE_HEIGHT*tree.size;shadow(tree.x,tree.y,38);ctx.drawImage(treeSprites[tree.variant],Math.round(tree.x-width/2),Math.round(tree.y-height+7),Math.round(width),Math.round(height));}
function drawStructure(s){
 if(s.kind==='house'){shadow(s.x,s.y,74);drawSprite('house',s.x,s.y+10,86);return;}
 const x=Math.round(s.x),y=Math.round(s.y);const rect=(dx,dy,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,w,h)};
 if(s.kind==='mine-entrance'){
  rect(-58,-64,116,70,'#424944');rect(-45,-80,90,17,'#59615a');rect(-31,-91,62,12,'#697266');
  rect(-29,-53,58,59,'#101718');rect(-35,-58,10,65,'#7e5834');rect(25,-58,10,65,'#7e5834');rect(-39,-62,78,11,'#ad824c');
  rect(-33,-53,5,52,'#ba955f');rect(27,-53,5,52,'#5c4029');rect(-34,-59,4,4,'#dbbd7a');rect(30,-59,4,4,'#dbbd7a');
  rect(-17,-9,4,51,'#777c76');rect(13,-9,4,51,'#777c76');for(let dy=-5;dy<45;dy+=11)rect(-20,dy,40,4,'#796044');
  rect(-49,-31,7,14,'#daa746');rect(-49,-33,7,5,'#ffe3a0');return;
 }
 if(s.kind==='mine-support'){
  for(const side of [-1,1]){rect(side*48-4,-40,8,44,'#65503a');rect(side*48-2,-36,3,38,'#a58355');}
  rect(-56,-48,112,10,'#8c704a');rect(-54,-46,108,3,'#bd9a61');
  for(let dy=8;dy<38;dy+=10)rect(-19,dy,38,4,'#715d45');rect(-15,2,3,38,'#7a8284');rect(12,2,3,38,'#7a8284');return;
 }
 if(s.kind==='mine-exit'){
  rect(-22,-54,44,60,'#101619');rect(-26,-56,7,62,'#856439');rect(19,-56,7,62,'#856439');rect(-28,-60,56,8,'#b18c57');
  rect(-12,-52,4,58,'#b29a6c');rect(8,-52,4,58,'#b29a6c');for(let dy=-48;dy<6;dy+=10)rect(-9,dy,20,3,'#d1b77e');
  rect(-31,-31,5,13,'#dfae50');rect(-32,-35,7,7,'#ffe5a0');return;
 }
 if(s.kind==='ore'){const color=ORES[s.oreType]?.color||'#bd7c50';rect(-8,-13,8,7,color);rect(3,-7,6,8,color);rect(-2,-19,5,4,color);return;}

 if(s.kind==='well'){
  shadow(x,y,27);rect(-14,-14,28,15,'#8b9278');rect(-11,-17,22,9,'#bdc0a0');rect(-7,-14,14,7,'#355b60');rect(-13,-36,3,24,'#746442');rect(10,-36,3,24,'#746442');rect(-18,-39,36,6,'#946c48');rect(-12,-44,24,5,'#b38b5b');rect(-6,-47,12,3,'#c5a16c');rect(-2,-33,2,18,'#c9b27f');
 }else if(s.kind==='fence'){rect(-16,-13,32,4,'#9c8a5c');rect(-16,-5,32,3,'#9c8a5c');rect(-14,-20,4,25,'#c3ad78');rect(11,-20,4,25,'#c3ad78');}
 else if(s.kind==='sign'){rect(-2,-15,4,20,'#795f3e');rect(-14,-24,28,13,'#c6a475');rect(-11,-20,20,2,'#745f41');}
}
function render(){
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;ctx.scale(zoom,zoom);
 left=Math.round(camera.x-viewWidth/2);top=Math.round(camera.y-viewHeight/2);ctx.translate(-left,-top);
 const minX=Math.max(0,Math.floor(left/TILE)),maxX=Math.min(SIZE-1,Math.ceil((left+viewWidth)/TILE)),minY=Math.max(0,Math.floor(top/TILE)),maxY=Math.min(SIZE-1,Math.ceil((top+viewHeight)/TILE));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const tile=world.tiles[y*SIZE+x];ctx.drawImage(grassSprites[tile===5&&exposedRock(world,x,y)?6:tile],x*TILE,y*TILE);
  if(tile===5&&y+1<SIZE&&world.tiles[(y+1)*SIZE+x]===4){ctx.fillStyle='#262d31';ctx.fillRect(x*TILE,y*TILE+22,32,10);ctx.fillStyle='#384043';ctx.fillRect(x*TILE,y*TILE+29,32,3);}
  if(tile===2){ctx.fillStyle='#8b895050';for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+ox,yy=y+oy;if(xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE&&world.tiles[yy*SIZE+xx]!==2){if(ox)ctx.fillRect(x*TILE+(ox>0?29:0),y*TILE,3,32);else ctx.fillRect(x*TILE,y*TILE+(oy>0?29:0),32,3);}}}
 }
 for(const d of world.decor)if(visible(d.x,d.y,30))drawSprite(d.kind,d.x,d.y,24*d.scale);
 const treeConcealed=new Set([...remotePlayers,...(joined?[player]:[])].filter(p=>hiddenByTrees(world.trees,p)).map(p=>p.id));
 const sharedCanopy=joined?remotePlayers.filter(p=>treeConcealed.has(p.id)&&sharesTreeCover(world.trees,player,p)):[];
 const concealed=new Set(treeConcealed);for(const p of sharedCanopy)concealed.delete(p.id);
 const draws=[];
 for(const tree of world.trees)if(visible(tree.x,tree.y))draws.push({y:tree.y,draw:()=>drawTree(tree)});
 for(const s of world.structures)if(!world.minedOres?.has(s.id)&&(s.kind!=='ore'||exposedRock(world,Math.floor(s.x/TILE),Math.floor(s.y/TILE)))&&visible(s.x,s.y))draws.push({y:s.y,draw:()=>drawStructure(s)});
 for(const a of creatures)if(visible(a.x,a.y,40))draws.push({y:a.y,draw:()=>{
  shadow(a.x,a.y,17);const flying=['butterfly','bat','ghost'].includes(a.kind),bob=reducedMotion?0:flying?-8+Math.sin(time*3+a.phase)*3:a.walking?Math.sin(time*10+a.phase)*1.1:0;
  drawSprite(walkingSprite(a,a.kind),a.x,a.y,28,spriteFlip(a,a.kind),a.kind==='amy'?0:bob);
 }});
 for(const p of [...remotePlayers,...(joined?[player]:[])])if(visible(p.x,p.y,60))draws.push({y:p.y,layer:p.hugging?(p.kind==='tarin'?2:1):0,draw:()=>{
  const size=p.kind==='amy'?32:43;shadow(p.x,p.y,22);drawSprite(walkingSprite(p,p.kind||selectedCharacter),p.x,p.y,size,spriteFlip(p,p.kind||selectedCharacter));
  if(treeConcealed.has(p.id))return;
  drawPlayerName(p,size);
 }});
 draws.sort((a,b)=>a.y-b.y||(a.layer||0)-(b.layer||0));for(const d of draws)d.draw();
 drawCanopyPlayers(treeConcealed,sharedCanopy);
 drawHugHearts();drawMining();
 drawChatBubbles(concealed);
 ctx.setTransform(1,0,0,1,0,0);
 const nearest=world.settlements.find(v=>Math.hypot(player.x/TILE-v.x,player.y/TILE-v.y)<12);$('#location-name').textContent=world.stage==='mine'?'Mineshaft':nearest?.name||'Deep forest';$('#coordinates').textContent=`${Math.floor(player.x/TILE)}, ${Math.floor(player.y/TILE)}`;
 if(mapVisible){mapCtx.imageSmoothingEnabled=false;mapCtx.drawImage(mapBackground,0,0);mapCtx.strokeStyle='#edf3cda0';mapCtx.lineWidth=1;mapCtx.strokeRect(left/TILE,top/TILE,viewWidth/TILE,viewHeight/TILE);mapCtx.fillStyle='#f6edc8';mapCtx.fillRect(Math.floor(player.x/TILE)-1,Math.floor(player.y/TILE)-1,3,3);}
}
function drawPlayerName(p,size){
 ctx.font='8px sans-serif';ctx.textAlign='center';const width=ctx.measureText(p.name||'').width+10;
 const nameX=p.x+(p.hugging?(p.flip?16:-16):0);ctx.fillStyle='#183127d9';ctx.fillRect(Math.round(nameX-width/2),Math.round(p.y-size-15),width,12);ctx.fillStyle='#f1ebcf';ctx.fillText(p.name||'',Math.round(nameX),Math.round(p.y-size-6));
}
function drawCanopyPlayers(concealed,shared){
 const overlays=[...shared,...(joined&&concealed.has(localId)?[player]:[])];
 overlays.sort((a,b)=>a.y-b.y||(a.hugging&&a.kind==='tarin'?2:1)-(b.hugging&&b.kind==='tarin'?2:1));
 for(const p of overlays){
  if(!visible(p.x,p.y,60))continue;
  if(p.id===localId){drawLocalSilhouette(concealed);continue;}
  const size=p.kind==='amy'?32:43;
  ctx.save();ctx.globalAlpha=.65;drawSprite(walkingSprite(p,p.kind),p.x,p.y,size,spriteFlip(p,p.kind));ctx.restore();
  drawPlayerName(p,size);
 }
}
// Local silhouette is always visible; remote overlays require a shared canopy.
function drawLocalSilhouette(concealed){
 if(!joined||player.id!==localId||!concealed.has(localId))return;
 const kind=player.kind||selectedCharacter;
 ctx.save();ctx.globalAlpha=.42;
 drawSprite(walkingSprite(player,kind),player.x,player.y,kind==='amy'?32:43,spriteFlip(player,kind));
 ctx.restore();
}
function showHugNotice(text){const notice=$('#hug-notice');notice.textContent=text;noticeUntil=Date.now()+2200;notice.hidden=false;if(!reducedMotion){notice.getAnimations?.().forEach(a=>a.cancel());notice.animate?.([{opacity:0,offset:0},{opacity:1,offset:.08},{opacity:1,offset:.75},{opacity:0,offset:1}],{duration:2200,fill:'both'});}}
function offerHug(){if(hugRequests.some(r=>r.from===localId||r.to===localId)||!hugTarget||!joined||!connection?.welcomed||paused||menuOpen||chatOpen||inventoryOpen||player.hugging)return;connection.send({type:'hug-request',targetId:hugTarget.id});clearInput();canvas.focus();}
function respondToHug(accept){if(!currentHugRequest||!connection?.welcomed)return;connection.send({type:'hug-response',requestId:currentHugRequest.id,accept});currentHugRequest=null;$('#hug-prompt').hidden=true;clearInput();canvas.focus();}
$('#hug-action').onclick=offerHug;$('#hug-accept').onclick=()=>respondToHug(true);$('#hug-deny').onclick=()=>respondToHug(false);
function updateHugUI(){
 const available=joined&&connection?.welcomed&&!paused&&!menuOpen&&!chatOpen&&!inventoryOpen;
 hugTarget=available&&!player.hugging?remotePlayers.filter(p=>!p.hugging&&(!hiddenByTrees(world.trees,p)||sharesTreeCover(world.trees,player,p))&&Math.hypot(p.x-player.x,p.y-player.y)<=HUG_RANGE).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]:null;
 const outgoing=hugRequests.find(r=>r.from===localId),action=$('#hug-action');
 action.hidden=!available||!hugTarget||!!outgoing||!!currentHugRequest||!!player.hugging;
 action.disabled=!!outgoing;action.textContent=outgoing?'Hug requested…':hugTarget?`Hug ${hugTarget.name} · H`:'';
 $('#hug-prompt').hidden=!available||!currentHugRequest;
 if(currentHugRequest){$('#hug-question').textContent=`${currentHugRequest.fromName} would like to hug you.`;$('#hug-countdown').textContent='Move away to cancel. Requests expire after 10 seconds.';}
 if(Date.now()>=noticeUntil)$('#hug-notice').hidden=true;
}
function drawHugHearts(){
 const actors=[player,...remotePlayers];
 for(const effect of hugEffects.values()){
  const pair=effect.players.map(id=>actors.find(p=>p.id===id));if(pair.some(p=>!p))continue;
  const x=(pair[0].x+pair[1].x)/2,y=Math.min(pair[0].y,pair[1].y)-28,elapsed=time-effect.started;
  if(!visible(x,y,90))continue;
  for(let i=0;i<(reducedMotion?2:8);i++){
   const age=elapsed-i*.24;if(age<0||age>1.25)continue;
   ctx.save();ctx.globalAlpha=reducedMotion?1:Math.min(1,age*7)*(1-age/1.25);
   const drift=reducedMotion?(i?9:-9):Math.sin(i*2.4+age*2)*16,rise=reducedMotion?18:age*37;
   drawSprite('heart',x+drift,y-rise,11+(i%2)*3);ctx.restore();
  }
 }
}
function renderServerChat(){
 const feed=$('#server-chat'),nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<30;
 const rows=serverChatMessages.map(message=>{const row=document.createElement('p');row.textContent=`<${message.name}> ${message.text}`;return row;});
 $('#server-chat-messages').replaceChildren(...rows);feed.hidden=!joined||!chatSettings.server||serverChatMessages.length===0;
 if(nearBottom||!chatOpen)feed.scrollTop=feed.scrollHeight;
}
function addServerChat(messages){serverChatMessages=mergeChatHistory(serverChatMessages,messages);renderServerChat();}
function saveChatSettings(){
 chatSettings.bubbles=$('#show-overhead-chat').checked;chatSettings.server=$('#show-server-chat').checked;
 try{localStorage.setItem('forest-chat-settings',JSON.stringify(chatSettings));}catch{}
 renderServerChat();
}
$('#show-overhead-chat').checked=chatSettings.bubbles;$('#show-server-chat').checked=chatSettings.server;
$('#show-overhead-chat').addEventListener('change',saveChatSettings);$('#show-server-chat').addEventListener('change',saveChatSettings);
function setChatOpen(value){
 chatOpen=!!value&&joined&&!!connection?.welcomed;
 $('#chat-panel').hidden=!chatOpen;$('#chat-toggle').setAttribute('aria-expanded',String(chatOpen));
 if(chatOpen){setInventoryOpen(false);menu.open=false;menuOpen=false;clearInput();$('#chat-input').focus();}
}
function sendChat(text,clearDraft=false){
 if(!joined||!connection?.welcomed){$('#chat-feedback').textContent='Reconnect to send a message.';return;}
 try{text=cleanChat(text);}catch(error){$('#chat-feedback').textContent=error.message;return;}
 clearInput();pendingChat={text,clearDraft,draft:$('#chat-input').value,sentAt:time};$('#chat-feedback').textContent='Sending…';connection.send({type:'chat',text});
}
$('#chat-toggle').onclick=()=>{setChatOpen(!chatOpen);if(!chatOpen)canvas.focus();};
$('#chat-close').onclick=()=>{setChatOpen(false);canvas.focus();};
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();sendChat($('#chat-input').value,true);});
for(const text of QUICK_MESSAGES){const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=()=>sendChat(text);$('#quick-messages').appendChild(button);}
function updateChatUI(){
 const available=joined&&connection?.welcomed&&!menuOpen&&!paused;
 $('#chat-toggle').hidden=!available;
 if(!available&&chatOpen)setChatOpen(false);
 if(pendingChat&&time-pendingChat.sentAt>5){pendingChat=null;$('#chat-feedback').textContent='Message not confirmed. Try sending again.';}
}
function drawChatBubbles(concealed=new Set()){
 if(!chatSettings.bubbles)return;
 for(const p of [...remotePlayers,...(joined?[player]:[])]){
  if(concealed.has(p.id)||!p.chat||time>=p.chatUntil||!visible(p.x,p.y,100))continue;
  ctx.save();ctx.font='9px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
  const maxWidth=Math.min(126,viewWidth-30),lines=wrapChat(p.chat.text,text=>ctx.measureText(text).width,maxWidth-16);
  const width=Math.max(45,...lines.map(line=>ctx.measureText(line).width+16)),height=lines.length*12+12;
  const x=Math.round(Math.max(left+6,Math.min(left+viewWidth-width-6,p.x-width/2))),bottom=p.y-(p.kind==='amy'?32:43)-21,y=Math.round(Math.max(top+6,bottom-height));
  ctx.fillStyle='#294333';ctx.fillRect(x-1,y-1,width+2,height+2);ctx.fillStyle='#f6f2df';ctx.fillRect(x,y,width,height);
  const tail=Math.max(x+7,Math.min(x+width-7,p.x));ctx.beginPath();ctx.moveTo(tail-4,y+height);ctx.lineTo(tail,y+height+5);ctx.lineTo(tail+4,y+height);ctx.closePath();ctx.fill();
  ctx.fillStyle='#243c35';lines.forEach((line,i)=>ctx.fillText(line,x+8,y+6+i*12));ctx.restore();
 }
}

function renderInventory(){
 const slots=inventorySlots(inventory),signature=JSON.stringify(slots);
 if($('#inventory-slots').inventorySignature!==signature){
  $('#inventory-slots').inventorySignature=signature;
  const cells=slots.map((stack,i)=>{const cell=document.createElement('li');cell.className='inventory-slot';
   cell.setAttribute('aria-label',stack?`${ORES[stack.type].name}, ${stack.count}, ${ORES[stack.type].rarity}`:`Empty slot ${i+1}`);
   if(stack){cell.title=`${ORES[stack.type].name} · ${ORES[stack.type].rarity}`;const icon=document.createElement('span');icon.className=`ore-icon ${stack.type}`;icon.setAttribute('aria-hidden','true');cell.appendChild(icon);const count=document.createElement('span');count.className='slot-count';count.textContent=String(stack.count);cell.appendChild(count);}
   return cell;
  });$('#inventory-slots').replaceChildren(...cells);
 }

}
function setInventoryOpen(value){
 inventoryOpen=!!value&&joined&&!!connection?.welcomed&&!paused;
 $('#inventory-panel').hidden=!inventoryOpen;$('#inventory-toggle').setAttribute('aria-expanded',String(inventoryOpen));
 if(inventoryOpen){setChatOpen(false);menu.open=false;menuOpen=false;clearInput();connection.sendInput({x:0,y:0,run:false});$('#inventory-close').focus();}
}
$('#inventory-toggle').onclick=()=>{setInventoryOpen(!inventoryOpen);if(!inventoryOpen)canvas.focus();};
$('#inventory-close').onclick=()=>{setInventoryOpen(false);canvas.focus();};
function miningAvailable(){return joined&&connection?.welcomed&&!paused&&!menuOpen&&!chatOpen&&!inventoryOpen&&!player?.hugging&&world?.stage==='mine';}
function stopMining(){
 const old=mouseMining;mouseMining=null;miningTarget=null;
 if(lastMineKey!==null&&connection?.welcomed)connection.send({type:'mine-target',x:null,y:null});
 lastMineKey=null;
 if(old&&canvas.hasPointerCapture?.(old.id))canvas.releasePointerCapture(old.id);
}
function updateMining(){
 if(!miningAvailable()){if(mouseMining||lastMineKey!==null)stopMining();return;}
 const aim=miningControls?.input()||{x:0,y:0};let target=null;
 if(aim.x||aim.y)target=miningRay(world,player,aim.x,aim.y);
 else if(mouseMining){const b=canvas.getBoundingClientRect(),x=Math.floor((left+(mouseMining.clientX-b.left)*canvas.width/b.width/zoom)/TILE),y=Math.floor((top+(mouseMining.clientY-b.top)*canvas.height/b.height/zoom)/TILE);if(canMineBlock(world,player,x,y))target={x,y};}
 miningTarget=target;const key=target?`${target.x},${target.y}`:null,now=Date.now();
 if(key!==lastMineKey||(key!==null&&now-lastMineSent>=100)){connection.send({type:'mine-target',x:target?.x??null,y:target?.y??null});lastMineKey=key;lastMineSent=now;}
}
function drawMining(){
 if(world.stage!=='mine')return;
 if(miningTarget){ctx.strokeStyle='#eddfab';ctx.lineWidth=1;ctx.strokeRect(miningTarget.x*TILE+1,miningTarget.y*TILE+1,TILE-2,TILE-2);}
 const cracks=[[16,2,14,11],[14,11,20,18],[20,18,17,30],[14,11,5,16],[20,18,29,14],[7,16,9,24],[20,18,26,26]];
 for(const actor of [...remotePlayers,...(joined?[player]:[])]){
  const m=actor.mining,e=actor.breakEffect;
  if(m){ctx.save();ctx.translate(m.x*TILE,m.y*TILE);ctx.strokeStyle='#11191ee0';ctx.lineWidth=1.5;
   for(const [x,y,xx,yy] of cracks.slice(0,Math.max(1,Math.ceil(m.progress*cracks.length)))){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}ctx.restore();
  }
  if(!m&&(!e||actor.breakUntil<=time))continue;
  const target=m||e,tx=target.x*TILE+16,ty=target.y*TILE+16,angle=Math.atan2(ty-actor.y,tx-actor.x);
  ctx.save();ctx.globalAlpha=.35;ctx.translate(actor.x+Math.cos(angle)*15,actor.y-12+Math.sin(angle)*12);
  ctx.rotate(reducedMotion?angle:angle+(m?Math.sin(time*16)*.85:Math.max(0,.4-(actor.breakUntil-time))*Math.PI*5));
  // Code-native pixel pickaxe: wooden haft and a stepped steel head.
  ctx.fillStyle='#8e653e';ctx.fillRect(-2,-4,4,25);ctx.fillStyle='#c69c61';ctx.fillRect(-1,-3,1,22);
  ctx.fillStyle='#b7c7cb';ctx.fillRect(-13,-8,24,5);ctx.fillRect(-17,-4,6,5);ctx.fillRect(9,-4,6,5);ctx.fillStyle='#e2ebde';ctx.fillRect(-9,-9,16,2);ctx.restore();
 }
}
function updateInventoryUI(){
 const available=joined&&connection?.welcomed&&!paused&&!menuOpen;
 $('#inventory-toggle').hidden=!available;
 if(!available&&inventoryOpen)setInventoryOpen(false);
 $('#mining-controls').hidden=!miningAvailable();
}

function useNearbyPortal(){if(!joined||!connection?.welcomed||!nearbyPortal||paused||menuOpen||chatOpen||inventoryOpen||player.hugging)return;clearInput();connection.send({type:'use-portal'});canvas.focus();}
$('#portal-action').onclick=useNearbyPortal;
function updatePortalUI(){
 nearbyPortal=joined&&connection?.welcomed&&!paused&&!menuOpen&&!chatOpen&&!inventoryOpen&&!player.hugging?world.portals.find(portal=>Math.hypot(player.x-portal.x,player.y-portal.y)<=90):null;
 const button=$('#portal-action');button.hidden=!nearbyPortal;
 if(nearbyPortal)button.textContent=world.stage==='forest'?'Enter mine · E':'Exit mine · E';
}
function updateMineInfo(){
 const bubble=$('#mine-info');
 if(!mineInfoAnchor||Date.now()>=mineInfoUntil||!joined||world.stage!=='forest'){bubble.hidden=true;mineInfoAnchor=null;return;}
 const screenX=(mineInfoAnchor.x-left)*zoom,screenY=(mineInfoAnchor.y-top)*zoom;
 if(screenX<0||screenX>canvas.width||screenY<-100||screenY>canvas.height+100){bubble.hidden=true;return;}
 bubble.hidden=false;const width=bubble.offsetWidth||260,height=bubble.offsetHeight||80;
 bubble.style.left=`${Math.max(width/2+10,Math.min(canvas.width-width/2-10,screenX))}px`;
 bubble.style.top=`${Math.max(12,screenY-100*zoom-height)}px`;
}
function frame(now){const dt=Math.min(.04,(now-previous)/1000||0);previous=now;if(ready){time+=dt;if(joined)update(dt);render();updateHugUI();updateChatUI();updateMineInfo();updatePortalUI();updateInventoryUI();}requestAnimationFrame(frame);}
async function start(){
 try{
  const results=await Promise.all(['./assets/collection.json','./assets/actors.json'].map(async url=>{const res=await fetch(url);if(!res.ok)throw new Error(`Could not load ${url}`);return res.json();}));
  collection=results[0];for(const item of collection)sprites.set(item.id,sprite(item));for(const [id,data] of Object.entries(results[1]))sprites.set(id,sprite(data));
  makeTextures();renderInventory();let seed='TARIN-01';try{seed=decodeURIComponent(location.hash.slice(1)).trim().slice(0,48)||seed;}catch{}
  generate(seed);resize();ready=true;$('#loading').hidden=true;$('#login').hidden=false;
  for(const kind of ['tarin','amy']){const portrait=$('#choose-'+kind).getContext('2d');portrait.imageSmoothingEnabled=false;const image=sprites.get(kind);const height=kind==='tarin'?70:56;portrait.drawImage(image,(80-height)/2,80-height,height,height);}
  if(savedProfile?.name){$('#player-name').value=savedProfile.name;const choice=$(`input[name="character"][value="${savedProfile.character==='amy'?'amy':'tarin'}"]`);if(choice)choice.checked=true;}
  $('#player-name').focus();requestAnimationFrame(frame);
 }catch(error){$('#loading').textContent=`The forest could not load. Run npm install and npm run dev in the game folder, then open http://localhost:5174/. ${error.message}`;$('#loading').classList.add('error');}
}
function renderOnlinePlayers(roster,hostId){
 const signature=JSON.stringify([localId,hostId,roster]);if(signature===rosterSignature)return;rosterSignature=signature;
 const rows=roster.map(person=>{
  const row=document.createElement('div');row.className='online-player';
  const label=document.createElement('span');label.textContent=`${person.name}${person.id===localId?' (you)':''}${person.id===hostId?' · Host':''}`;
  const detail=document.createElement('small');detail.textContent=`${person.kind==='amy'?'Amy':'Tarin'} · ${person.stage==='mine'?'Mine':'Forest'}`;
  const info=document.createElement('div');info.appendChild(label);info.appendChild(detail);row.appendChild(info);
  if(person.id!==localId){const button=document.createElement('button');button.type='button';button.textContent='Remove';button.setAttribute('aria-label',`Remove ${person.name}`);button.onclick=()=>connection.send({type:'remove-player',targetId:person.id});row.appendChild(button);}
  return row;
 });
 $('#online-list').replaceChildren(...rows);$('#roster-help').textContent='You can remove any other player, including the host.';
}
function showError(message,context){if(context==='chat'){pendingChat=null;$('#chat-feedback').textContent=message;return;}if(joined){if(connection?.welcomed)$('#connection-status').hidden=true;showHugNotice(message);return;}$('#join-error').textContent=message;$('#join-error').hidden=false;$('#join-button').disabled=false;}
connection=new ForestConnection({onRemoved:message=>returnToLogin(message),onChat:message=>addServerChat([message]),url:`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`,onState:receiveState,
 onWelcome(message){if(message.protocolVersion!==PROTOCOL_VERSION){connection.disconnect();returnToLogin(PROTOCOL_ERROR);return;}serverChatMessages=[];savedProfile={name:$('#player-name').value.trim(),character:selectedCharacter,token:message.token};try{sessionStorage.setItem('forest-profile',JSON.stringify(savedProfile));}catch{}localId=message.id;joined=true;rosterSignature='';addServerChat(message.chatHistory||[]);revision=null;$('#login').hidden=true;canvas.setAttribute('aria-label',`Explore as ${selectedCharacter==='amy'?'Amy':'Tarin'}. WASD or arrows to walk, Shift to run. Open the menu for controls.`);$('#join-button').disabled=false;$('#session-name').textContent=`${$('#player-name').value.trim()} · ${selectedCharacter==='amy'?'Amy':'Tarin'}`;setPaused(false);closeMenu();},
 onStatus(status){$('#connection-status').textContent=status;$('#connection-status').hidden=status==='Connected'||!joined;if(status!=='Connected'){clearInput();if(player)player.walking=false;for(const a of remotePlayers)a.walking=false;}},onError:showError});
$('#join-form').addEventListener('submit',e=>{e.preventDefault();if(!ready)return;const name=$('#player-name').value.trim();if(!name||name.length>24){showError('Enter a name from 1 to 24 characters.');return;}selectedCharacter=$('input[name="character"]:checked').value;$('#join-error').hidden=true;$('#join-button').disabled=true;connection.connect({name,character:selectedCharacter,token:savedProfile?.name===name&&savedProfile?.character===selectedCharacter?savedProfile.token:undefined});});
function returnToLogin(reason=''){savedProfile=null;try{sessionStorage.removeItem('forest-profile');}catch{}setInventoryOpen(false);inventory=emptyInventory();renderInventory();$('#inventory-toggle').hidden=true;$('#mining-controls').hidden=true;setChatOpen(false);pendingChat=null;lastChatIds.clear();joined=false;serverChatMessages=[];renderServerChat();localId=null;remotePlayers=[];hugRequests=[];currentHugRequest=null;hugEffects.clear();$('#hug-prompt').hidden=true;$('#hug-action').hidden=true;clearInput();setPaused(false);closeMenu();$('#login').hidden=false;$('#connection-status').hidden=true;$('#join-button').disabled=false;$('#join-error').hidden=!reason;$('#join-error').textContent=reason;rosterSignature='';$('#online-list').replaceChildren();$('#player-name').focus();}
$('#logout').onclick=()=>{connection.disconnect();returnToLogin();};
start();
