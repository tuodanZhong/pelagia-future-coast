/** Pure, deterministic vehicle motion. Coordinates: metres, seconds, +Z forward at yaw=0. */
export type StaticObstacle = { x:number; z:number; rx:number; rz:number; shape?:'ellipse'|'box'; height?:number; yaw?:number };
export type VehicleBody = { id?:string|number; x:number; z:number; yaw:number; length?:number; width?:number };
export type DrivingState = { x:number; z:number; yaw:number; speed:number; steer:number; lateralSpeed?:number; yawRate?:number; drift?:number; boostBlend?:number };
export type DrivingInput = { throttle:number; steer:number; brake?:number; boost?:boolean|number; handbrake?:boolean|number };
export type DrivingEnvironment = {
  /** Exclude ALL traffic-car obstacles here. Pass other cars in vehicles instead. */
  obstacles:readonly StaticObstacle[];
  vehicles?:readonly VehicleBody[];
  ignoreVehicleId?:string|number;
  worldEdge?:number;
};
export type DrivingConfig = {
  length:number; width:number; wheelbase:number; maxForward:number; maxReverse:number;
  acceleration:number; reverseAcceleration:number; braking:number; rollingResistance:number; drag:number;
  maxSteer:number; steeringRate:number; maxLateralAcceleration:number; collisionMargin:number;
  boostForward:number; boostAcceleration:number;
};
export const DEFAULT_DRIVING:Readonly<DrivingConfig> = Object.freeze({
  length:4.9,width:2.2,wheelbase:2.8,maxForward:14,maxReverse:4,
  acceleration:4.8,reverseAcceleration:3,braking:8.5,rollingResistance:.55,drag:.012,
  maxSteer:.56,steeringRate:1.9,maxLateralAcceleration:4.8,collisionMargin:.045,
  boostForward:24,boostAcceleration:8.2,
});
export type VehicleCollision = {kind:'world-edge'} | {kind:'obstacle';index:number} | {kind:'vehicle';index:number;id?:string|number};
export type DrivingImpact = {velocity:{x:number;z:number};point:{x:number;z:number};normal:{x:number;z:number};speed:number;yawRate:number};
export type DrivingResult = {state:DrivingState;travel:number;collided:boolean;collision?:VehicleCollision;impact?:DrivingImpact};
export type ExitPosition = {x:number;z:number;yaw:number;side:'left'|'right'};

const EPS=1e-8;
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const finite=(x:number,fallback=0)=>Number.isFinite(x)?x:fallback;
const positive=(x:number|undefined,fallback:number)=>x!==undefined&&Number.isFinite(x)&&x>0?x:fallback;
const angle=(x:number)=>x>=-Math.PI&&x<=Math.PI?x:Math.atan2(Math.sin(x),Math.cos(x));
const approach=(x:number,target:number,step:number)=>x<target?Math.min(target,x+step):Math.max(target,x-step);
const amount=(v:boolean|number|undefined)=>typeof v==='boolean'?Number(v):clamp(finite(v??0),0,1);
type Point={x:number;z:number};
type Rectangle={x:number;z:number;hw:number;hl:number;right:Point;forward:Point;ex:number;ez:number};

