import {PROTOCOL_VERSION} from './protocol.js';
export class ForestConnection {
 constructor({url,onState,onWelcome,onStatus,onError,onChat,onRemoved,WebSocketClass=globalThis.WebSocket}){Object.assign(this,{url,onState,onWelcome,onStatus,onError,onChat,onRemoved,WebSocketClass});this.socket=null;this.wantsConnection=false;this.retry=0;this.profile=null;this.token=null;this.welcomed=false;}
 connect(profile){this.disconnect();this.profile=profile;this.token=profile.token||null;this.wantsConnection=true;this.open();}
 open(){
  if(!this.wantsConnection)return;
  this.onStatus(this.retry?'Reconnecting…':'Connecting…');this.welcomed=false;
  let ws;try{ws=new this.WebSocketClass(this.url);}catch{this.onError('Could not connect. Start the game with npm run dev.');this.wantsConnection=false;return;}
  this.socket=ws;
  ws.onopen=()=>{if(ws!==this.socket)return;ws.send(JSON.stringify({...this.profile,type:'join',token:this.token,protocolVersion:PROTOCOL_VERSION}));};
  ws.onmessage=event=>{if(ws!==this.socket)return;let m;try{m=JSON.parse(event.data);}catch{return;}
   if(m.type==='welcome'){this.token=m.token;this.welcomed=true;this.retry=0;this.lastInput=null;this.onWelcome(m);this.onStatus('Connected');}
   else if(m.type==='removed'){this.wantsConnection=false;this.welcomed=false;this.token=null;clearTimeout(this.timer);this.onRemoved?.(m.message);ws.close();}
   else if(m.type==='chat-message'&&this.welcomed)this.onChat?.(m.message);
   else if(m.type==='state'&&this.welcomed)this.onState(m);
   else if(m.type==='error'){this.onError(m.message,m.context);if(!this.welcomed){this.wantsConnection=false;ws.close();}}
  };
  ws.onerror=()=>{};
  ws.onclose=event=>{if(ws!==this.socket)return;this.welcomed=false;if(event?.code===4001&&this.wantsConnection){this.wantsConnection=false;this.token=null;this.onRemoved?.('You were removed from the forest by another player.');}
   if(this.wantsConnection){this.onStatus('Reconnecting…');if(!this.token)this.onError('Multiplayer server unavailable. Run npm run dev in the game folder and open the exact address it prints. A Python server cannot handle /ws.');this.retry++;this.timer=setTimeout(()=>this.open(),Math.min(5000,500*this.retry));}
   else this.onStatus('Disconnected');
  };
 }
 send(message){if(this.socket?.readyState===1&&this.welcomed)this.socket.send(JSON.stringify(message));}
 sendInput(input,now=Date.now()){
  const key=JSON.stringify(input);if(key!==this.lastInput||now-this.lastSent>=100){this.send({type:'input',...input});this.lastInput=key;this.lastSent=now;}
 }
 regenerate(seed){this.send({type:'regenerate',seed});}
 disconnect(){this.wantsConnection=false;clearTimeout(this.timer);if(this.socket){this.socket.onclose=null;this.send({type:'logout'});this.socket.close();this.socket=null;}this.welcomed=false;this.token=null;}
}
