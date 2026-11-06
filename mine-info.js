export const MINE_INFO='Magic mines! Ever time you enter some thing is different 😕';
export function mineEntranceAt(world,x,y){
 if(world?.stage!=='forest')return null;
 return world.structures.find(s=>s.kind==='mine-entrance'&&x>=s.x-58&&x<=s.x+58&&y>=s.y-91&&y<=s.y+42)||null;
}
