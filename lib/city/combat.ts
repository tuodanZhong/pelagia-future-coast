import { isWalkable, type Obstacle } from './movement.ts';

export const PUNCH_TIMING={duration:.65,contact:.28,cooldown:.78};
export type AttackFrame={active:boolean;time:number;contact:boolean};
export class AttackController {
  private remaining=0;
  frame:AttackFrame={active:false,time:0,contact:false};
  request(){if(this.remaining>0||this.frame.active)return false;this.remaining=PUNCH_TIMING.cooldown;this.frame={active:true,time:0,contact:false};return true;}
  update(dt:number){
    this.remaining=Math.max(0,this.remaining-dt);const f=this.frame;f.contact=false;
    if(f.active){const previous=f.time;f.time+=dt;f.contact=previous<PUNCH_TIMING.contact&&f.time>=PUNCH_TIMING.contact;if(f.time>=PUNCH_TIMING.duration)f.active=false;}
    return f;
  }
  reset(){this.remaining=0;this.frame={active:false,time:0,contact:false};}
}
export function punchTarget<T extends {x:number;z:number;seatObstacle?:Obstacle}>(origin:{x:number;z:number},yaw:number,targets:T[],obstacles:Obstacle[]){
  let selected:T|undefined,best=1.25;
  for(const target of targets){
    const dx=target.x-origin.x,dz=target.z-origin.z,d=Math.hypot(dx,dz);
    if(d>best||d<.08||(dx*Math.sin(yaw)+dz*Math.cos(yaw))/d<.55)continue;
    let clear=true;
    const blockers=target.seatObstacle?obstacles.filter(o=>o!==target.seatObstacle):obstacles;
    for(let t=.12;t<d-.2;t+=.12)if(!isWalkable(origin.x+dx/d*t,origin.z+dz/d*t,blockers,0)){clear=false;break;}
    if(clear){selected=target;best=d;}
  }
  return selected;
}
