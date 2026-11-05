import {createTouchControls} from './touch.js';
import {ForestConnection} from './network.js';
import {walkingSprite} from './animation.js';
import {TILE,SIZE,makeWorld,makeCreatures,randomFromSeed} from './world.js';
const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d'),map=$('#map'),mapCtx=map.getContext('2d');
const keys=new Set(),sprites=new Map(),treeSprites=[],grassSprites=[];
let world,creatures=[],player,collection=[],camera={x:0,y:0},paused=false,ready=false,time=0,previous=0,viewWidth=800,viewHeight=500,mapVisible=false;
let menuOpen=false,connection=null,joined=false,localId=null,revision=null,remotePlayers=[];
let selectedCharacter='tarin',savedProfile=null,touchControls=null;
function clearInput(){keys.clear();touchControls?.reset();}
try{savedProfile=JSON.parse(sessionStorage.getItem('forest-profile'));}catch{}
const menu=$('#menu');
menu.addEventListener('toggle',()=>{menuOpen=menu.open;clearInput();if(player)player.walking=false;if(!menuOpen)canvas.focus();});
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
function generate(seed){
 world=makeWorld(seed);const types=collection.filter(o=>['Creatures','Monsters','People'].includes(o.category));creatures=makeCreatures(world,types);
 player={...world.spawn,radius:7,flip:false,walking:false};camera={x:player.x,y:player.y};
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const i=y*SIZE+x;mapBackgroundCtx.fillStyle=world.tiles[i]===2?'#c4ad78':world.blocked[i]?'#34573b':'#6d8950';mapBackgroundCtx.fillRect(x,y,1,1);
 }
 for(const v of world.settlements){mapBackgroundCtx.fillStyle='#ebce91';mapBackgroundCtx.fillRect(v.x-1,v.y-1,3,3);}
 $('#world-info').textContent=`${creatures.length} wanderers · 15 cottages · 144 × 144 tiles`;
 clearInput();$('#seed').value=seed;try{history.replaceState(null,'',`#${encodeURIComponent(seed)}`);}catch{}
}
function resize(){const r=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.round(r.width));canvas.height=Math.max(1,Math.round(r.height));viewWidth=canvas.width/zoom;viewHeight=canvas.height/zoom;ctx.imageSmoothingEnabled=false;}
new ResizeObserver(resize).observe(canvas);
function setPaused(value){paused=value;clearInput();$('#paused').hidden=!value;$('#pause').setAttribute('aria-pressed',String(value));$('#pause').innerHTML=`${value?'Resume':'Pause'} <kbd>P</kbd>`;}
$('#pause').onclick=()=>{if(ready){setPaused(!paused);if(paused)closeMenu();}};$('#resume').onclick=()=>{setPaused(false);closeMenu();};
function toggleMap(){mapVisible=!mapVisible;$('#map-panel').hidden=!mapVisible;$('#show-map').innerHTML=`${mapVisible?'Hide':'Show'} map <kbd>M</kbd>`;$('#show-map').setAttribute('aria-pressed',String(mapVisible));}
$('#toggle-map').onclick=toggleMap;$('#show-map').onclick=toggleMap;
$('#seed-form').addEventListener('submit',e=>{e.preventDefault();if(!joined)return;connection.regenerate($('#seed').value.trim()||'TARIN-01');});
$('#random-seed').onclick=()=>{if(!joined)return;connection.regenerate(`FERN-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`);};
window.addEventListener('keydown',e=>{
 if(!joined||typeof e.key!=='string')return;
 if(e.key==='Escape'&&menu.open){e.preventDefault();closeMenu();return;}
 if(['INPUT','TEXTAREA','BUTTON'].includes(e.target?.tagName))return;
 const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','p','m',' '].includes(key))e.preventDefault();
 if(key==='p'&&!e.repeat&&ready){setPaused(!paused);return;}if(key==='m'&&!e.repeat){toggleMap();return;}
 if(joined&&!paused&&!menuOpen)keys.add(key);
});
window.addEventListener('keyup',e=>{if(typeof e.key==='string')keys.delete(e.key.toLowerCase());});window.addEventListener('blur',()=>{if(ready)setPaused(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready)setPaused(true);});
canvas.addEventListener('pointerdown',closeMenu);
$('#seed').addEventListener('focus',()=>keys.clear());
touchControls=createTouchControls({joystick:$('#joystick'),thumb:$('#joystick-thumb'),sprint:$('#sprint'),enabled:()=>joined&&connection?.welcomed&&!paused&&!menuOpen});
window.addEventListener('resize',clearInput);
window.addEventListener('orientationchange',clearInput);

