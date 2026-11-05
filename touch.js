// Radial dead zone and a clamped thumb keep input stable at any screen size.
export function joystickVector(dx,dy,radius,deadZone=.15){
 const distance=Math.hypot(dx,dy),clamped=Math.min(distance,radius);
 if(!distance||radius<=0)return {x:0,y:0,thumbX:0,thumbY:0};
 const strength=Math.max(0,(clamped/radius-deadZone)/(1-deadZone));
 return {x:dx/distance*strength,y:dy/distance*strength,thumbX:dx/distance*clamped,thumbY:dy/distance*clamped};
}
export function createTouchControls({joystick,thumb,sprint,enabled}){
 let stickPointer=null,sprintPointer=null,x=0,y=0,run=false;
 function display(){thumb.style.transform=`translate(${displayX}px, ${displayY}px)`;sprint.setAttribute('aria-pressed',String(run));}
 let displayX=0,displayY=0;
 function move(event){
  if(event.pointerId!==stickPointer)return;
  if(!enabled()){reset();return;}
  const bounds=joystick.getBoundingClientRect(),radius=Math.min(bounds.width,bounds.height)*.3;
  const vector=joystickVector(event.clientX-bounds.left-bounds.width/2,event.clientY-bounds.top-bounds.height/2,radius);
  ({x,y}=vector);displayX=vector.thumbX;displayY=vector.thumbY;display();
 }
 joystick.addEventListener('pointerdown',event=>{
  event.preventDefault();if(!enabled()||stickPointer!==null||event.button>0)return;
  stickPointer=event.pointerId;joystick.setPointerCapture(stickPointer);move(event);
 });
 joystick.addEventListener('pointermove',move);
 function stopStick(event){if(event.pointerId!==stickPointer)return;stickPointer=null;x=y=displayX=displayY=0;display();}
 for(const name of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(name,stopStick);
 sprint.addEventListener('pointerdown',event=>{
  event.preventDefault();if(!enabled()||sprintPointer!==null||event.button>0)return;
  sprintPointer=event.pointerId;sprint.setPointerCapture(sprintPointer);run=true;display();
 });
 function stopSprint(event){if(event.pointerId!==sprintPointer)return;sprintPointer=null;run=false;display();}
 for(const name of ['pointerup','pointercancel','lostpointercapture'])sprint.addEventListener(name,stopSprint);
 // iOS can start a selection/callout from a long press on nested button text.
 for(const element of [joystick,sprint]){
  for(const event of ['contextmenu','selectstart','dragstart'])element.addEventListener(event,e=>e.preventDefault());
  element.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
 }
 function reset(){const oldStick=stickPointer,oldSprint=sprintPointer;stickPointer=sprintPointer=null;x=y=displayX=displayY=0;run=false;display();
  if(oldStick!==null&&joystick.hasPointerCapture?.(oldStick))joystick.releasePointerCapture(oldStick);
  if(oldSprint!==null&&sprint.hasPointerCapture?.(oldSprint))sprint.releasePointerCapture(oldSprint);
 }
 display();return {input:()=>({x,y,run}),reset};
}
