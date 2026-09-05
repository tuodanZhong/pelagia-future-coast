import type { Obstacle } from './movement';
export type Position = {x:number;y:number;z:number};
// Sweep the camera through the same solid footprints as the player, at its own height.
export function resolveFollowCamera(target:Position, desired:Position, obstacles:Obstacle[]):Position {
  const delta={x:desired.x-target.x,y:desired.y-target.y,z:desired.z-target.z};
  const distance=Math.hypot(delta.x,delta.y,delta.z),steps=Math.max(1,Math.ceil(distance/.08));
  let fraction=1;
  for(let i=1;i<=steps;i++) {
    const f=i/steps,x=target.x+delta.x*f,y=target.y+delta.y*f,z=target.z+delta.z*f;
    if(y<.28||obstacles.some(o=>y<(o.height??1.2)+.25 && (o.shape==='box'
      ? Math.abs(x-o.x)<o.rx+.25&&Math.abs(z-o.z)<o.rz+.25
      : ((x-o.x)/(o.rx+.25))**2+((z-o.z)/(o.rz+.25))**2<1))) {fraction=Math.max(0,(i-2)/steps);break;}
  }
  return {x:target.x+delta.x*fraction,y:Math.max(.28,target.y+delta.y*fraction),z:target.z+delta.z*fraction};
}
export function followOffset(yaw:number,pitch:number,distance=4.6) {
  const c=Math.cos(pitch),shoulder=.38;
  return {x:Math.sin(yaw)*c*distance+Math.cos(yaw)*shoulder,y:-Math.sin(pitch)*distance,z:Math.cos(yaw)*c*distance-Math.sin(yaw)*shoulder};
}
