import { isWalkable, moveWithCollisions, type Obstacle } from './movement.ts';

export type Seat={id:string;label:string;x:number;z:number;yaw:number;ground:number;height:number;obstacle:Obstacle;occupied?:boolean};
export type SittingPhase='none'|'approach'|'align'|'sitDown'|'seated'|'standUp'|'leave';
export const SEATING_TIMING={sitDown:2.15,standUp:1.85};
export const SEAT_FRONT=.438769;
export type SeatFrame={phase:SittingPhase;seat?:Seat;time:number;progress:number;x:number;z:number;yaw:number;speed:number};
export function seatFront(seat:Seat){return {x:seat.x+Math.sin(seat.yaw)*SEAT_FRONT,z:seat.z+Math.cos(seat.yaw)*SEAT_FRONT};}
export function seatExit(seat:Seat,obstacles:Obstacle[]) {
  const from=seatFront(seat),others=obstacles.filter(o=>o!==seat.obstacle);
  const directions=[0,.5,-.5,1.3,-1.3,Math.PI];
  for(const distance of [.85,1.15,1.5,1.9])for(const angle of directions){
    const p={x:seat.x+Math.sin(seat.yaw+angle)*distance,z:seat.z+Math.cos(seat.yaw+angle)*distance};
    if(isWalkable(p.x,p.z,obstacles)&&Array.from({length:12},(_,i)=>(i+1)/12).every(t=>isWalkable(from.x+(p.x-from.x)*t,from.z+(p.z-from.z)*t,others)))return p;
  }
  return undefined;
}
export function nearestSeat(position:{x:number;z:number},seats:Seat[],obstacles:Obstacle[],range=2.2) {
  let nearest:Seat|undefined,best=range;
  for(const seat of seats){
    const d=Math.hypot(position.x-seat.x,position.z-seat.z);
    if(seat.occupied||d>=best||!seatExit(seat,obstacles))continue;
    // Enter from the open front or side, never walk through the chair back.
    if((position.x-seat.x)*Math.sin(seat.yaw)+(position.z-seat.z)*Math.cos(seat.yaw)<-.12)continue;
    const front=seatFront(seat),others=obstacles.filter(o=>o!==seat.obstacle);
    let clear=true;
    for(let i=1;i<=12;i++)if(!isWalkable(position.x+(front.x-position.x)*i/12,position.z+(front.z-position.z)*i/12,others)){clear=false;break;}
    if(clear){nearest=seat;best=d;}
  }
  return nearest;
}
export class SeatController {
  private exit?:{x:number;z:number};
  frame:SeatFrame={phase:'none',time:0,progress:0,x:0,z:0,yaw:0,speed:0};
  request(seat:Seat,position:{x:number;z:number},obstacles:Obstacle[]) {
    if(this.frame.phase!=='none'||seat.occupied||!seatExit(seat,obstacles))return false;
    this.frame={phase:'approach',seat,time:0,progress:0,x:position.x,z:position.z,yaw:seat.yaw,speed:0};return true;
  }
  stand(obstacles:Obstacle[]){if(this.frame.phase!=='seated'||!this.frame.seat)return false;this.exit=seatExit(this.frame.seat,obstacles);if(!this.exit)return false;this.frame.phase='standUp';this.frame.time=0;return true;}
  update(dt:number,obstacles:Obstacle[]) {
    const f=this.frame,seat=f.seat;if(!seat||f.phase==='none')return f;
    f.time+=dt;
    if(f.phase==='approach'||f.phase==='leave'){
      const target=f.phase==='leave'?this.exit??seatFront(seat):seatFront(seat),dx=target.x-f.x,dz=target.z-f.z,d=Math.hypot(dx,dz),step=Math.min(d,1.2*dt);
      const p=d>1e-5?moveWithCollisions(f.x,f.z,dx/d*step,dz/d*step,obstacles.filter(o=>o!==seat.obstacle)):{x:f.x,z:f.z};
      f.speed=dt>0?Math.hypot(p.x-f.x,p.z-f.z)/dt:0;f.x=p.x;f.z=p.z;
      f.yaw=d>.08?Math.atan2(dx,dz):seat.yaw;
      if(d<.025){if(f.phase==='leave'){f.phase='none';f.seat=undefined;}else{f.phase='align';f.time=0;f.speed=0;f.yaw=seat.yaw;}}
      else if(f.time>4&&f.speed<.02){f.phase='none';f.seat=undefined;}
    }else if(f.phase==='align'){
      if(f.time>=.3){f.phase='sitDown';f.time=0;f.x=seat.x;f.z=seat.z;}
    }else if(f.phase==='sitDown'){
      f.progress=Math.min(1,f.time/SEATING_TIMING.sitDown);
      if(f.progress===1){f.phase='seated';f.time=0;}
    }else if(f.phase==='seated'){f.progress=1;}
    else if(f.phase==='standUp'){
      f.progress=1-Math.min(1,f.time/SEATING_TIMING.standUp);
      if(f.progress===0){const exit=seatExit(seat,obstacles);if(exit){this.exit=exit;const front=seatFront(seat);f.x=front.x;f.z=front.z;f.phase='leave';f.time=0;}else{f.phase='seated';f.progress=1;}}
    }
    return this.frame;
  }
  reset(){this.frame={phase:'none',time:0,progress:0,x:0,z:0,yaw:0,speed:0};}
}