function update(dt){
 const enabled=joined&&connection?.welcomed&&!paused&&!menuOpen;
 const touch=touchControls.input(),keyboardX=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),keyboardY=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
 const keyboardMoving=keyboardX!==0||keyboardY!==0;
 connection?.sendInput({x:enabled?(keyboardMoving?keyboardX:touch.x):0,y:enabled?(keyboardMoving?keyboardY:touch.y):0,run:enabled&&(keys.has('shift')||touch.run)});
 const blend=1-Math.exp(-dt*22);
 for(const actor of [player,...remotePlayers,...creatures]){if(actor.targetX!==undefined){actor.x+=(actor.targetX-actor.x)*blend;actor.y+=(actor.targetY-actor.y)*blend;}}
 const smoothing=reducedMotion?1:1-Math.exp(-dt*9);camera.x+=(player.x-camera.x)*smoothing;camera.y+=(player.y-camera.y)*smoothing;
 camera.x=Math.max(viewWidth/2,Math.min(SIZE*TILE-viewWidth/2,camera.x));camera.y=Math.max(viewHeight/2,Math.min(SIZE*TILE-viewHeight/2,camera.y));
}
function receiveState(state){
 if(!ready)return;
 const reset=revision!==state.revision||world.seed!==state.seed;
 if(reset){generate(state.seed);revision=state.revision;}
 function merge(old,next){const existing=new Map(old.map(a=>[a.id,a]));return next.map(a=>{const previous=existing.get(a.id);return {...a,x:!reset&&previous?previous.x:a.x,y:!reset&&previous?previous.y:a.y,targetX:a.x,targetY:a.y};});}
 const self=state.players.find(a=>a.id===localId);if(!self)return;
 const oldSelf=player;player={...self,x:reset?self.x:oldSelf.x,y:reset?self.y:oldSelf.y,targetX:self.x,targetY:self.y};
 if(reset)camera={x:self.x,y:self.y};
 remotePlayers=merge(remotePlayers,state.players.filter(a=>a.id!==localId));creatures=merge(creatures,state.creatures);
 $('#player-count').textContent=`${state.players.length} online`;
 $('#online-list').textContent=state.players.map(a=>`${a.name} (${a.kind==='amy'?'Amy':'Tarin'})`).join(' · ');
 const host=state.hostId===localId;$('#seed').disabled=!host;$('#random-seed').disabled=!host;$('#seed-submit').disabled=!host;
 $('#seed-note').textContent=host?'Changing this seed regenerates the forest for everyone.':'Only the first connected player can change the forest.';
}

