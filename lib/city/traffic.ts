import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight, isWalkable, type Obstacle } from './movement.ts';
import { createDrivingState, stepDriving, findSafeExit, vehicleCollision, type DrivingInput, type DrivingState } from './driving.ts';
import type { TrafficSignals } from './signals';

export function createTrafficRoute(reverse=false) {
  const x=reverse?52.2:43.8,z=reverse?136.2:127.8,r=8;
  const route=new THREE.CurvePath<THREE.Vector3>();
  const v=(x:number,z:number)=>new THREE.Vector3(x,.04,z);
  const points=[[-x+r,-z],[x-r,-z],[x,-z+r],[x,z-r],[x-r,z],[-x+r,z],[-x,z-r],[-x,-z+r]];
  for(let i=0;i<8;i+=2){
    route.add(new THREE.LineCurve3(v(...points[i] as [number,number]),v(...points[i+1] as [number,number])));
    const end=(i+2)%8,corner=[[x,-z],[x,z],[-x,z],[-x,-z]][i/2];
    route.add(new THREE.QuadraticBezierCurve3(v(...points[i+1] as [number,number]),v(...corner as [number,number]),v(...points[end] as [number,number])));
  }
  return route;
}
export function brakingSpeed(speed:number,target:number,dt:number){return THREE.MathUtils.clamp(target,speed-4.5*dt,speed+1.8*dt);}
export type Vehicle={id:string;position:THREE.Vector3;yaw:number;manual?:DrivingState;model:string;distance:number;reverse:boolean;speed:number;cruise:number;paint:string;matrix:THREE.Matrix4;roll:number;steer:number;obstacle:Obstacle;parked?:THREE.Vector3};
export type VehiclePose={id:string;x:number;z:number;yaw:number;length:number;width:number;height:number;speed:number;distance:number;roll:number;steer:number};
type Batch={mesh:THREE.InstancedMesh;part:THREE.Matrix4;wheel:boolean;front:boolean;cars:Vehicle[];cockpit?:boolean};
export class Traffic {
  readonly root=new THREE.Group();
  readonly cars:Vehicle[]=[];
  private batches:Batch[]=[];
  private routes=[createTrafficRoute(false),createTrafficRoute(true)];
  private dead=false;
  private reflection?:THREE.Texture;
  private dummy=new THREE.Object3D();
  controlled?:Vehicle;
  cockpitView=false;
  private readyModels=new Set<string>();
  private obstacles:Obstacle[];
  private matrix=new THREE.Matrix4();
  constructor(scene:THREE.Scene,manager:THREE.LoadingManager,obstacles:Obstacle[],onError:()=>void) {
    this.obstacles=obstacles;
    scene.add(this.root);
    const paints=['#d2d3ce','#343c44','#455d63','#716b5c','#b0b4b6','#3b4a42'];
    for(let i=0;i<12;i++){
      const reverse=i>=6,length=this.routes[Number(reverse)].getLength();
      const obstacle:Obstacle={x:0,z:0,rx:1.1,rz:2.4,shape:'box',height:i%3===0?1.2:2.1};obstacles.push(obstacle);
      this.cars.push({id:'traffic-'+i,position:new THREE.Vector3(),yaw:0,model:i%3===0?'concept':'rover',distance:(i%6)/6*length+length*.10,reverse,speed:4.3,cruise:4.3,paint:paints[i%6],matrix:new THREE.Matrix4(),roll:0,steer:0,obstacle});
    }
    for(const [index,x,z] of [[0,57.4,89],[1,-57.4,18]]){
      const obstacle:Obstacle={x,z,rx:1.2,rz:2.5,shape:'box',height:index?2.1:1.2};obstacles.push(obstacle);
      this.cars.push({id:'parked-'+index,position:new THREE.Vector3(x,.04,z),yaw:x>0?0:Math.PI,model:index?'rover':'concept',distance:0,reverse:false,speed:0,cruise:0,paint:index?'#445a4c':'#acada8',matrix:new THREE.Matrix4(),roll:0,steer:0,obstacle,parked:new THREE.Vector3(x,.04,z)});
    }
    this.update(0,new THREE.Vector3(18,1.8,116));
    for(const kind of ['concept','rover'])new GLTFLoader(manager).load(`/assets/${kind}-traffic.glb`,gltf=>{
      if(this.dead){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
      this.batchTemplate(gltf.scene,this.cars.filter(c=>c.model===kind));this.readyModels.add(kind);
      if(kind==='rover')this.addSteeringWheels(this.cars.filter(c=>c.model===kind));
    },undefined,onError);
  }
  private batchTemplate(template:THREE.Group,cars:Vehicle[]) {
    template.updateMatrixWorld(true);
    const groups=new Map<string,{geometries:THREE.BufferGeometry[];material:THREE.Material;part:THREE.Matrix4;name:string}>();
    template.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh))return;
      let wheel:THREE.Object3D|undefined;
      for(let parent:THREE.Object3D|null=obj;parent&&parent!==template;parent=parent.parent)if(/^Wheel(Front|Rear)/.test(parent.name)||parent.name==='SteeringWheel')wheel=parent;
      const inverse=wheel?wheel.matrixWorld.clone().invert():new THREE.Matrix4();
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      const ranges=Array.isArray(obj.material)?obj.geometry.groups:[{start:0,count:obj.geometry.index?.count??obj.geometry.attributes.position.count,materialIndex:0}];
      for(const range of ranges){
        const material=materials[range.materialIndex??0];if(!material)continue;
        const g=obj.geometry.clone();
        const all=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i);
        g.setIndex(all.slice(range.start,range.start+range.count));g.clearGroups();
        for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
        if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
        g.applyMatrix4(inverse.clone().multiply(obj.matrixWorld));
        const key=(wheel?.name??'Body')+'_'+material.uuid;
        let group=groups.get(key);if(!group){group={geometries:[],material,part:wheel?.matrixWorld.clone()??new THREE.Matrix4(),name:wheel?.name??'Body'};groups.set(key,group);}group.geometries.push(g);
      }
    });
    for(const g of groups.values()) {
      const geometry=mergeGeometries(g.geometries);g.geometries.forEach(geo=>geo.dispose());if(!geometry)throw new Error('Vehicle batching failed');
      geometry.computeBoundingBox();
      const material=g.material.clone() as THREE.MeshStandardMaterial;
      if(material.name==='Paint')material.color.set('#ffffff');
      if(this.reflection&&['Paint','Glass'].includes(material.name))material.envMap=this.reflection;
      const mesh=new THREE.InstancedMesh(geometry,material,cars.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
      if(material.name==='Paint')cars.forEach((c,i)=>mesh.setColorAt(i,new THREE.Color(c.paint)));
      this.root.add(mesh);this.batches.push({mesh,part:g.part,wheel:g.name.startsWith('Wheel'),front:g.name.includes('Front'),cockpit:g.name==='SteeringWheel',cars});
    }
    template.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});
    this.writeMatrices();
  }
  private addSteeringWheels(cars:Vehicle[]) {
    const rim=new THREE.TorusGeometry(.18,.019,8,24),spoke=new THREE.BoxGeometry(.31,.018,.018);
    const hub=new THREE.CylinderGeometry(.047,.047,.04,12);hub.rotateX(Math.PI/2);
    const geometry=mergeGeometries([rim,spoke,hub])!;rim.dispose();spoke.dispose();hub.dispose();
    const material=new THREE.MeshStandardMaterial({color:'#242728',roughness:.66,metalness:.25});
    const mesh=new THREE.InstancedMesh(geometry,material,cars.length);mesh.frustumCulled=false;this.root.add(mesh);
    const part=new THREE.Matrix4().makeRotationX(.36);part.setPosition(.42,1.15,.75);
    this.batches.push({mesh,part,wheel:false,front:false,cars,cockpit:true});this.writeMatrices();
  }
  environment(ignore?:Vehicle) {
    const vehicles=new Set(this.cars.map(c=>c.obstacle));
    return {obstacles:this.obstacles.filter(o=>!vehicles.has(o)),vehicles:this.cars.map(c=>({id:c.id,x:c.position.x,z:c.position.z,yaw:c.yaw,length:4.9,width:2.2})),ignoreVehicleId:ignore?.id};
  }
  nearestVehicle(position:{x:number;z:number}) {
    let nearest:Vehicle|undefined,best=4.2;
    for(const car of this.cars){
      if(!this.readyModels.has(car.model))continue;
      const distance=Math.hypot(position.x-car.position.x,position.z-car.position.z);
      if(distance>=best)continue;
      const obstacles=this.obstacles.filter(o=>o!==car.obstacle);
      const dx=car.position.x-position.x,dz=car.position.z-position.z;
      // The last metre lies inside the vehicle body; the approach must remain clear.
      const reach=Math.max(0,distance-1.8);let clear=true;
      for(let t=.15;t<reach;t+=.15)if(!isWalkable(position.x+dx/distance*t,position.z+dz/distance*t,obstacles,.25)){clear=false;break;}
      if(clear){nearest=car;best=distance;}
    }
    return nearest;
  }
  takeControl(car:Vehicle) {
    if(this.controlled||!this.cars.includes(car)||!this.readyModels.has(car.model))return false;
    car.manual=createDrivingState({x:car.position.x,z:car.position.z,yaw:car.yaw,speed:car.speed});
    car.parked=undefined;this.controlled=car;return true;
  }
  exitPosition(){const car=this.controlled;return car?findSafeExit({id:car.id,x:car.position.x,z:car.position.z,yaw:car.yaw,length:4.9,width:2.2},this.environment(car)):undefined;}
  releaseControl() {
    const car=this.controlled;if(!car)return;
    car.speed=0;if(car.manual)car.manual.speed=0;this.controlled=undefined;
  }
  poses():VehiclePose[]{return this.cars.map(c=>({id:c.id,x:c.position.x,z:c.position.z,yaw:c.yaw,length:4.9,width:2.2,height:c.model==='concept'?1.2:2.1,speed:c.speed,distance:c.distance,roll:c.roll,steer:c.steer}));}
  stopBeforeImpact(pose:VehiclePose){
    const car=this.cars.find(c=>c.id===pose.id);if(!car)return;
    car.position.set(pose.x,groundHeight(pose.x,pose.z),pose.z);car.yaw=pose.yaw;car.distance=pose.distance;car.roll=pose.roll;car.steer=pose.steer;car.speed=0;
    if(car.manual)car.manual={...car.manual,x:pose.x,z:pose.z,yaw:pose.yaw,speed:0,steer:pose.steer};
    this.place(car);this.writeMatrices();
  }
  absorbImpact(id:string,hits:number){const car=this.cars.find(c=>c.id===id);if(!car)return;car.speed*=Math.pow(.9,hits);if(car.manual)car.manual.speed=car.speed;}
  drive(dt:number,input:DrivingInput) {
    const car=this.controlled;if(!car?.manual)return false;
    const result=stepDriving(car.manual,input,dt,this.environment(car));car.manual=result.state;
    car.speed=result.state.speed;car.steer=result.state.steer;car.yaw=result.state.yaw;
    car.position.set(result.state.x,groundHeight(result.state.x,result.state.z),result.state.z);
    car.roll+=result.travel/(car.model==='concept'?.384:.379);
    this.place(car);this.writeMatrices();return result.collided;
  }
  private place(car:Vehicle){
    this.dummy.position.copy(car.position);this.dummy.rotation.set(0,car.yaw,0);this.dummy.updateMatrix();car.matrix.copy(this.dummy.matrix);
    car.obstacle.x=car.position.x;car.obstacle.z=car.position.z;
    car.obstacle.rx=1.1;car.obstacle.rz=2.45;car.obstacle.yaw=car.yaw;
  }
  update(dt:number,player:THREE.Vector3,signals?:TrafficSignals,time=0) {
    for(const car of this.cars){
      if(car.manual){this.place(car);continue;}
      if(car.parked){car.position.copy(car.parked);car.yaw=car.parked.x>0?0:Math.PI;}
      else {
        const route=this.routes[Number(car.reverse)],length=route.getLength(),sign=car.reverse?-1:1;
        const fraction=THREE.MathUtils.euclideanModulo(car.distance,length)/length;
        const p=route.getPointAt(fraction),tangent=route.getTangentAt(fraction).multiplyScalar(sign);
        const dx=player.x-p.x,dz=player.z-p.z,ahead=dx*tangent.x+dz*tangent.z,lateral=Math.abs(dx*tangent.z-dz*tangent.x);
        const yieldToPlayer=!this.controlled&&ahead>0&&ahead<10&&lateral<2;
        let targetSpeed=yieldToPlayer?0:car.cruise;
        if(signals)targetSpeed=Math.min(targetSpeed,signals.speedLimit(p,tangent,car.speed,time));
        for(const other of this.cars)if(other!==car){
          if(!other.parked&&!other.manual&&other.reverse===car.reverse){
            const gap=THREE.MathUtils.euclideanModulo((other.distance-car.distance)*sign,length);
            if(gap<14)targetSpeed=Math.min(targetSpeed,Math.max(0,(gap-6.2)*.6));
          }
          if(other.manual||other.parked){
            const ox=other.position.x-p.x,oz=other.position.z-p.z,forward=ox*tangent.x+oz*tangent.z,side=Math.abs(ox*tangent.z-oz*tangent.x);
            const along=Math.abs(Math.cos(other.yaw)*tangent.z+Math.sin(other.yaw)*tangent.x);
            const across=Math.sqrt(Math.max(0,1-along*along));
            const margin=2.45+2.45*along+1.1*(1-along)+.4;
            if(forward>0&&forward<18&&side<1.1+2.45*across+1.1*along+.3)targetSpeed=Math.min(targetSpeed,Math.max(0,(forward-margin)*.55));
          }
        }
        car.speed=brakingSpeed(car.speed,targetSpeed,dt);
        const travel=car.speed*dt,distance=THREE.MathUtils.euclideanModulo(car.distance+travel*sign,length);
        const next=route.getPointAt(distance/length),dir=route.getTangentAt(distance/length).multiplyScalar(sign),yaw=Math.atan2(dir.x,dir.z);
        const others=this.cars.filter(c=>c!==car).map(c=>({id:c.id,x:c.position.x,z:c.position.z,yaw:c.yaw,length:4.9,width:2.2}));
        if(dt>0&&vehicleCollision({x:next.x,z:next.z,yaw,length:4.9,width:2.2},{obstacles:[],vehicles:others},.04)){car.speed=0;this.place(car);continue;}
        car.distance=distance;car.roll+=travel/(car.model==='concept'?.384:.379);
        const future=route.getTangentAt(THREE.MathUtils.euclideanModulo(car.distance+sign*1.6,length)/length).multiplyScalar(sign);
        car.steer=THREE.MathUtils.clamp(Math.atan2(dir.x*future.z-dir.z*future.x,dir.dot(future))*1.6,-.5,.5);
        car.position.copy(next);car.yaw=Math.atan2(dir.x,dir.z);
      }
      this.place(car);
    }
    this.writeMatrices();
  }
  private writeMatrices(){
    const steering=new THREE.Matrix4(),spin=new THREE.Matrix4();
    for(const batch of this.batches){
      batch.cars.forEach((car,index)=>{
        this.matrix.copy(car.matrix).multiply(batch.part);
        if(this.cockpitView&&car===this.controlled&&(batch.mesh.material as THREE.Material).name==='Glass')this.matrix.scale(new THREE.Vector3(0,0,0));
        if(batch.cockpit)this.matrix.multiply(spin.makeRotationZ(car.steer*1.8));
        if(batch.wheel){if(batch.front)this.matrix.multiply(steering.makeRotationY(-car.steer));this.matrix.multiply(spin.makeRotationX(car.roll));}
        batch.mesh.setMatrixAt(index,this.matrix);
      });batch.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  setReflection(texture:THREE.Texture){
    this.reflection=texture;
    for(const batch of this.batches){const material=batch.mesh.material as THREE.MeshStandardMaterial;if(['Paint','Glass'].includes(material.name)){material.envMap=texture;material.needsUpdate=true;}}
  }
  dispose(){this.dead=true;}
}