function rectangle(body:VehicleBody,margin=0):Rectangle {
  const yaw=finite(body.yaw),s=Math.sin(yaw),c=Math.cos(yaw);
  const hw=positive(body.width,DEFAULT_DRIVING.width)/2+margin,hl=positive(body.length,DEFAULT_DRIVING.length)/2+margin;
  return {x:body.x,z:body.z,hw,hl,right:{x:c,z:-s},forward:{x:s,z:c},ex:Math.abs(c)*hw+Math.abs(s)*hl,ez:Math.abs(s)*hw+Math.abs(c)*hl};
}
function vertices(r:Rectangle):Point[] {
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:r.x+u*r.hw*r.right.x+v*r.hl*r.forward.x,z:r.z+u*r.hw*r.right.z+v*r.hl*r.forward.z}));
}
function rectanglesOverlap(a:Rectangle,b:Rectangle) {
  const dx=b.x-a.x,dz=b.z-a.z;
  if(Math.abs(dx)>a.ex+b.ex||Math.abs(dz)>a.ez+b.ez)return false;
  for(const axis of [a.right,a.forward,b.right,b.forward]){
    const reach=(r:Rectangle)=>r.hw*Math.abs(axis.x*r.right.x+axis.z*r.right.z)+r.hl*Math.abs(axis.x*r.forward.x+axis.z*r.forward.z);
    if(Math.abs(dx*axis.x+dz*axis.z)>reach(a)+reach(b)+EPS)return false;
  }
  return true;
}
function segmentDistanceSquared(a:Point,b:Point) {
  const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz;
  const t=d>EPS?clamp(-(a.x*dx+a.z*dz)/d,0,1):0;
  return (a.x+dx*t)**2+(a.z+dz*t)**2;
}
/** Scale the ellipse to a unit circle; test the full transformed rectangle, not its centre. */
function rectangleEllipseOverlap(r:Rectangle,o:StaticObstacle) {
  const rx=Math.max(EPS,o.rx),rz=Math.max(EPS,o.rz);
  const c=Math.cos(o.yaw??0),s=Math.sin(o.yaw??0);
  const polygon=vertices(r).map(p=>{const dx=p.x-o.x,dz=p.z-o.z;return {x:(dx*c-dz*s)/rx,z:(dx*s+dz*c)/rz};});
  let positiveCross=false,negativeCross=false;
  for(let i=0;i<4;i++){
    const a=polygon[i],b=polygon[(i+1)%4],cross=a.x*b.z-a.z*b.x;
    if(cross>EPS)positiveCross=true;if(cross<-EPS)negativeCross=true;
    if(segmentDistanceSquared(a,b)<=1+EPS)return true;
  }
  // Ellipse centre inside the car is an intersection even when all four edges are outside.
  return !(positiveCross&&negativeCross);
}
function collisionForRectangle(r:Rectangle,environment:DrivingEnvironment,ignoreId?:string|number):VehicleCollision|undefined {
  const edge=positive(environment.worldEdge,145);
  if(![r.x,r.z,r.ex,r.ez].every(Number.isFinite)||Math.abs(r.x)+r.ex>edge||Math.abs(r.z)+r.ez>edge)return {kind:'world-edge'};
  for(let i=0;i<environment.obstacles.length;i++){
    const o=environment.obstacles[i];
    const other=rectangle({x:o.x,z:o.z,yaw:o.yaw??0,width:o.rx*2,length:o.rz*2});
    if(Math.abs(r.x-o.x)>r.ex+other.ex||Math.abs(r.z-o.z)>r.ez+other.ez)continue;
    const hit=o.shape==='box'
      ? rectanglesOverlap(r,other)
      : rectangleEllipseOverlap(r,o);
    if(hit)return {kind:'obstacle',index:i};
  }
  const cars=environment.vehicles??[];
  for(let i=0;i<cars.length;i++){
    const other=cars[i];if(ignoreId!==undefined&&other.id===ignoreId)continue;
    if(rectanglesOverlap(r,rectangle(other)))return {kind:'vehicle',index:i,id:other.id};
  }
  return undefined;
}
/** Static boxes/ellipses, oriented other cars, and the complete car footprint at the island edge. */
export function vehicleCollision(body:VehicleBody,environment:DrivingEnvironment,margin=0):VehicleCollision|undefined {
  return collisionForRectangle(rectangle(body,Math.max(0,margin)),environment,environment.ignoreVehicleId??body.id);
}
export function createDrivingState(position:{x:number;z:number;yaw:number;speed?:number;steer?:number;lateralSpeed?:number;yawRate?:number;drift?:number;boostBlend?:number}):DrivingState {
  const state:DrivingState={x:finite(position.x),z:finite(position.z),yaw:angle(finite(position.yaw)),speed:clamp(finite(position.speed??0),-4,24),steer:clamp(finite(position.steer??0),-.56,.56)};
  if(position.lateralSpeed!==undefined)state.lateralSpeed=clamp(finite(position.lateralSpeed),-30,30);
  if(position.yawRate!==undefined)state.yawRate=clamp(finite(position.yawRate),-4,4);
  if(position.drift!==undefined)state.drift=amount(position.drift);
  if(position.boostBlend!==undefined)state.boostBlend=amount(position.boostBlend);
  return state;
}
function configWith(overrides:Partial<DrivingConfig>):DrivingConfig {
  const c={...DEFAULT_DRIVING};
  for(const k of Object.keys(c) as (keyof DrivingConfig)[]){
    const v=overrides[k];if(v!==undefined&&Number.isFinite(v)&&v>=0)c[k]=v;
  }
  c.length=Math.max(.1,c.length);c.width=Math.max(.1,c.width);c.wheelbase=Math.max(.1,c.wheelbase);
  c.maxSteer=clamp(c.maxSteer,0,1);return c;
}
function integrateSpeed(speed:number,throttle:number,brake:number,steer:number,dt:number,c:DrivingConfig) {
  if(brake>0)return approach(speed,0,c.braking*1.25*brake*dt);
  if(throttle*speed<-.02)return approach(speed,0,c.braking*Math.abs(throttle)*dt);
  if(throttle!==0)speed+=throttle*(throttle>0?c.acceleration:c.reverseAcceleration)*dt;
  const resistance=c.rollingResistance+c.drag*speed*speed;
  speed=approach(speed,0,resistance*dt);
  const curvature=Math.abs(Math.tan(steer))/c.wheelbase;
  const cornerLimit=curvature>EPS?Math.sqrt(c.maxLateralAcceleration/curvature):c.maxForward;
  const limit=Math.min(speed<0?c.maxReverse:c.maxForward,Math.max(2,cornerLimit));
  // Gradual corner braking avoids an instantaneous speed jump when the steering wheel turns.
  if(Math.abs(speed)>limit)speed=approach(speed,Math.sign(speed)*limit,c.braking*dt);
  // Above-cruise speed from boost is bled off by the braking ramp, never instantly clamped to 14.
  return clamp(speed,-c.maxReverse,Math.max(c.maxForward,c.boostForward));
}
function advancedPose(s:DrivingState,distance:number,c:DrivingConfig):DrivingState {
  // Looking forward along +Z, the driver's right is local -X.
  const beta=-Math.atan(.5*Math.tan(s.steer));
  const turn=-distance*Math.cos(beta)*Math.tan(s.steer)/c.wheelbase;
  const heading=s.yaw+beta+turn*.5;
  return {...s,x:s.x+distance*Math.sin(heading),z:s.z+distance*Math.cos(heading),yaw:angle(s.yaw+turn)};
}

