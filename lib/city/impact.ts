/** Vehicle/person contacts and recovery. Pure metres/seconds, yaw=0 faces +Z. */
export type ImpactPoint={x:number;z:number};
export type ImpactVehicle=ImpactPoint&{id?:string|number;yaw:number;width?:number;length?:number;height?:number};
export type ImpactPerson=ImpactPoint&{radius?:number;height?:number;elevation?:number};
export type ImpactObstacle=ImpactPoint&{rx:number;rz:number;shape?:'box'|'ellipse';yaw?:number;height?:number};
export type ImpactEnvironment={obstacles:readonly ImpactObstacle[];vehicles?:readonly ImpactVehicle[];ignoreObstacles?:readonly ImpactObstacle[];worldEdge?:number};
export type ImpactContact={normal:ImpactPoint;point:ImpactPoint;speed:number;vehicleSpeed:number;time:number;knockback:{x:number;z:number;y:number}};
export type ImpactPhase='none'|'pushed'|'airborne'|'down'|'recover';
export type ImpactState=ImpactPoint&{phase:ImpactPhase;height:number;vx:number;vz:number;vy:number;time:number;tilt:number;yaw:number;cooldown:number;radius:number;airDuration:number};
export const IMPACT_TIMING={gravity:12,down:1.15,recover:.95,cooldown:.9,lowSpeed:2.6} as const;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const finite=(v:number,fallback=0)=>Number.isFinite(v)?v:fallback;
const positive=(v:number|undefined,fallback:number)=>v!==undefined&&Number.isFinite(v)&&v>0?v:fallback;
const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};
const size=(v:ImpactVehicle)=>({w:positive(v.width,2.2)/2,l:positive(v.length,4.9)/2});
const local=(p:ImpactPoint,v:ImpactVehicle)=>{const dx=p.x-v.x,dz=p.z-v.z,c=Math.cos(v.yaw),s=Math.sin(v.yaw);return {x:dx*c-dz*s,z:dx*s+dz*c};};
const world=(p:ImpactPoint,v:ImpactVehicle)=>{const c=Math.cos(v.yaw),s=Math.sin(v.yaw);return {x:v.x+p.x*c+p.z*s,z:v.z-p.x*s+p.z*c};};

/** Exact signed distance between a circular person's horizontal footprint and an oriented car. */
export function personVehicleDistance(person:ImpactPerson,vehicle:ImpactVehicle){
  const p=local(person,vehicle),{w,l}=size(vehicle),qx=Math.abs(p.x)-w,qz=Math.abs(p.z)-l;
  return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-positive(person.radius,.34);
}
function surface(person:ImpactPerson,vehicle:ImpactVehicle){
  const p=local(person,vehicle),{w,l}=size(vehicle),q={x:clamp(p.x,-w,w),z:clamp(p.z,-l,l)};
  let dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz);
  if(d<1e-9){
    if(w-Math.abs(p.x)<l-Math.abs(p.z)){dx=p.x>=0?1:-1;dz=0;q.x=dx*w;}
    else{dx=0;dz=p.z>=0?1:-1;q.z=dz*l;}
    d=1;
  }
  const c=Math.cos(vehicle.yaw),s=Math.sin(vehicle.yaw);
  return {normal:{x:(dx*c+dz*s)/d,z:(-dx*s+dz*c)/d},point:world(q,vehicle)};
}
function lerpVehicle(a:ImpactVehicle,b:ImpactVehicle,t:number):ImpactVehicle {
  return {...b,x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+wrap(b.yaw-a.yaw)*t};
}

/**
 * Continuous conservative advancement of an OBB against a person cylinder. Translation and
 * angular travel both bound the signed-distance change, so high speed cannot skip a small person.
 */
