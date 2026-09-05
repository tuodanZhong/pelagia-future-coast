export const WALK_SPEED = 1.8;
export const SPRINT_SPEED = 5.0;

/** A short acceleration ramp keeps a change of gait from snapping the camera. */
export function locomotionSpeed(current:number, moving:boolean, sprint:boolean, dt:number) {
  if(!moving)return 0;
  const target=sprint?SPRINT_SPEED:WALK_SPEED;
  const step=(target>current?8:12)*Math.max(0,dt);
  return current<target?Math.min(target,current+step):Math.max(target,current-step);
}
