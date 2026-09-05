/** Pure bicycle controller. Metres/seconds, +Z forward, positive steer is rider-right (D-A). */
export type BikeState={x:number;z:number;yaw:number;speed:number;steer:number;crank:number;wheelRoll:number;lean:number;cadence:number};
export type BikeInput={throttle:number;steer:number;brake?:number;boost?:boolean|number};
export type BikeCollisionPose={x:number;z:number;yaw:number;length:number;width:number};
export type BikeEnvironment={
  /** Wrap existing vehicleCollision / world colliders here; true rejects the candidate pose. */
  blocked?:(pose:BikeCollisionPose)=>boolean;
};
export type BikeResult={state:BikeState;travel:number;collided:boolean};
export const BIKE_MOTION=Object.freeze({length:1.95,width:.64,wheelbase:1.14,wheelRadius:.34,maxSpeed:8,boostSpeed:12,maxSteer:.58,maxLateralAcceleration:3.65,braking:5.8,gearRatio:3.1});
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const finite=(v:number|undefined,fallback=0)=>Number.isFinite(v)?v as number:fallback;
const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const phase=(v:number)=>((v%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
const approach=(v:number,target:number,amount:number)=>v<target?Math.min(target,v+amount):Math.max(target,v-amount);
const amount=(v:number|boolean|undefined)=>typeof v==='boolean'?Number(v):clamp(finite(v),0,1);
export function createBikeState(p:Partial<BikeState>={}):BikeState {
  return {x:finite(p.x),z:finite(p.z),yaw:angle(finite(p.yaw)),speed:clamp(finite(p.speed),0,12),steer:clamp(finite(p.steer),-.58,.58),crank:phase(finite(p.crank,Math.PI/2)),wheelRoll:phase(finite(p.wheelRoll)),lean:clamp(finite(p.lean),-.38,.38),cadence:clamp(finite(p.cadence),0,13)};
}
function advance(s:BikeState,distance:number){
  const beta=-Math.atan(.5*Math.tan(s.steer));
  const turn=-distance*Math.cos(beta)*Math.tan(s.steer)/BIKE_MOTION.wheelbase;
  const middle=s.yaw+beta+turn*.5;
  return {...s,x:s.x+distance*Math.sin(middle),z:s.z+distance*Math.cos(middle),yaw:angle(s.yaw+turn)};
}
/** W pedals, S/Space only brake, Shift adds speed while pedaling. No reversing, drifting or jump. */
export function stepBike(state:BikeState,input:BikeInput,dt:number,environment:BikeEnvironment={}):BikeResult {
  let next=createBikeState(state),travel=0,collided=false;
  const duration=clamp(finite(dt),0,.25);if(duration===0)return {state:next,travel,collided};
  const pedaling=clamp(finite(input.throttle),0,1),brake=Math.max(amount(input.brake),clamp(-finite(input.throttle),0,1)),boost=brake>0?0:amount(input.boost);
  const steering=clamp(finite(input.steer),-1,1),n=Math.max(1,Math.ceil(duration*120),Math.ceil(duration*12/.05)),h=duration/n;
  for(let i=0;i<n;i++){
    const oldSpeed=next.speed,limit=8+boost*4;
    // Speed-dependent steering preserves a comfortable finite turning radius and stable lean.
    const steerLimit=Math.min(.58,Math.atan(BIKE_MOTION.maxLateralAcceleration*1.14/Math.max(.5,next.speed*next.speed)));
    next.steer=approach(next.steer,steering*steerLimit,2.1*h);
    let speed=brake>0?Math.max(0,next.speed-BIKE_MOTION.braking*brake*h):next.speed+pedaling*(2.5+1.0*boost)*h;
    speed=Math.max(0,speed-(.08+.009*speed*speed)*h);
    const curvature=Math.abs(Math.tan(next.steer))/1.14;
    const cornerLimit=curvature>1e-8?Math.sqrt(3.65/curvature):12;
    const targetLimit=Math.min(limit,Math.max(1.7,cornerLimit));
    if(speed>targetLimit)speed=approach(speed,targetLimit,(brake>0?5.8:3.2)*h);
    speed=Math.min(speed,12);if(speed<.015&&pedaling===0)speed=0;
    next.speed=speed;
    const distance=(oldSpeed+speed)*.5*h;
    let candidate=advance(next,distance),accepted=distance;
    const blocked=(s:BikeState)=>environment.blocked?.({x:s.x,z:s.z,yaw:s.yaw,length:BIKE_MOTION.length,width:BIKE_MOTION.width})??false;
    if(blocked(candidate)){
      // Recover the last clear portion of a substep; wheels only roll through accepted movement.
      let lo=0,hi=1;for(let j=0;j<10;j++){const mid=(lo+hi)/2;if(blocked(advance(next,distance*mid)))hi=mid;else lo=mid;}
      accepted=distance*lo;candidate=advance(next,accepted);candidate.speed=0;collided=true;
    }
    const yawRate=accepted>0?-candidate.speed*Math.cos(Math.atan(.5*Math.tan(candidate.steer)))*Math.tan(candidate.steer)/1.14:0;
    const desiredLean=clamp(Math.atan(-candidate.speed*yawRate/9.81),-.38,.38);
    candidate.lean=next.lean+(desiredLean-next.lean)*(1-Math.exp(-8*h));
    const targetCadence=pedaling>0&&brake===0&&candidate.speed>.03?clamp(candidate.speed/(.34*3.1),2.1,12):0;
    candidate.cadence=next.cadence+(targetCadence-next.cadence)*(1-Math.exp(-12*h));
    candidate.crank=phase(next.crank+(next.cadence+candidate.cadence)*.5*h);
    if(candidate.speed<.3&&(pedaling===0||brake>0))candidate.crank=phase(next.crank+clamp(angle(Math.PI/2-next.crank),-6*h,6*h));
    candidate.wheelRoll=phase(next.wheelRoll+accepted/.34);
    next=candidate;travel+=accepted;
    if(collided){next.lean=approach(next.lean,0,2.2*(duration-(i+1)*h));next.cadence=0;break;}
  }
  return {state:next,travel,collided};
}
