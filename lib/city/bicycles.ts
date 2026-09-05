import * as THREE from 'three';
import { buildBicycle, applyBicyclePose, type BicycleModel } from './bicycle.ts';
import { createBikeState, stepBike, BIKE_MOTION, type BikeInput, type BikeState } from './bicycle-motion.ts';
import { findSafeExit, vehicleCollision } from './driving.ts';
import { groundHeight, isWalkable, type Obstacle } from './movement.ts';
import type { VehiclePose } from './traffic';

export type Bike={id:string;state:BikeState;model:BicycleModel;obstacle:Obstacle;matrix:THREE.Matrix4};
export class Bicycles{
  bikes:Bike[]=[];controlled?:Bike;
  private obstacles:Obstacle[];
  constructor(scene:THREE.Scene,obstacles:Obstacle[]){
    this.obstacles=obstacles;
    const places=[...Array.from({length:6},(_,i)=>[-126+i*1.8,121]),[23.5,-81.8],[24.3,-85.8],[23,114],[137.5,110]];
    places.forEach(([x,z],i)=>{
      let pose={x,z,yaw:0,length:BIKE_MOTION.length,width:BIKE_MOTION.width};
      if(vehicleCollision(pose,{obstacles},.025)){
        let found=false;for(let r=.5;r<7&&!found;r+=.5)for(let k=0;k<24;k++){const p={...pose,x:x+Math.sin(k/24*Math.PI*2)*r,z:z+Math.cos(k/24*Math.PI*2)*r};if(!vehicleCollision(p,{obstacles},.025)){pose=p;found=true;break;}}
        if(!found)return;
      }
      const model=buildBicycle({color:['#44696a','#a5a193','#745e50','#3a4957'][i%4],basket:i%3===0}),obstacle:Obstacle={x:pose.x,z:pose.z,rx:.32,rz:.975,yaw:0,shape:'box',height:1.3};
      const bike={id:'bicycle-'+i,state:createBikeState(pose),model,obstacle,matrix:new THREE.Matrix4()};this.bikes.push(bike);obstacles.push(obstacle);scene.add(model.root);
    });this.update({x:18,z:116},true);
  }
  get obstaclesSet(){return new Set(this.bikes.map(b=>b.obstacle));}
  private environment(bike:Bike){return {obstacles:this.obstacles.filter(o=>o!==bike.obstacle)};}
  nearest(p:{x:number;z:number}){
    return this.bikes.filter(b=>{const d=Math.hypot(p.x-b.state.x,p.z-b.state.z);if(d>2.7)return false;const env=this.environment(b);for(let t=.2;t<d-.55;t+=.2)if(!isWalkable(p.x+(b.state.x-p.x)*t/d,p.z+(b.state.z-p.z)*t/d,env.obstacles,.23))return false;return true;}).sort((a,b)=>Math.hypot(a.state.x-p.x,a.state.z-p.z)-Math.hypot(b.state.x-p.x,b.state.z-p.z))[0];
  }
  takeControl(bike:Bike){this.controlled=bike;}
  release(){if(this.controlled){this.controlled.state.speed=0;this.controlled.state.lean=0;this.controlled.state.cadence=0;}this.controlled=undefined;}
  exitPosition(){const b=this.controlled;return b?findSafeExit({...b.state,id:b.id,length:1.95,width:.64},this.environment(b)):undefined;}
  drive(dt:number,input:BikeInput){const b=this.controlled;if(!b)return false;const env=this.environment(b);const result=stepBike(b.state,input,dt,{blocked:pose=>!!vehicleCollision(pose,env,.025)});b.state=result.state;return result.collided;}
  poses():VehiclePose[]{return this.bikes.map(b=>({id:b.id,...b.state,length:1.95,width:.64,height:1.75,distance:0,roll:b.state.wheelRoll}));}
  stopBeforeImpact(p:VehiclePose){const b=this.bikes.find(b=>b.id===p.id);if(b){Object.assign(b.state,{x:p.x,z:p.z,yaw:p.yaw,steer:p.steer,wheelRoll:p.roll,speed:0,cadence:0,lean:0});}}
  update(player:{x:number;z:number},aerial=false){
    for(const b of this.bikes){const s=b.state;b.model.root.position.set(s.x,groundHeight(s.x,s.z),s.z);b.model.root.rotation.y=s.yaw;b.model.root.visible=b===this.controlled||aerial||Math.hypot(s.x-player.x,s.z-player.z)<100;applyBicyclePose(b.model,s);b.model.root.updateMatrixWorld(true);b.matrix.copy(b.model.leanRoot.matrixWorld);Object.assign(b.obstacle,{x:s.x,z:s.z,yaw:s.yaw});}
  }
}
