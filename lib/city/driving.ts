/** Pure, deterministic vehicle motion. Coordinates: metres, seconds, +Z forward at yaw=0. */
export type StaticObstacle = { x:number; z:number; rx:number; rz:number; shape?:'ellipse'|'box'; height?:number };
export type VehicleBody = { id?:string|number; x:number; z:number; yaw:number; length?:number; width?:number };
export type DrivingState = { x:number; z:number; yaw:number; speed:number; steer:number };
export type DrivingInput = { throttle:number; steer:number; brake?:number };
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
};
export const DEFAULT_DRIVING:Readonly<DrivingConfig> = Object.freeze({
  length:4.9,width:2.2,wheelbase:2.8,maxForward:14,maxReverse:4,
  acceleration:4.8,reverseAcceleration:3,braking:8.5,rollingResistance:.55,drag:.012,
  maxSteer:.56,steeringRate:1.9,maxLateralAcceleration:4.8,collisionMargin:.045,
});
export type VehicleCollision = {kind:'world-edge'} | {kind:'obstacle';index:number} | {kind:'vehicle';index:number;id?:string|number};
export type DrivingResult = {state:DrivingState;travel:number;collided:boolean;collision?:VehicleCollision};
export type ExitPosition = {x:number;z:number;yaw:number;side:'left'|'right'};

const EPS=1e-8;
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const finite=(x:number,fallback=0)=>Number.isFinite(x)?x:fallback;
const positive=(x:number|undefined,fallback:number)=>x!==undefined&&Number.isFinite(x)&&x>0?x:fallback;
const angle=(x:number)=>x>=-Math.PI&&x<=Math.PI?x:Math.atan2(Math.sin(x),Math.cos(x));
const approach=(x:number,target:number,step:number)=>x<target?Math.min(target,x+step):Math.max(target,x-step);
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
  if(Math.abs(r.x-o.x)>r.ex+rx||Math.abs(r.z-o.z)>r.ez+rz)return false;
  const polygon=vertices(r).map(p=>({x:(p.x-o.x)/rx,z:(p.z-o.z)/rz}));
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
    if(Math.abs(r.x-o.x)>r.ex+o.rx||Math.abs(r.z-o.z)>r.ez+o.rz)continue;
    const hit=o.shape==='box'
      ? rectanglesOverlap(r,{x:o.x,z:o.z,hw:o.rx,hl:o.rz,right:{x:1,z:0},forward:{x:0,z:1},ex:o.rx,ez:o.rz})
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
export function createDrivingState(position:{x:number;z:number;yaw:number;speed?:number;steer?:number}):DrivingState {
  return {x:finite(position.x),z:finite(position.z),yaw:angle(finite(position.yaw)),speed:clamp(finite(position.speed??0),-4,14),steer:clamp(finite(position.steer??0),-.56,.56)};
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
  return clamp(speed,-c.maxReverse,c.maxForward);
}
function advancedPose(s:DrivingState,distance:number,c:DrivingConfig):DrivingState {
  // Looking forward along +Z, the driver's right is local -X.
  const beta=-Math.atan(.5*Math.tan(s.steer));
  const turn=-distance*Math.cos(beta)*Math.tan(s.steer)/c.wheelbase;
  const heading=s.yaw+beta+turn*.5;
  return {...s,x:s.x+distance*Math.sin(heading),z:s.z+distance*Math.cos(heading),yaw:angle(s.yaw+turn)};
}

/**
 * Positive throttle drives; negative throttle first brakes, then reverses. Positive steer turns right.
 * A centre-of-mass bicycle model preserves reverse steering and a finite turning radius.
 * State is immutable. travel is signed accepted movement for wheel roll. dt is capped at .25s.
 */
export function stepDriving(state:DrivingState,input:DrivingInput,dt:number,environment:DrivingEnvironment,overrides:Partial<DrivingConfig>={}):DrivingResult {
  const c=configWith(overrides),duration=clamp(finite(dt),0,.25);
  let next={x:finite(state.x),z:finite(state.z),yaw:angle(finite(state.yaw)),speed:clamp(finite(state.speed),-c.maxReverse,c.maxForward),steer:clamp(finite(state.steer),-c.maxSteer,c.maxSteer)};
  const throttle=clamp(finite(input.throttle),-1,1),targetSteer=clamp(finite(input.steer),-1,1)*c.maxSteer,brake=clamp(finite(input.brake??0),0,1);
  let travel=0,collision:VehicleCollision|undefined;
  // Time and distance bounds cover both fast straight movement and rotation beside a thin wall.
  const steps=Math.max(1,Math.ceil(duration*120),Math.ceil(duration*Math.max(c.maxForward,c.maxReverse)/.10));
  const h=duration/steps;
  for(let i=0;i<steps;i++){
    next.steer=approach(next.steer,targetSteer,c.steeringRate*h);
    const before=next.speed;
    next.speed=integrateSpeed(next.speed,throttle,brake,next.steer,h,c);
    const distance=(before+next.speed)*.5*h;
    if(Math.abs(distance)<EPS)continue;
    const candidate=advancedPose(next,distance,c);
    const hit=vehicleCollision({...candidate,length:c.length,width:c.width},environment,c.collisionMargin);
    if(!hit){next=candidate;travel+=distance;continue;}
    collision=hit;
    // Stop at the last clear fraction, rather than snapping a full substep away from contact.
    let lo=0,hi=1;
    if(!vehicleCollision({...next,length:c.length,width:c.width},environment,c.collisionMargin))for(let k=0;k<10;k++){
      const mid=(lo+hi)/2,p=advancedPose(next,distance*mid,c);
      if(vehicleCollision({...p,length:c.length,width:c.width},environment,c.collisionMargin))hi=mid;else lo=mid;
    }
    if(lo>0){next=advancedPose(next,distance*lo,c);travel+=distance*lo;}
    next.speed=0;
    // Steering still responds while stopped at the obstacle; no collision impulse or wall sliding.
    next.steer=approach(next.steer,targetSteer,c.steeringRate*h*(steps-i-1));break;
  }
  return {state:next,travel,collided:collision!==undefined,...(collision?{collision}:{})};
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
