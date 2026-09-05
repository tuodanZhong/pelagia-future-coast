import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MARINA, BOAT_SIZE, stepBoat, boatFree, onDock, type BoatState, type BoatInput } from './waterfront.ts';
import { isWalkable, type Obstacle } from './movement.ts';

function buildYacht(index:number){
  const root=new THREE.Group();root.name='AZURE 48 · 游艇 '+(index+1);
  const mats=[new THREE.MeshPhysicalMaterial({color:['#e9e6dc','#dee2df','#d8dfde'][index],roughness:.26,metalness:.1,clearcoat:.8}),new THREE.MeshStandardMaterial({color:'#254249',roughness:.15,metalness:.4}),new THREE.MeshStandardMaterial({color:'#a58a65',roughness:.7}),new THREE.MeshStandardMaterial({color:'#b6bec0',roughness:.24,metalness:.88}),new THREE.MeshStandardMaterial({color:'#d9d3c5',roughness:.88}),new THREE.MeshStandardMaterial({color:'#253338',roughness:.75})];
  const parts:THREE.BufferGeometry[][]=mats.map(()=>[]);
  function add(g:THREE.BufferGeometry,m:number,x=0,y=0,z=0,rx=0,ry=0,rz=0){g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));parts[m].push(g);}
  function box(m:number,x:number,y:number,z:number,w:number,h:number,d:number,rx=0){add(new THREE.BoxGeometry(w,h,d),m,x,y,z,rx);}
  function pipe(points:number[][],r=.028,m=3){for(let i=1;i<points.length;i++){const a=new THREE.Vector3(...points[i-1] as [number,number,number]),b=new THREE.Vector3(...points[i] as [number,number,number]),dir=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,dir.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));const p=a.add(b).multiplyScalar(.5);add(g,m,p.x,p.y,p.z);}}
  // Compound hull sections give the bow real flare, chines, and a submerged keel.
  const stations=[[-7,1.65],[-6.5,2.08],[-3,2.17],[1,2.05],[4,1.65],[6,.85],[7.5,0.05]],verts:number[]=[],indices:number[]=[];
  for(const [z,w]of stations)for(const [x,y]of [[-w,1.35],[-w*.94,.28],[-w*.48,-.38],[w*.48,-.38],[w*.94,.28],[w,1.35]])verts.push(x,y,z);
  for(let j=0;j<stations.length-1;j++)for(let k=0;k<6;k++){const a=j*6+k,b=j*6+(k+1)%6,c=b+6,d=a+6;indices.push(a,b,c,a,c,d);}
  for(const j of [0,stations.length-1])for(let k=1;k<5;k++)indices.push(j*6,j*6+k+(j===0?1:0),j*6+k+(j===0?0:1));
  const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));hull.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(verts.length/3*2),2));hull.setIndex(indices);hull.computeVertexNormals();parts[0].push(hull.toNonIndexed());hull.dispose();
  const deck=new THREE.Shape();deck.moveTo(-1.65,-7);for(const[z,w]of stations)deck.lineTo(-w,z);for(const[z,w]of [...stations].reverse())deck.lineTo(w,z);deck.closePath();
  const deckGeo=new THREE.ShapeGeometry(deck);deckGeo.rotateX(Math.PI/2);deckGeo.rotateZ(Math.PI);add(deckGeo,2,0,1.38,0);
  box(0,0,1.05,-7.25,3.6,.22,.8);box(2,0,1.19,-7.27,3.3,.07,.7);
  for(let x=-1.5;x<=1.5;x+=.24)box(5,x,1.395,-4.1,.012,.008,5.3);
  // Cabin glazing, mullions, recessed skylights and a sheltered aft helm.
  box(0,0,1.73,1.45,3.25,.68,5.25);box(1,0,2.29,1.4,3.1,.70,4.5);
  box(0,0,2.78,1.45,3.65,.16,5.0);box(0,0,3.40,-.6,3.5,.13,5.8);
  for(const x of [-1.55,1.55]){pipe([[x,1.4,-2.9],[x,3.35,-2.9]],.065);pipe([[x,2.75,2.1],[x,3.37,2.1]],.055);box(0,x,2.3,1.4,.09,.82,.10);}
  box(1,0,2.72,3.8,2.65,.07,1.35,-.13);box(1,0,3.48,.8,1.75,.04,1.3);
  box(0,0,1.70,-1.35,1.45,.65,.65);box(5,0,2.24,-1.5,1.25,.055,.5,.35);
  for(const x of [-.34,.34])box(1,x,2.29,-1.61,.42,.025,.25,.35);
  const wheel=new THREE.Group();wheel.position.set(0,2.52,-1.62);wheel.rotation.x=-.35;
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.29,.026,7,24),mats[5]);wheel.add(rim);
  for(let i=0;i<3;i++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.022,.26,.025),mats[3]);spoke.position.set(Math.sin(i*Math.PI*2/3)*.13,Math.cos(i*Math.PI*2/3)*.13,0);spoke.rotation.z=-i*Math.PI*2/3;wheel.add(spoke);}root.add(wheel);
  // Rear social deck, upholstery seams, sun pad, cleats and stainless guardrails.
  for(const x of [-1.55,1.55]){box(0,x,1.62,-4.8,.82,.43,2.8);box(4,x,1.89,-4.8,.72,.17,2.7);box(4,x*1.18,2.12,-4.8,.13,.48,2.8);for(let z=-5.8;z<-3.5;z+=.6)box(2,x,1.98,z,.72,.012,.014);}
  box(3,0,1.80,-4.7,.08,.8,.08);box(2,0,2.2,-4.7,1.10,.09,1.45);
  box(4,0,1.8,4.5,2.4,.23,1.65);
  for(const side of [-1,1]){const pts=stations.map(([z,w])=>[side*w*.97,2.12,z]);pipe(pts);for(let i=0;i<stations.length;i++){const[z,w]=stations[i];pipe([[side*w*.97,1.4,z],[side*w*.97,2.12,z]],.02);}for(const z of [-6,0,4]){box(3,side*1.85,1.50,z,.20,.09,.36);add(new THREE.CapsuleGeometry(.16,.65,3,8),4,side*2.14,.80,z,0,0,.2);}}
  pipe([[0,3.4,.5],[0,4.55,.5]],.035);add(new THREE.SphereGeometry(.20,10,6),0,0,4.5,.5);
  for(const x of [-1.2,1.2])add(new THREE.CylinderGeometry(.10,.10,.16,8),x<0?1:0,x,3.5,.5);
  parts.forEach((gs,i)=>{if(!gs.length)return;const normalized=gs.map(g=>g.index?g.toNonIndexed():g);const merged=mergeGeometries(normalized);if(merged){const mesh=new THREE.Mesh(merged,mats[i]);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}new Set([...gs,...normalized]).forEach(g=>g.dispose());});
  return {root,wheel};
}
export type Yacht={id:string;state:BoatState;root:THREE.Group;wheel:THREE.Group;berth:number;matrix:THREE.Matrix4};
export class Yachts{
  boats:Yacht[]=[];controlled?:Yacht;
  private wake:THREE.InstancedMesh;private trails:{x:number;z:number;yaw:number;age:number;size:number}[]=[];private wakeClock=0;
  private obstacles:Obstacle[];
  constructor(scene:THREE.Scene,obstacles:Obstacle[]){
    this.obstacles=obstacles;
    MARINA.berths.forEach((z,i)=>{const model=buildYacht(i),boat={id:'yacht-'+i,state:{x:183.7,z,yaw:Math.PI/2,speed:0,steer:0,vx:0,vz:0,yawRate:0},...model,berth:z,matrix:new THREE.Matrix4()};this.boats.push(boat);scene.add(model.root);});
    this.wake=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#d7e3dc',transparent:true,opacity:.15,depthWrite:false}),100);this.wake.rotation.x=-Math.PI/2;this.wake.frustumCulled=false;this.wake.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.wake);this.update(0,0);
  }
  poses(){return this.boats.map(b=>({id:b.id,...b.state,...BOAT_SIZE}));}
  private edgeDistance(p:{x:number;z:number},b:Yacht){const dx=p.x-b.state.x,dz=p.z-b.state.z,c=Math.cos(b.state.yaw),s=Math.sin(b.state.yaw);return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-2.25),Math.max(0,Math.abs(dx*s+dz*c)-7.4));}
  nearest(p:{x:number;z:number}){if(!onDock(p.x,p.z,.2))return;return this.boats.filter(b=>this.edgeDistance(p,b)<2.25).sort((a,b)=>this.edgeDistance(p,a)-this.edgeDistance(p,b))[0];}
  takeControl(b:Yacht){this.controlled=b;}
  release(returnToBerth=false){const boat=this.controlled;if(boat&&returnToBerth){for(const z of [boat.berth,...MARINA.berths]){const spawn={...boat.state,x:183.7,z,yaw:Math.PI/2,speed:0,vx:0,vz:0,yawRate:0};if(boatFree(spawn,this.poses(),boat.id)){boat.state=spawn;break;}}}if(boat){boat.state.speed=0;boat.state.vx=0;boat.state.vz=0;}this.controlled=undefined;}
  exitPosition(){const b=this.controlled;if(!b||Math.hypot(b.state.vx,b.state.vz)>.5)return;const candidates=[];for(let z=37.5;z<=92.5;z+=.5)for(const x of [171.8,172.4,174,175])if(onDock(x,z,.36)&&isWalkable(x,z,this.obstacles)){const d=this.edgeDistance({x,z},b);if(d<2.25)candidates.push({x,z,d,yaw:Math.PI/2});}return candidates.sort((a,b)=>a.d-b.d)[0];}
  drive(dt:number,input:BoatInput){const b=this.controlled;if(!b)return false;const result=stepBoat(b.state,input,dt,this.poses(),b.id);b.state=result.state;return result.collided;}
  update(dt:number,time:number){
    for(const b of this.boats){const s=b.state;b.root.position.set(s.x,MARINA.water+Math.sin(time*1.35+b.berth)*.028,s.z);b.root.rotation.set(Math.sin(time*1.1+b.berth)*.003,s.yaw,Math.sin(time*.9+b.berth)*.007-s.steer*Math.min(.035,Math.abs(s.speed)*.003));b.wheel.rotation.z=-s.steer*.65;b.root.updateMatrixWorld(true);b.matrix.copy(b.root.matrixWorld);}
    const b=this.controlled;this.wakeClock+=dt;
    if(b&&Math.abs(b.state.speed)>1&&this.wakeClock>.10){this.wakeClock=0;for(const side of [-1,1])this.trails.push({x:b.state.x-Math.sin(b.state.yaw)*7.2+Math.cos(b.state.yaw)*side*.9,z:b.state.z-Math.cos(b.state.yaw)*7.2-Math.sin(b.state.yaw)*side*.9,yaw:b.state.yaw+side*.12,age:0,size:Math.min(2.8,Math.abs(b.state.speed)*.2)});}
    this.trails=this.trails.filter(t=>(t.age+=dt)<4.5).slice(-100);const d=new THREE.Object3D();this.wake.count=this.trails.length;
    this.trails.forEach((t,i)=>{d.position.set(t.x,-t.z,MARINA.water+.025);d.rotation.set(0,0,-t.yaw);const fade=1-t.age/4.5;d.scale.set((t.size+t.age*.7)*fade,2+t.age*.3,1);d.updateMatrix();this.wake.setMatrixAt(i,d.matrix);});this.wake.instanceMatrix.needsUpdate=true;
  }
}
