import {TILE,SIZE} from './world.js';
export const MINING_REACH=5*TILE;
export const MINING_SECONDS=.5;
export const ORE_MINING_SECONDS=.7;
export function exposedRock(world,x,y){
 if(world?.stage!=='mine'||x<3||y<3||x>=SIZE-3||y>=SIZE-3||!world.blocked[y*SIZE+x])return false;
 return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>world.blocked[(y+dy)*SIZE+x+dx]===0);
}
export function canMineBlock(world,player,x,y){
 if(!Number.isInteger(x)||!Number.isInteger(y)||!exposedRock(world,x,y))return false;
 const tx=x*TILE+TILE/2,ty=y*TILE+TILE/2,distance=Math.hypot(player.x-tx,player.y-ty);
 if(!Number.isFinite(distance)||distance>MINING_REACH)return false;
 const steps=Math.ceil(distance/2);let px=Math.floor(player.x/TILE),py=Math.floor(player.y/TILE);
 for(let i=0;i<=steps;i++){
  const t=steps?i/steps:0,xx=Math.floor((player.x+(tx-player.x)*t)/TILE),yy=Math.floor((player.y+(ty-player.y)*t)/TILE);
  if(xx!==px&&yy!==py&&world.blocked[py*SIZE+xx]&&world.blocked[yy*SIZE+px])return false;
  if(xx===x&&yy===y)return true;
  if(xx<0||yy<0||xx>=SIZE||yy>=SIZE||world.blocked[yy*SIZE+xx])return false;
  px=xx;py=yy;
 }
 return false;
}
export function miningRay(world,player,dx,dy){
 const length=Math.hypot(dx,dy);if(!length||world?.stage!=='mine')return null;
 for(let d=0;d<=MINING_REACH;d+=2){const x=Math.floor((player.x+dx/length*d)/TILE),y=Math.floor((player.y+dy/length*d)/TILE);if(x<0||y<0||x>=SIZE||y>=SIZE)return null;if(world.blocked[y*SIZE+x])return canMineBlock(world,player,x,y)?{x,y}:null;}
 return null;
}
export function applyBrokenBlocks(world,indices){
 const changed=[];if(world?.stage!=='mine')return changed;
 for(const index of indices||[]){if(!Number.isInteger(index)||index<0||index>=SIZE*SIZE)continue;if(world.blocked[index]){world.blocked[index]=0;world.tiles[index]=4;changed.push(index);}}
 return changed;
}
// Ore visibility and targeting use the same exposed-wall rules as ordinary rock.
export function canMineOre(world,player,ore){return ore?.kind==='ore'&&!world.minedOres?.has(ore.id)&&canMineBlock(world,player,Math.floor(ore.x/TILE),Math.floor(ore.y/TILE));}