type MotionState=DrivingState&{lateralSpeed:number;yawRate:number;drift:number;boostBlend:number};
/** World velocity from the body axes. lateralSpeed is positive toward the driver's right. */
export function drivingVelocity(state:DrivingState):Point {
  const s=Math.sin(state.yaw),c=Math.cos(state.yaw),side=finite(state.lateralSpeed??0);
  return {x:s*state.speed-c*side,z:c*state.speed+s*side};
}
function driftPose(state:MotionState,throttle:number,brake:number,handbrake:number,h:number,c:DrivingConfig){
  const velocity=drivingVelocity(state),f={x:Math.sin(state.yaw),z:Math.cos(state.yaw)},r={x:-Math.cos(state.yaw),z:Math.sin(state.yaw)};
  let vx=velocity.x,vz=velocity.z,yawRate=state.yawRate;
  if(brake>0){
    const length=Math.hypot(vx,vz),speed=approach(length,0,c.braking*1.25*brake*h),scale=length>EPS?speed/length:0;
    vx*=scale;vz*=scale;yawRate=approach(yawRate,0,8*brake*h);
    if(speed<.015){vx=0;vz=0;yawRate=0;}
  }else{
    let longitudinal=integrateSpeed(state.speed,throttle*(1-.68*handbrake),0,handbrake>0?0:state.steer,h,c);
    if(handbrake>0)longitudinal=approach(longitudinal,0,(1.7+Math.abs(state.speed)*.055)*handbrake*h);
    vx+=f.x*(longitudinal-state.speed);vz+=f.z*(longitudinal-state.speed);
    const side=vx*r.x+vz*r.z,grip=.45+10*(1-state.drift)**2;
    const correction=clamp(side*(1-Math.exp(-grip*h)),-(3+10*(1-state.drift))*h,(3+10*(1-state.drift))*h);
    vx-=r.x*correction;vz-=r.z*correction;
    let desired=-longitudinal*Math.tan(state.steer)/c.wheelbase*(1+.55*handbrake);
    desired=clamp(desired,-1.3,1.3);
    const slip=Math.abs(Math.atan2(side,Math.max(.5,Math.abs(longitudinal))));
    // Once the body is substantially sideways, further same-direction steering stops adding spin.
    // Counter-steering still acts immediately, so the driver can catch the slide.
    if(side*desired>0&&slip>.8)desired*=clamp(1-(slip-.8)/.45,0,1);
    if(Math.hypot(vx,vz)<.8)desired=0;
    yawRate=approach(yawRate,desired,(handbrake>0?4:6.5)*h);
    const length=Math.hypot(vx,vz),cap=Math.max(c.maxForward,c.boostForward);
    if(length>cap){vx*=cap/length;vz*=cap/length;}
  }
  const yaw=angle(state.yaw+(state.yawRate+yawRate)*.5*h),s=Math.sin(yaw),co=Math.cos(yaw);
  const speed=vx*s+vz*co,lateralSpeed=-vx*co+vz*s;
  return {candidate:{...state,x:state.x+vx*h,z:state.z+vz*h,yaw,speed,lateralSpeed,yawRate},velocity:{x:vx,z:vz},travel:(state.speed+speed)*.5*h};
}
function support(r:Rectangle,n:Point){
  const a=n.x*r.right.x+n.z*r.right.z,b=n.x*r.forward.x+n.z*r.forward.z;
  const sign=(v:number)=>Math.abs(v)<1e-7?0:Math.sign(v);
  return {x:r.x+r.right.x*r.hw*sign(a)+r.forward.x*r.hl*sign(b),z:r.z+r.right.z*r.hw*sign(a)+r.forward.z*r.hl*sign(b)};
}
function boxContact(a:Rectangle,b:Rectangle){
  let overlap=Infinity,normal={x:0,z:1};
  for(const axis of [a.right,a.forward,b.right,b.forward]){
    const reach=(r:Rectangle)=>r.hw*Math.abs(axis.x*r.right.x+axis.z*r.right.z)+r.hl*Math.abs(axis.x*r.forward.x+axis.z*r.forward.z);
    const distance=(a.x-b.x)*axis.x+(a.z-b.z)*axis.z,depth=reach(a)+reach(b)-Math.abs(distance);
    if(depth<overlap){overlap=depth;const sign=distance>=0?1:-1;normal={x:axis.x*sign,z:axis.z*sign};}
  }
  const p=support(a,{x:-normal.x,z:-normal.z}),q=support(b,normal);
  // Centre the manifold on the overlap of both contact faces. Averaging body centres would
  // put side contacts near the middle of a long bus, creating an incorrect torque lever arm.
  const tangent={x:-normal.z,z:normal.x};
  const interval=(r:Rectangle)=>{const centre=r.x*tangent.x+r.z*tangent.z,reach=r.hw*Math.abs(r.right.x*tangent.x+r.right.z*tangent.z)+r.hl*Math.abs(r.forward.x*tangent.x+r.forward.z*tangent.z);return {min:centre-reach,max:centre+reach};};
  const ai=interval(a),bi=interval(b),along=(Math.max(ai.min,bi.min)+Math.min(ai.max,bi.max))/2;
  const across=((p.x+q.x)*normal.x+(p.z+q.z)*normal.z)/2;
  return {normal,point:{x:normal.x*across+tangent.x*along,z:normal.z*across+tangent.z*along}};
}
/** Contact normal points from the obstacle/other vehicle towards this car. */
export function drivingCollisionImpact(body:VehicleBody,collision:VehicleCollision,environment:DrivingEnvironment,velocity:Point,yawRate=0):DrivingImpact {
  const r=rectangle(body);let normal={x:0,z:0},point={x:r.x,z:r.z};
  if(collision.kind==='world-edge'){
    const edge=positive(environment.worldEdge,145),xDepth=Math.abs(r.x)+r.ex-edge,zDepth=Math.abs(r.z)+r.ez-edge;
    normal=xDepth>zDepth?{x:r.x>0?-1:1,z:0}:{x:0,z:r.z>0?-1:1};
    point=support(r,{x:-normal.x,z:-normal.z});point={x:clamp(point.x,-edge,edge),z:clamp(point.z,-edge,edge)};
  }else if(collision.kind==='vehicle'){
    const other=environment.vehicles?.[collision.index];
    if(other)({normal,point}=boxContact(r,rectangle(other)));
  }else{
    const o=environment.obstacles[collision.index];
    if(o?.shape==='box')({normal,point}=boxContact(r,rectangle({x:o.x,z:o.z,yaw:o.yaw??0,width:o.rx*2,length:o.rz*2})));
    else if(o){
      const c=Math.cos(o.yaw??0),s=Math.sin(o.yaw??0),rx=Math.max(EPS,o.rx),rz=Math.max(EPS,o.rz);
      const dx=body.x-o.x,dz=body.z-o.z,u=dx*c-dz*s,v=dx*s+dz*c;
      let nx=u/(rx*rx),nz=v/(rz*rz),length=Math.hypot(nx,nz);if(length<EPS){nx=1;nz=0;length=1;}
      nx/=length;nz/=length;const den=Math.hypot(rx*nx,rz*nz),px=rx*rx*nx/den,pz=rz*rz*nz/den;
      normal={x:nx*c+nz*s,z:-nx*s+nz*c};point={x:o.x+px*c+pz*s,z:o.z-px*s+pz*c};
    }
  }
  if(Math.hypot(normal.x,normal.z)<EPS){const d=Math.hypot(velocity.x,velocity.z)||1;normal={x:-velocity.x/d,z:-velocity.z/d};}
  return {velocity:{...velocity},point,normal,speed:Math.max(0,-velocity.x*normal.x-velocity.z*normal.z),yawRate};
}