let left=0,top=0;
const visible=(x,y,margin=100)=>x>left-margin&&y>top-margin&&x<left+viewWidth+margin&&y<top+viewHeight+margin;
function shadow(x,y,width){ctx.fillStyle='#173e302f';ctx.fillRect(Math.round(x-width/2),Math.round(y-3),width,5);}
function drawSprite(kind,x,y,size,flip=false,bob=0){
 const s=sprites.get(kind);if(!s)return;
 const height=size*s.height/s.width;ctx.save();ctx.translate(Math.round(x),Math.round(y+bob));if(flip)ctx.scale(-1,1);ctx.drawImage(s,Math.round(-size/2),Math.round(-height),size,height);ctx.restore();
}
function drawTree(tree){const width=58*tree.size,height=77*tree.size;ctx.save();if(tree.y>player.y&&Math.abs(tree.x-player.x)<width/2&&tree.y-player.y<height)ctx.globalAlpha=.55;shadow(tree.x,tree.y,38);ctx.drawImage(treeSprites[tree.variant],Math.round(tree.x-width/2),Math.round(tree.y-height+7),Math.round(width),Math.round(height));ctx.restore();}
function drawStructure(s){
 if(s.kind==='house'){shadow(s.x,s.y,74);drawSprite('house',s.x,s.y+10,86);return;}
 const x=Math.round(s.x),y=Math.round(s.y);const rect=(dx,dy,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,w,h)};
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
  const tile=world.tiles[y*SIZE+x];ctx.drawImage(grassSprites[tile],x*TILE,y*TILE);
  if(tile===2){ctx.fillStyle='#8b895050';for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+ox,yy=y+oy;if(xx>=0&&yy>=0&&xx<SIZE&&yy<SIZE&&world.tiles[yy*SIZE+xx]!==2){if(ox)ctx.fillRect(x*TILE+(ox>0?29:0),y*TILE,3,32);else ctx.fillRect(x*TILE,y*TILE+(oy>0?29:0),32,3);}}}
 }
 for(const d of world.decor)if(visible(d.x,d.y,30))drawSprite(d.kind,d.x,d.y,24*d.scale);
 const draws=[];
 for(const tree of world.trees)if(visible(tree.x,tree.y))draws.push({y:tree.y,draw:()=>drawTree(tree)});
 for(const s of world.structures)if(visible(s.x,s.y))draws.push({y:s.y,draw:()=>drawStructure(s)});
 for(const a of creatures)if(visible(a.x,a.y,40))draws.push({y:a.y,draw:()=>{
  shadow(a.x,a.y,17);const flying=['butterfly','bat','ghost'].includes(a.kind),bob=reducedMotion?0:flying?-8+Math.sin(time*3+a.phase)*3:a.walking?Math.sin(time*10+a.phase)*1.1:0;
  drawSprite(walkingSprite(a,a.kind),a.x,a.y,28,a.flip,a.kind==='amy'?0:bob);
 }});
 for(const p of [...remotePlayers,...(joined?[player]:[])])if(visible(p.x,p.y,60))draws.push({y:p.y,draw:()=>{
  const size=p.kind==='amy'?32:43;shadow(p.x,p.y,22);drawSprite(walkingSprite(p,p.kind||selectedCharacter),p.x,p.y,size,p.flip);
  ctx.font='8px sans-serif';ctx.textAlign='center';const width=ctx.measureText(p.name||'').width+10;ctx.fillStyle='#183127d9';ctx.fillRect(Math.round(p.x-width/2),Math.round(p.y-size-15),width,12);ctx.fillStyle='#f1ebcf';ctx.fillText(p.name||'',Math.round(p.x),Math.round(p.y-size-6));
 }});
 draws.sort((a,b)=>a.y-b.y);for(const d of draws)d.draw();
 // A small marker keeps Tarin visible even where multiple canopies overlap.
 for(const tree of world.trees)if(tree.y>player.y&&Math.abs(tree.x-player.x)<30&&tree.y-player.y<72){ctx.fillStyle='#e8eacb';ctx.fillRect(Math.round(player.x)-1,Math.round(player.y)-25,3,3);}
 ctx.setTransform(1,0,0,1,0,0);
 const nearest=world.settlements.find(v=>Math.hypot(player.x/TILE-v.x,player.y/TILE-v.y)<12);$('#location-name').textContent=nearest?.name||'Deep forest';$('#coordinates').textContent=`${Math.floor(player.x/TILE)}, ${Math.floor(player.y/TILE)}`;
 if(mapVisible){mapCtx.imageSmoothingEnabled=false;mapCtx.drawImage(mapBackground,0,0);mapCtx.strokeStyle='#edf3cda0';mapCtx.lineWidth=1;mapCtx.strokeRect(left/TILE,top/TILE,viewWidth/TILE,viewHeight/TILE);mapCtx.fillStyle='#f6edc8';mapCtx.fillRect(Math.floor(player.x/TILE)-1,Math.floor(player.y/TILE)-1,3,3);}
}
function frame(now){const dt=Math.min(.04,(now-previous)/1000||0);previous=now;if(ready){time+=dt;if(joined)update(dt);render();}requestAnimationFrame(frame);}
async function start(){
 try{
  const results=await Promise.all(['./assets/collection.json','./assets/actors.json'].map(async url=>{const res=await fetch(url);if(!res.ok)throw new Error(`Could not load ${url}`);return res.json();}));
  collection=results[0];for(const item of collection)sprites.set(item.id,sprite(item));for(const [id,data] of Object.entries(results[1]))sprites.set(id,sprite(data));
  makeTextures();let seed='TARIN-01';try{seed=decodeURIComponent(location.hash.slice(1)).trim().slice(0,48)||seed;}catch{}
  generate(seed);resize();ready=true;$('#loading').hidden=true;$('#login').hidden=false;
  for(const kind of ['tarin','amy']){const portrait=$('#choose-'+kind).getContext('2d');portrait.imageSmoothingEnabled=false;const image=sprites.get(kind);const height=kind==='tarin'?70:56;portrait.drawImage(image,(80-height)/2,80-height,height,height);}
  if(savedProfile?.name){$('#player-name').value=savedProfile.name;const choice=$(`input[name="character"][value="${savedProfile.character==='amy'?'amy':'tarin'}"]`);if(choice)choice.checked=true;}
  $('#player-name').focus();requestAnimationFrame(frame);
 }catch(error){$('#loading').textContent=`The forest could not load. Run npm install and npm run dev in the game folder, then open http://localhost:5174/. ${error.message}`;$('#loading').classList.add('error');}
}
function showError(message){$('#join-error').textContent=message;$('#join-error').hidden=false;$('#join-button').disabled=false;if(joined){$('#connection-status').textContent=message;$('#connection-status').hidden=false;}}
connection=new ForestConnection({url:`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`,onState:receiveState,
 onWelcome(message){savedProfile={name:$('#player-name').value.trim(),character:selectedCharacter,token:message.token};try{sessionStorage.setItem('forest-profile',JSON.stringify(savedProfile));}catch{}localId=message.id;joined=true;revision=null;$('#login').hidden=true;canvas.setAttribute('aria-label',`Explore as ${selectedCharacter==='amy'?'Amy':'Tarin'}. WASD or arrows to walk, Shift to run. Open the menu for controls.`);$('#join-button').disabled=false;$('#session-name').textContent=`${$('#player-name').value.trim()} · ${selectedCharacter==='amy'?'Amy':'Tarin'}`;setPaused(false);closeMenu();},
 onStatus(status){$('#connection-status').textContent=status;$('#connection-status').hidden=status==='Connected';if(status!=='Connected'){clearInput();if(player)player.walking=false;for(const a of remotePlayers)a.walking=false;}},onError:showError});
$('#join-form').addEventListener('submit',e=>{e.preventDefault();if(!ready)return;const name=$('#player-name').value.trim();if(!name||name.length>24){showError('Enter a name from 1 to 24 characters.');return;}selectedCharacter=$('input[name="character"]:checked').value;$('#join-error').hidden=true;$('#join-button').disabled=true;connection.connect({name,character:selectedCharacter,token:savedProfile?.name===name&&savedProfile?.character===selectedCharacter?savedProfile.token:undefined});});
$('#logout').onclick=()=>{connection.disconnect();savedProfile=null;try{sessionStorage.removeItem('forest-profile');}catch{}joined=false;localId=null;remotePlayers=[];clearInput();setPaused(false);closeMenu();$('#login').hidden=false;$('#connection-status').hidden=true;$('#join-button').disabled=false;$('#join-error').hidden=true;$('#player-name').focus();};
start();