export function sweepVehicleImpact(previous:ImpactVehicle,current:ImpactVehicle,person:ImpactPerson,dt:number):ImpactContact|undefined {
  if(![previous.x,previous.z,previous.yaw,current.x,current.z,current.yaw,person.x,person.z].every(Number.isFinite))return;
  if(finite(person.elevation??0)>Math.max(positive(previous.height,1.7),positive(current.height,1.7))+.03)return;
  const dx=current.x-previous.x,dz=current.z-previous.z,rotation=wrap(current.yaw-previous.yaw),{w,l}=size(current);
  const bound=Math.hypot(dx,dz)+Math.abs(rotation)*Math.hypot(w,l),seconds=Math.max(1e-6,finite(dt));
  let t=0,pose=previous;
  for(let iteration=0;iteration<256;iteration++){
    pose=lerpVehicle(previous,current,t);const d=personVehicleDistance(person,pose);
    if(d<=.0005){
      const hit=surface(person,pose),rx=hit.point.x-pose.x,rz=hit.point.z-pose.z;
      const velocity={x:dx/seconds+rotation/seconds*rz,z:dz/seconds-rotation/seconds*rx};
      const vehicleSpeed=Math.min(45,Math.hypot(velocity.x,velocity.z));
      const speed=Math.min(35,Math.max(0,velocity.x*hit.normal.x+velocity.z*hit.normal.z));
      const fast=speed>IMPACT_TIMING.lowSpeed;
      const outward=fast?Math.min(12,1.2+speed*.73):Math.min(1.8,.25+speed*.62);
      const tangent={x:velocity.x-hit.normal.x*speed,z:velocity.z-hit.normal.z*speed};
      const tangentScale=fast?.10:.025;
      return {...hit,speed,vehicleSpeed,time:t,knockback:{x:hit.normal.x*outward+tangent.x*tangentScale,z:hit.normal.z*outward+tangent.z*tangentScale,y:fast?Math.min(6.2,1.65+(speed-IMPACT_TIMING.lowSpeed)*.31):0}};
    }
    if(t>=1||bound<1e-10)return;
    const step=d/bound*.85;
    // d/bound is a guaranteed clear fraction; a root cannot occur before that interval ends.
    if(t+step>1)return;
    t+=Math.max(step,1e-9);
  }
  return;
}

function obstacleDistance(p:ImpactPoint,o:ImpactObstacle){
  const yaw=o.yaw??0,dx=p.x-o.x,dz=p.z-o.z,c=Math.cos(yaw),s=Math.sin(yaw),x=Math.abs(dx*c-dz*s),z=Math.abs(dx*s+dz*c);
  const a=Math.max(.000001,o.rx),b=Math.max(.000001,o.rz);
  if(o.shape==='box'){const qx=x-a,qz=z-b;return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0);}
  if((x/a)**2+(z/b)**2<=1)return -Math.min(a,b);
  // Closest point on an ellipse: monotone Lagrange-multiplier solve, only after a broad phase.
  let lo=0,hi=Math.max(a,b)*Math.hypot(x,z);
  for(let i=0;i<27;i++){const m=(lo+hi)/2,f=(a*x/(m+a*a))**2+(b*z/(m+b*b))**2;if(f>1)lo=m;else hi=m;}
  return Math.hypot(x-a*a*x/(hi+a*a),z-b*b*z/(hi+b*b));
}
const sameVehicle=(a:ImpactVehicle,b:ImpactVehicle)=>a===b||(a.id!==undefined&&a.id===b.id)||(a.id===undefined&&b.id===undefined&&a.x===b.x&&a.z===b.z&&a.yaw===b.yaw);
export function impactPositionFree(p:ImpactPoint,environment:ImpactEnvironment,radius=.34,ignoreVehicle?:ImpactVehicle){
  const edge=positive(environment.worldEdge,145);
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)+radius>edge||Math.abs(p.z)+radius>edge)return false;
  for(const o of environment.obstacles){
    if(environment.ignoreObstacles?.includes(o))continue;
    const reach=Math.hypot(o.rx,o.rz)+radius;
    if(Math.abs(p.x-o.x)>reach||Math.abs(p.z-o.z)>reach)continue;
    if(obstacleDistance(p,o)<radius-.00001)return false;
  }
  for(const v of environment.vehicles??[])if(!(ignoreVehicle&&sameVehicle(v,ignoreVehicle))&&personVehicleDistance({...p,radius},v)<-.00001)return false;
  return true;
}
function clearPath(a:ImpactPoint,b:ImpactPoint,environment:ImpactEnvironment,radius:number,ignoreVehicle?:ImpactVehicle){
  const steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.09));
  for(let i=1;i<=steps;i++)if(!impactPositionFree({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps},environment,radius,ignoreVehicle))return false;
  return true;
}

/** Immediately leave an intersecting car by the closest reachable side, never across a wall. */
export function separateFromVehicle(person:ImpactPerson,vehicle:ImpactVehicle,environment:ImpactEnvironment):ImpactPoint|undefined {
  if(personVehicleDistance(person,vehicle)>=.015)return {x:person.x,z:person.z};
  const radius=positive(person.radius,.34),p=local(person,vehicle),{w,l}=size(vehicle),gap=radius+.035;
  const candidates:ImpactPoint[]=[];
  for(const extra of [0,.3,.65,1.1])for(const sign of [-1,1]){
    for(const z of [clamp(p.z,-l,l),0,-l*.7,l*.7])candidates.push(world({x:sign*(w+gap+extra),z},vehicle));
    for(const x of [clamp(p.x,-w,w),0,-w*.7,w*.7])candidates.push(world({x,z:sign*(l+gap+extra)},vehicle));
  }
  candidates.sort((a,b)=>Math.hypot(a.x-person.x,a.z-person.z)-Math.hypot(b.x-person.x,b.z-person.z));
  for(const candidate of candidates){
    if(personVehicleDistance({...candidate,radius},vehicle)<.02||!impactPositionFree(candidate,environment,radius,vehicle))continue;
    if(clearPath(person,candidate,environment,radius,vehicle))return candidate;
  }
  return;
}

