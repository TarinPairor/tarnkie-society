export const CHAT_LIMIT=140,CHAT_DURATION=6000,CHAT_COOLDOWN=800;
export const QUICK_MESSAGES=['Hi!','Follow me!','Wait for me!',"Let’s explore!",'Want a hug?','Thank you!','You’re cute!','See you!'];
export function cleanChat(text){
 if(typeof text!=='string')throw new Error('Enter a message.');
 const message=text.replace(/\s+/gu,' ').replace(/[\u0000-\u001f\u007f]/g,'').trim();
 if(!message)throw new Error('Enter a message.');
 if(message.length>CHAT_LIMIT)throw new Error(`Keep messages to ${CHAT_LIMIT} characters.`);
 return message;
}
// Character-based wrapping also handles long words and languages without spaces.
export function wrapChat(text,measure,maxWidth){
 const lines=[];let line='';
 for(const character of text){if(line&&measure(line+character)>maxWidth){lines.push(line.trimEnd());line=character.trimStart();}else line+=character;}
 if(line)lines.push(line.trimEnd());return lines;
}
