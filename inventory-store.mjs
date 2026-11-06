import {readFileSync,mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {emptyInventory,ORES} from './items.js';
const CHARACTERS=['tarin','amy'];
function cleanInventory(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid saved inventory.');
 const result=emptyInventory();for(const type of Object.keys(ORES)){const count=value[type]??0;if(!Number.isSafeInteger(count)||count<0)throw new Error(`Invalid saved ${type} count.`);result[type]=count;}return result;
}
// One server owns these two character inventories. No display names or session tokens are stored.
export class InventoryStore {
 constructor({filePath=null}={}){
  this.filePath=filePath;this.characters={tarin:emptyInventory(),amy:emptyInventory()};
  if(!filePath)return;
  let data;try{data=JSON.parse(readFileSync(filePath,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw new Error(`Cannot load inventories from ${filePath}: ${error.message}`);}
  if(!data||data.version!==1||!data.characters||typeof data.characters!=='object'||Array.isArray(data.characters))throw new Error(`Unsupported inventory save in ${filePath}.`);
  for(const kind of CHARACTERS)this.characters[kind]=cleanInventory(data.characters[kind]??emptyInventory());
 }
 load(kind){if(!CHARACTERS.includes(kind))throw new Error('Unknown character.');return {...this.characters[kind]};}
 save(kind,inventory){
  if(!CHARACTERS.includes(kind))throw new Error('Unknown character.');
  const next={...this.characters,[kind]:cleanInventory(inventory)};
  if(JSON.stringify(next)===JSON.stringify(this.characters))return;
  if(this.filePath){
   mkdirSync(path.dirname(this.filePath),{recursive:true});const temp=`${this.filePath}.${randomUUID()}.tmp`;
   try{writeFileSync(temp,JSON.stringify({version:1,characters:next},null,2)+'\n',{mode:0o600,flush:true});renameSync(temp,this.filePath);}finally{rmSync(temp,{force:true});}
  }
  this.characters=next;
 }
}

export function createPersistentInventoryStore({dataDir=process.env.GAME_DATA_DIR||fileURLToPath(new URL('./data/',import.meta.url))}={}){
 return new InventoryStore({filePath:path.resolve(dataDir,'inventories.json')});
}
