import { vehicleCollision, type VehicleBody } from './driving.ts';

export const MARINA = { spawn:{x:174.6,z:72}, yaw:-Math.PI/2, berths:[48,72,90], water:-2, edge:530 };
export const DOCK_RECTS = [
  {x:162,z:65,rx:11,rz:28},
  {x:148,z:72,rx:4.5,rz:2},
  ...MARINA.berths.map(z=>({x:174.25,z,rx:1.75,rz:.85})),
];
export function onDock(x:number,z:number,radius=0){
  const inside=(px:number,pz:number)=>DOCK_RECTS.some(r=>Math.abs(px-r.x)<=r.rx&&Math.abs(pz-r.z)<=r.rz);
  if(!inside(x,z))return false;
  // Erode the union, not individual rectangles: adjoining dock pieces must have no invisible seam.
  for(let i=0;radius>0&&i<16;i++){const a=i/16*Math.PI*2;if(!inside(x+Math.cos(a)*radius,z+Math.sin(a)*radius))return false;}
  return true;
}
export const WATER_OBSTACLES = [
  {x:0,z:0,rx:150.5,rz:150.5,shape:'box' as const},
  ...DOCK_RECTS.map(r=>({...r,shape:'box' as const})),
];
export type BoatState={x:number;z:number;yaw:number;speed:number;steer:number;vx:number;vz:number;yawRate:number};
export type BoatInput={throttle:number;steer:number;brake:boolean;boost:boolean};
export const BOAT_SIZE={length:14.8,width:4.5};
export function boatFree(state:Pick<BoatState,'x'|'z'|'yaw'>,others:VehicleBody[]=[],id?:string){
  return !vehicleCollision({...state,...BOAT_SIZE,id},{obstacles:WATER_OBSTACLES,vehicles:others,ignoreVehicleId:id,worldEdge:MARINA.edge},.06);
}
export function stepBoat(original:BoatState,input:BoatInput,dt:number,others:VehicleBody[]=[],id?:string){
  const state={...original};let collided=false;
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  const steps=Math.max(1,Math.ceil(dt/.0125));
  for(let i=0;i<steps;i++){
    const d=dt/steps,steer=Math.max(-1,Math.min(1,input.steer)),throttle=Math.max(-1,Math.min(1,input.throttle));
    state.steer+=(steer-state.steer)*(1-Math.exp(-d*3));
    const limit=input.boost?14:9,target=input.brake?0:throttle*(throttle<0?3:limit);
    state.speed+=(target-state.speed)*(1-Math.exp(-d*(input.brake?2.8:throttle? .32:.18)));
    if(Math.abs(state.speed)<.035&&target===0)state.speed=0;
    state.yawRate+=(-state.steer*.45*Math.tanh(state.speed/3.5)-state.yawRate)*(1-Math.exp(-d*2.1));
    const yaw=state.yaw+state.yawRate*d;
    state.vx+=(Math.sin(yaw)*state.speed-state.vx)*(1-Math.exp(-d*(input.brake?3.8:2.0)));
    state.vz+=(Math.cos(yaw)*state.speed-state.vz)*(1-Math.exp(-d*(input.brake?3.8:2.0)));
    const next={...state,x:state.x+state.vx*d,z:state.z+state.vz*d,yaw};
    if(boatFree(next,others,id))Object.assign(state,next);
    else{state.speed=0;state.vx=0;state.vz=0;state.yawRate=0;collided=true;break;}
  }
  return {state,collided};
}