export function createImpactState(position:ImpactPerson):ImpactState {
  return {x:finite(position.x),z:finite(position.z),phase:'none',height:Math.max(0,finite(position.elevation??0)),vx:0,vz:0,vy:0,time:0,tilt:0,yaw:0,cooldown:0,radius:positive(position.radius,.34),airDuration:0};
}
/** Cooldown suppresses new impulses only; depenetration always happens, even at zero car speed. */
export function applyVehicleImpact(state:ImpactState,contact:ImpactContact,vehicle:ImpactVehicle,environment:ImpactEnvironment){
  const separated=separateFromVehicle({...state,elevation:state.height},vehicle,environment);
  if(!separated)return {state:{...state},applied:false,separated:false,blocked:true};
  const next={...state,x:separated.x,z:separated.z};
  if(next.cooldown>0)return {state:next,applied:false,separated:true,blocked:false};
  const k=contact.knockback;next.phase=k.y>0?'airborne':'pushed';next.vx=k.x;next.vz=k.z;next.vy=k.y;
  next.airDuration=k.y>0?(k.y+Math.sqrt(k.y*k.y+2*IMPACT_TIMING.gravity*next.height))/IMPACT_TIMING.gravity:0;
  next.time=0;next.cooldown=IMPACT_TIMING.cooldown;next.yaw=wrap(Math.atan2(k.x,k.z)+Math.PI);
  next.tilt=k.y>0?.40:.08;
  return {state:next,applied:true,separated:true,blocked:false};
}

/** Fit the fall pose to the actual flight, including short grazing impacts. */
export function impactPoseTime(state:ImpactState){return state.phase==='airborne'?Math.min(.7,state.time/Math.max(.001,state.airDuration)*.7):state.time;}

/** Movement collides against static structures, pools, vehicle bodies and the island boundary. */
export function stepImpact(state:ImpactState,dt:number,environment:ImpactEnvironment):ImpactState {
  const next={...state},duration=clamp(finite(dt),0,.25);
  const steps=Math.max(1,Math.ceil(duration*120),Math.ceil(duration*Math.hypot(next.vx,next.vz)/.06)),h=duration/steps;
  for(let i=0;i<steps;i++){
    next.cooldown=Math.max(0,next.cooldown-h);
    // Vehicles may move onto a recovering person; never wait for the impulse cooldown to separate.
    for(const v of environment.vehicles??[]){
      if(next.height>positive(v.height,1.7)+.03||personVehicleDistance(next,v)>=.015)continue;
      const p=separateFromVehicle(next,v,environment);if(p){next.x=p.x;next.z=p.z;}
    }
    if(next.phase==='none')continue;
    next.time+=h;
    const dx=next.vx*h,dz=next.vz*h;
    if(impactPositionFree({x:next.x+dx,z:next.z},environment,next.radius))next.x+=dx;else next.vx=0;
    if(impactPositionFree({x:next.x,z:next.z+dz},environment,next.radius))next.z+=dz;else next.vz=0;
    const drag=next.phase==='airborne'?.65:next.phase==='pushed'?6:9;
    next.vx*=Math.exp(-drag*h);next.vz*=Math.exp(-drag*h);
    if(next.phase==='airborne'){
      next.height+=next.vy*h-.5*IMPACT_TIMING.gravity*h*h;next.vy-=IMPACT_TIMING.gravity*h;
      next.tilt=.40+1.08*smooth(impactPoseTime(next)/.48);
      if(next.height<=0&&next.vy<0){next.height=0;next.vy=0;next.phase='down';next.time=0;next.tilt=1.48;}
    }else if(next.phase==='pushed'){
      next.height=0;next.tilt=.08*(1-smooth(next.time/.35));
      if(next.time>=.35){next.phase='none';next.time=0;next.tilt=0;next.vx=0;next.vz=0;}
    }else if(next.phase==='down'){
      next.height=0;next.tilt=1.48;if(next.time>=IMPACT_TIMING.down){next.phase='recover';next.time=0;}
    }else if(next.phase==='recover'){
      next.height=0;next.tilt=1.48*(1-smooth(next.time/IMPACT_TIMING.recover));
      if(next.time>=IMPACT_TIMING.recover){next.phase='none';next.time=0;next.tilt=0;next.vx=0;next.vz=0;}
    }
  }
  return next;
}