/**
 * Positive throttle drives; negative throttle first brakes, then reverses. Positive steer turns right.
 * A centre-of-mass bicycle model preserves reverse steering and a finite turning radius.
 * State is immutable. travel is signed accepted movement for wheel roll. dt is capped at .25s.
 */
export function stepDriving(state:DrivingState,input:DrivingInput,dt:number,environment:DrivingEnvironment,overrides:Partial<DrivingConfig>={}):DrivingResult {
  const c=configWith(overrides),duration=clamp(finite(dt),0,.25);
  const extended=input.boost!==undefined||input.handbrake!==undefined||['lateralSpeed','yawRate','drift','boostBlend'].some(k=>k in state);
  let next:MotionState={x:finite(state.x),z:finite(state.z),yaw:angle(finite(state.yaw)),speed:clamp(finite(state.speed),-c.maxReverse,Math.max(c.maxForward,c.boostForward)),steer:clamp(finite(state.steer),-c.maxSteer,c.maxSteer),lateralSpeed:clamp(finite(state.lateralSpeed??0),-30,30),yawRate:clamp(finite(state.yawRate??0),-4,4),drift:amount(state.drift),boostBlend:amount(state.boostBlend)};
  const throttle=clamp(finite(input.throttle),-1,1),targetSteer=clamp(finite(input.steer),-1,1)*c.maxSteer,brake=clamp(finite(input.brake??0),0,1);
  const handbrake=amount(input.handbrake),boost=brake>0||throttle<=0?0:amount(input.boost);
  let travel=0,collision:VehicleCollision|undefined,impact:DrivingImpact|undefined;
  // Time and distance bounds cover both fast straight movement and rotation beside a thin wall.
  const drifting=handbrake>0||next.drift>0||Math.abs(next.lateralSpeed)>.001||Math.abs(next.yawRate)>.001;
  const speedBound=Math.max(c.maxForward,c.maxReverse,(boost>0||next.boostBlend>0)?c.boostForward:0,Math.hypot(next.speed,next.lateralSpeed));
  const bound=speedBound+(drifting?Math.max(1.3,Math.abs(next.yawRate))*Math.hypot(c.length,c.width)/2:0);
  const steps=Math.max(1,Math.ceil(duration*120),Math.ceil(duration*bound/(drifting?.06:.10)));
  const h=duration/steps;
  for(let i=0;i<steps;i++){
    next.steer=approach(next.steer,targetSteer,c.steeringRate*h);
    next.boostBlend=approach(next.boostBlend,boost,(boost>next.boostBlend?3:.45)*h);
    const effective={...c,maxForward:c.maxForward+Math.max(0,c.boostForward-c.maxForward)*next.boostBlend,acceleration:c.acceleration+Math.max(0,c.boostAcceleration-c.acceleration)*next.boostBlend};
    const rearLock=brake>0?0:handbrake*(Math.abs(next.speed)>3?1:0);
    next.drift=approach(next.drift,rearLock,(rearLock>next.drift?5:brake>0?4:1.4)*h);
    const slide=next.drift>.001||Math.abs(next.lateralSpeed)>.035||Math.abs(next.yawRate)>.025;
    let candidate:MotionState,velocity:Point,distance:number;
    if(slide){const result=driftPose(next,throttle,brake,handbrake,h,effective);candidate=result.candidate;velocity=result.velocity;distance=result.travel;}
    else{
      next.lateralSpeed=0;next.yawRate=0;next.drift=0;
      const before=next.speed;
      next.speed=integrateSpeed(next.speed,throttle,Math.max(brake,handbrake*.75),next.steer,h,effective);
      distance=(before+next.speed)*.5*h;
      candidate=advancedPose(next,distance,c) as MotionState;
      velocity=h>0?{x:(candidate.x-next.x)/h,z:(candidate.z-next.z)/h}:{x:0,z:0};
    }
    if(Math.hypot(candidate.x-next.x,candidate.z-next.z)<EPS&&Math.abs(angle(candidate.yaw-next.yaw))<EPS){next=candidate;continue;}
    const hit=vehicleCollision({...candidate,length:c.length,width:c.width},environment,c.collisionMargin);
    if(!hit){next=candidate;travel+=distance;continue;}
    collision=hit;
    impact=drivingCollisionImpact({...candidate,length:c.length,width:c.width},hit,environment,velocity,h>0?angle(candidate.yaw-next.yaw)/h:0);
    // Stop at the last clear fraction, rather than snapping a full substep away from contact.
    let lo=0,hi=1;
    if(!vehicleCollision({...next,length:c.length,width:c.width},environment,c.collisionMargin))for(let k=0;k<10;k++){
      const mid=(lo+hi)/2,p={...next,x:next.x+(candidate.x-next.x)*mid,z:next.z+(candidate.z-next.z)*mid,yaw:angle(next.yaw+angle(candidate.yaw-next.yaw)*mid)};
      if(vehicleCollision({...p,length:c.length,width:c.width},environment,c.collisionMargin))hi=mid;else lo=mid;
    }
    if(lo>0){next={...next,x:next.x+(candidate.x-next.x)*lo,z:next.z+(candidate.z-next.z)*lo,yaw:angle(next.yaw+angle(candidate.yaw-next.yaw)*lo)};travel+=distance*lo;}
    next.speed=0;next.lateralSpeed=0;next.yawRate=0;next.drift=0;
    // Steering still responds while stopped at the obstacle; no collision impulse or wall sliding.
    next.steer=approach(next.steer,targetSteer,c.steeringRate*h*(steps-i-1));break;
  }
  const output:DrivingState=extended?next:{x:next.x,z:next.z,yaw:next.yaw,speed:next.speed,steer:next.steer};
  return {state:output,travel,collided:collision!==undefined,...(collision?{collision,impact}:{})};
}

