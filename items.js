export const ORES={
 copper:{name:'Copper',rarity:'Common',color:'#bd7c50',weight:70},
 iron:{name:'Iron',rarity:'Uncommon',color:'#aebbc2',weight:25},
 gold:{name:'Gold',rarity:'Rare',color:'#e3bc57',weight:5}
};
export function emptyInventory(){return {copper:0,iron:0,gold:0};}
export function rollOre(value){return value<.70?'copper':value<.95?'iron':'gold';}

export const INVENTORY_SIZE=5;
export function inventorySlots(inventory){
 const stacks=Object.keys(ORES).filter(type=>inventory[type]>0).map(type=>({type,count:inventory[type]}));
 return Array.from({length:INVENTORY_SIZE},(_,i)=>stacks[i]||null);
}
