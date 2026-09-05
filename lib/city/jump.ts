export type JumpPhase='grounded'|'takeoff'|'airborne'|'landing';
export const JUMP_TIMING={takeoff:.15,launchSpeed:4.4,gravity:13,landing:.273076923076923} as const;
export const FLIGHT_DURATION=2*JUMP_TIMING.launchSpeed/JUMP_TIMING.gravity;
export const JUMP_DURATION=JUMP_TIMING.takeoff+FLIGHT_DURATION+JUMP_TIMING.landing;
export type JumpFrame={phase:JumpPhase;time:number;height:number;velocity:number};
export function sampleJump(time:number):JumpFrame {
  if(time<0||time>=JUMP_DURATION)return {phase:'grounded',time:0,height:0,velocity:0};
  if(time<JUMP_TIMING.takeoff)return {phase:'takeoff',time,height:0,velocity:0};
  const t=time-JUMP_TIMING.takeoff;
  if(t<FLIGHT_DURATION)return {phase:'airborne',time,height:Math.max(0,JUMP_TIMING.launchSpeed*t-.5*JUMP_TIMING.gravity*t*t),velocity:JUMP_TIMING.launchSpeed-JUMP_TIMING.gravity*t};
  return {phase:'landing',time,height:0,velocity:0};
}
export class JumpController {
  frame:JumpFrame=sampleJump(-1);
  request(){if(this.frame.phase!=='grounded')return false;this.frame=sampleJump(0);return true;}
  update(dt:number){if(this.frame.phase!=='grounded')this.frame=sampleJump(this.frame.time+Math.max(0,dt));return this.frame;}
  reset(){this.frame=sampleJump(-1);}
}
