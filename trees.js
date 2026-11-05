export const TREE_WIDTH=68,TREE_HEIGHT=90;
// The opaque part of each generated canopy, in the source sprite's pixel grid.
const shapes=[[[9,43,32,8],[3,29,42,16],[7,15,36,22],[14,5,25,20],[16,4,18,14]],[[20,1,8,6],[16,7,16,8],[12,15,24,8],[8,23,32,9],[4,32,40,10],[2,42,44,8]],[[9,43,32,8],[3,29,42,16],[7,15,36,22],[14,5,25,20],[16,4,18,14]]];
export function treeCoversPoint(tree,x,y){
 const width=TREE_WIDTH*tree.size,height=TREE_HEIGHT*tree.size;
 const px=(x-tree.x+width/2)/width*48,py=(y-tree.y+height-7)/height*64;
 return shapes[tree.variant].some(([rx,ry,rw,rh])=>px>=rx&&px<=rx+rw&&py>=ry&&py<=ry+rh);
}
// Suppress floating labels/actions when most of the character is concealed.
export function hiddenByTrees(trees,actor){
 const height=actor.kind==='amy'?32:43;
 return [height*.35,height*.6,height*.85].filter(offset=>trees.some(tree=>tree.y>actor.y&&Math.abs(tree.x-actor.x)<TREE_WIDTH*tree.size/2&&treeCoversPoint(tree,actor.x,actor.y-offset))).length>=2;
}
