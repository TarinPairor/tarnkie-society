import {SIZE} from './world.js';
export function encodeTiles(tiles){
 const runs=[];for(const value of tiles){if(runs.length&&runs.at(-2)===value)runs[runs.length-1]++;else runs.push(value,1);}return runs;
}
export function decodeTiles(runs){
 if(!Array.isArray(runs)||runs.length%2||runs.length>SIZE*SIZE*2)throw new Error('Invalid terrain data.');
 const tiles=new Uint8Array(SIZE*SIZE);let offset=0;
 for(let i=0;i<runs.length;i+=2){const value=runs[i],count=runs[i+1];if(!Number.isInteger(value)||value<0||value>5||!Number.isInteger(count)||count<1||offset+count>tiles.length)throw new Error('Invalid terrain data.');tiles.fill(value,offset,offset+count);offset+=count;}
 if(offset!==tiles.length)throw new Error('Incomplete terrain data.');return tiles;
}
export function packCaveTerrain(world){if(world.stage!=='mine')throw new Error('Only cave terrain can be packed for mines.');return {stage:'mine',seed:world.seed,size:SIZE,tiles:encodeTiles(world.tiles),blocked:encodeTiles(world.blocked),structures:world.structures};}
export function applyCaveTerrain(world,payload){
 if(world.stage!=='mine'||payload.stage!=='mine'||payload.size!==SIZE||payload.seed!==world.seed)throw new Error('Cave terrain does not match this stage.');
 const tiles=decodeTiles(payload.tiles),blocked=decodeTiles(payload.blocked);
 for(let i=0;i<tiles.length;i++)if((tiles[i]!==4&&tiles[i]!==5)||blocked[i]!==Number(tiles[i]===5))throw new Error('Cave floor and collision data disagree.');
 world.tiles=tiles;world.blocked=blocked;world.structures=payload.structures;return world;
}