function localPoint(car:VehicleBody,u:number,v:number):Point {
  const s=Math.sin(car.yaw),c=Math.cos(car.yaw);return {x:car.x+u*c+v*s,z:car.z-u*s+v*c};
}
/**
 * Find a clear pedestrian square outside a side door and check the short path from that door.
 * This conservatively encloses the circular .34m walking collider. Return undefined if boxed in.
 * Result yaw uses +Z forward like cars; the existing Three camera requires yaw + Math.PI.
 */
export function findSafeExit(car:VehicleBody,environment:DrivingEnvironment,options:{side?:'left'|'right';radius?:number}={}):ExitPosition|undefined {
  const radius=positive(options.radius,.34),width=positive(car.width,DEFAULT_DRIVING.width),length=positive(car.length,DEFAULT_DRIVING.length);
  const preferred=options.side??'left',sides:('left'|'right')[]=preferred==='left'?['left','right']:['right','left'];
  const ignore=environment.ignoreVehicleId??car.id;
  const clear=(p:Point)=>!collisionForRectangle(rectangle({...p,yaw:0,width:radius*2,length:radius*2}),environment,ignore);
  for(const side of sides){
    const sign=side==='left'?1:-1,doorU=sign*(width/2+radius+.075);
    // Front seat first; rear door is a fallback when the front door is obstructed.
    for(const v of [.38,-.66,1.05,-1.2].filter(v=>Math.abs(v)<length/2-.25)){
      const door=localPoint(car,doorU,v);if(!clear(door))continue;
      for(const extra of [.16,.4,.7,1]){
        const p=localPoint(car,doorU+sign*extra,v);if(!clear(p))continue;
        const n=Math.max(2,Math.ceil(extra/.10));let valid=true;
        for(let i=1;i<=n;i++)if(!clear({x:door.x+(p.x-door.x)*i/n,z:door.z+(p.z-door.z)*i/n})){valid=false;break;}
        if(valid)return {...p,yaw:angle(car.yaw),side};
      }
    }
  }
  return undefined;
}
