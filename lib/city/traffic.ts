import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Obstacle } from './movement';

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
type Vehicle={model:string;distance:number;reverse:boolean;speed:number;cruise:number;paint:string;matrix:THREE.Matrix4;roll:number;steer:number;obstacle:Obstacle;parked?:THREE.Vector3};
type Batch={mesh:THREE.InstancedMesh;part:THREE.Matrix4;wheel:boolean;front:boolean;cars:Vehicle[]};
export class Traffic {
  readonly root=new THREE.Group();
  readonly cars:Vehicle[]=[];
  private batches:Batch[]=[];
  private routes=[createTrafficRoute(false),createTrafficRoute(true)];
  private dead=false;
  private reflection?:THREE.Texture;
  private dummy=new THREE.Object3D();
  private matrix=new THREE.Matrix4();
  constructor(scene:THREE.Scene,manager:THREE.LoadingManager,obstacles:Obstacle[],onError:()=>void) {
    scene.add(this.root);
    const paints=['#d2d3ce','#343c44','#455d63','#716b5c','#b0b4b6','#3b4a42'];
    for(let i=0;i<12;i++){
      const reverse=i>=6,length=this.routes[Number(reverse)].getLength();
      const obstacle:Obstacle={x:0,z:0,rx:1.1,rz:2.4,shape:'box',height:i%3===0?1.2:2.1};obstacles.push(obstacle);
      this.cars.push({model:i%3===0?'concept':'rover',distance:(i%6)/6*length+length*.10,reverse,speed:4.3,cruise:4.3,paint:paints[i%6],matrix:new THREE.Matrix4(),roll:0,steer:0,obstacle});
    }
    for(const [index,x,z] of [[0,57.4,89],[1,-57.4,18]]){
      const obstacle:Obstacle={x,z,rx:1.2,rz:2.5,shape:'box',height:index?2.1:1.2};obstacles.push(obstacle);
      this.cars.push({model:index?'rover':'concept',distance:0,reverse:false,speed:0,cruise:0,paint:index?'#445a4c':'#acada8',matrix:new THREE.Matrix4(),roll:0,steer:0,obstacle,parked:new THREE.Vector3(x,.04,z)});
    }
    this.update(0,new THREE.Vector3(18,1.8,116));
    for(const kind of ['concept','rover'])new GLTFLoader(manager).load(`/assets/${kind}-traffic.glb`,gltf=>{
      if(this.dead){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
      this.batchTemplate(gltf.scene,this.cars.filter(c=>c.model===kind));
    },undefined,onError);
  }
  private batchTemplate(template:THREE.Group,cars:Vehicle[]) {
    template.updateMatrixWorld(true);
    const groups=new Map<string,{geometries:THREE.BufferGeometry[];material:THREE.Material;part:THREE.Matrix4;name:string}>();
    template.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh))return;
      let wheel:THREE.Object3D|undefined;
      for(let parent:THREE.Object3D|null=obj;parent&&parent!==template;parent=parent.parent)if(/^Wheel(Front|Rear)/.test(parent.name))wheel=parent;
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
      this.root.add(mesh);this.batches.push({mesh,part:g.part,wheel:g.name!=='Body',front:g.name.includes('Front'),cars});
    }
    template.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});
    this.writeMatrices();
  }
  update(dt:number,player:THREE.Vector3) {
    for(const car of this.cars){
      if(car.parked){this.dummy.position.copy(car.parked);this.dummy.rotation.set(0,car.parked.x>0?0:Math.PI,0);}
      else {
        const route=this.routes[Number(car.reverse)],length=route.getLength(),sign=car.reverse?-1:1;
        const fraction=THREE.MathUtils.euclideanModulo(car.distance,length)/length;
        const p=route.getPointAt(fraction),tangent=route.getTangentAt(fraction).multiplyScalar(sign);
        const dx=player.x-p.x,dz=player.z-p.z,ahead=dx*tangent.x+dz*tangent.z,lateral=Math.abs(dx*tangent.z-dz*tangent.x);
        const yieldToPlayer=ahead>0&&ahead<10&&lateral<2;
        let targetSpeed=yieldToPlayer?0:car.cruise;
        for(const other of this.cars)if(other!==car&&!other.parked&&other.reverse===car.reverse){
          const gap=THREE.MathUtils.euclideanModulo((other.distance-car.distance)*sign,length);
          if(gap<14)targetSpeed=Math.min(targetSpeed,Math.max(0,(gap-6.2)*.6));
        }
        car.speed=brakingSpeed(car.speed,targetSpeed,dt);
        const travel=car.speed*dt;car.distance=THREE.MathUtils.euclideanModulo(car.distance+travel*sign,length);car.roll+=travel/(car.model==='concept'?.384:.379);
        const next=route.getPointAt(car.distance/length),dir=route.getTangentAt(car.distance/length).multiplyScalar(sign);
        const future=route.getTangentAt(THREE.MathUtils.euclideanModulo(car.distance+sign*1.6,length)/length).multiplyScalar(sign);
        car.steer=THREE.MathUtils.clamp(Math.atan2(dir.z*future.x-dir.x*future.z,dir.dot(future))*1.6,-.5,.5);
        this.dummy.position.copy(next);this.dummy.rotation.set(0,Math.atan2(dir.x,dir.z),0);
      }
      this.dummy.updateMatrix();car.matrix.copy(this.dummy.matrix);
      const a=this.dummy.rotation.y;
      car.obstacle.x=this.dummy.position.x;car.obstacle.z=this.dummy.position.z;
      car.obstacle.rx=Math.abs(Math.cos(a))*1.1+Math.abs(Math.sin(a))*2.45;
      car.obstacle.rz=Math.abs(Math.sin(a))*1.1+Math.abs(Math.cos(a))*2.45;
    }
    this.writeMatrices();
  }
  private writeMatrices(){
    const steering=new THREE.Matrix4(),spin=new THREE.Matrix4();
    for(const batch of this.batches){
      batch.cars.forEach((car,index)=>{
        this.matrix.copy(car.matrix).multiply(batch.part);
        if(batch.wheel){if(batch.front)this.matrix.multiply(steering.makeRotationY(car.steer));this.matrix.multiply(spin.makeRotationX(car.roll));}
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
