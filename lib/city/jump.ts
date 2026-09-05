export type JumpKind='idle'|'walk'|'run';
export type JumpPhase='grounded'|'takeoff'|'airborne'|'landing';
export const JUMP_PROFILES={
  idle:{takeoff:.10,launchSpeed:2.7,gravity:13,landing:.20},
  walk:{takeoff:.10,launchSpeed:2.7,gravity:13,landing:.20},
  run:{takeoff:.08,launchSpeed:3.3,gravity:13,landing:.20},
} as const;
export const JUMP_TIMING=JUMP_PROFILES.idle;
export const flightDuration=(kind:JumpKind='idle')=>2*JUMP_PROFILES[kind].launchSpeed/JUMP_PROFILES[kind].gravity;
export const jumpDuration=(kind:JumpKind='idle')=>JUMP_PROFILES[kind].takeoff+flightDuration(kind)+JUMP_PROFILES[kind].landing;
export const FLIGHT_DURATION=flightDuration(),JUMP_DURATION=jumpDuration();
export type JumpFrame={phase:JumpPhase;kind:JumpKind;time:number;height:number;velocity:number};
export const jumpKind=(speed:number):JumpKind=>speed>3?'run':speed>.45?'walk':'idle';
export function sampleJump(time:number,kind:JumpKind='idle'):JumpFrame {
  const timing=JUMP_PROFILES[kind];
  if(time<0||time>=jumpDuration(kind))return {phase:'grounded',kind,time:0,height:0,velocity:0};
  if(time<timing.takeoff)return {phase:'takeoff',kind,time,height:0,velocity:0};
  const t=time-timing.takeoff;
  if(t<flightDuration(kind))return {phase:'airborne',kind,time,height:Math.max(0,timing.launchSpeed*t-.5*timing.gravity*t*t),velocity:timing.launchSpeed-timing.gravity*t};
  return {phase:'landing',kind,time,height:0,velocity:0};
}
export class JumpController {
  frame:JumpFrame=sampleJump(-1);
  request(kind:JumpKind='idle'){if(this.frame.phase!=='grounded')return false;this.frame=sampleJump(0,kind);return true;}
  update(dt:number){if(this.frame.phase!=='grounded')this.frame=sampleJump(this.frame.time+Math.max(0,dt),this.frame.kind);return this.frame;}
  reset(){this.frame=sampleJump(-1);}
}

/** Takeoff commits horizontal momentum; looking around cannot redirect a jump. */
export function jumpVelocity(velocity:{x:number;z:number},desired:{x:number;z:number},phase:JumpPhase,dt:number) {
  if(phase==='airborne'||phase==='takeoff')return {x:velocity.x*Math.exp(-.10*dt),z:velocity.z*Math.exp(-.10*dt)};
  const dx=desired.x-velocity.x,dz=desired.z-velocity.z,d=Math.hypot(dx,dz),step=Math.min(d,7*Math.max(0,dt));
  return d<1e-8?{...desired}:{x:velocity.x+dx/d*step,z:velocity.z+dz/d*step};
}
