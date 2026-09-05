/** Planar rigid-body response. All velocities are metres/seconds; +yaw turns +Z toward +X. */
export type CrashVector={x:number;z:number};
export type CrashBody={x:number;z:number;yaw:number;length:number;width:number;mass:number;velocity:CrashVector;yawRate?:number};
export type CrashContact={point:CrashVector;normal:CrashVector};
const dot=(a:CrashVector,b:CrashVector)=>a.x*b.x+a.z*b.z;
const torque=(r:CrashVector,f:CrashVector)=>r.z*f.x-r.x*f.z;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const velocityAt=(b:CrashBody,p:CrashVector)=>({x:b.velocity.x+(b.yawRate??0)*(p.z-b.z),z:b.velocity.z-(b.yawRate??0)*(p.x-b.x)});
export function drivingVelocity(state:{yaw:number;speed:number;lateralSpeed?:number}):CrashVector{
  const s=Math.sin(state.yaw),c=Math.cos(state.yaw),side=state.lateralSpeed??0;
  return {x:s*state.speed-c*side,z:c*state.speed+s*side};
}
/** Contact normal points from the first vehicle toward the second vehicle. */
export function vehicleContact(a:CrashBody,b:CrashBody):CrashContact{
  const axes=[{x:Math.cos(a.yaw),z:-Math.sin(a.yaw)},{x:Math.sin(a.yaw),z:Math.cos(a.yaw)},{x:Math.cos(b.yaw),z:-Math.sin(b.yaw)},{x:Math.sin(b.yaw),z:Math.cos(b.yaw)}];
  const extent=(body:CrashBody,axis:CrashVector)=>Math.abs(axis.x*Math.cos(body.yaw)-axis.z*Math.sin(body.yaw))*body.width/2+Math.abs(axis.x*Math.sin(body.yaw)+axis.z*Math.cos(body.yaw))*body.length/2;
  const delta={x:b.x-a.x,z:b.z-a.z};let normal=axes[0],separation=-Infinity;
  for(const axis of axes){const d=dot(delta,axis),gap=Math.abs(d)-extent(a,axis)-extent(b,axis);if(gap>separation){separation=gap;normal={x:axis.x*(d>=0?1:-1),z:axis.z*(d>=0?1:-1)};}}
  const tangent={x:-normal.z,z:normal.x};
  const ac=dot(a,normal)+extent(a,normal),bc=dot(b,normal)-extent(b,normal);
  const alo=dot(a,tangent)-extent(a,tangent),ahi=dot(a,tangent)+extent(a,tangent),blo=dot(b,tangent)-extent(b,tangent),bhi=dot(b,tangent)+extent(b,tangent);
  const along=(ac+bc)/2,across=(Math.max(alo,blo)+Math.min(ahi,bhi))/2;
  return {normal,point:{x:normal.x*along+tangent.x*across,z:normal.z*along+tangent.z*across}};
}
export function resolveVehicleCrash(a:CrashBody,b:CrashBody,contact=vehicleContact(a,b)){
  const length=Math.hypot(contact.normal.x,contact.normal.z)||1,n={x:contact.normal.x/length,z:contact.normal.z/length},p=contact.point;
  const ra={x:p.x-a.x,z:p.z-a.z},rb={x:p.x-b.x,z:p.z-b.z};
  const ma=1/Math.max(1,a.mass),mb=1/Math.max(1,b.mass),ia=12*ma/Math.max(.1,a.length*a.length+a.width*a.width),ib=12*mb/Math.max(.1,b.length*b.length+b.width*b.width);
  const va=velocityAt(a,p),vb=velocityAt(b,p),relative={x:va.x-vb.x,z:va.z-vb.z},closing=Math.max(0,dot(relative,n));
  const ta=torque(ra,n),tb=torque(rb,n),denominator=ma+mb+ta*ta*ia+tb*tb*ib;
  const impulse=closing>1e-7?(closing<.8?1:1.18)*closing/denominator:0;
  const tangent={x:-n.z,z:n.x},fa=torque(ra,tangent),fb=torque(rb,tangent);
  const friction=clamp(dot(relative,tangent)/(ma+mb+fa*fa*ia+fb*fb*ib),-impulse*.32,impulse*.32);
  const force={x:n.x*impulse+tangent.x*friction,z:n.z*impulse+tangent.z*friction};
  const result=(body:CrashBody,m:number,i:number,r:CrashVector,sign:number)=>({velocity:{x:body.velocity.x+force.x*m*sign,z:body.velocity.z+force.z*m*sign},yawRate:clamp((body.yawRate??0)+torque(r,force)*i*sign,-1.5,1.5)});
  return {a:result(a,ma,ia,ra,-1),b:result(b,mb,ib,rb,1),closingSpeed:closing,impulse,point:p};
}
