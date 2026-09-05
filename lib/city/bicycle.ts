import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BICYCLE = {
  wheelRadius:.34, wheelbase:1.14, length:1.95, width:.59,
  seat:[0,.91,-.24] as const,
  leftGrip:[.27,1.18,.45] as const, rightGrip:[-.27,1.18,.45] as const,
  steeringPivot:[0,.85,.405] as const, steeringAxis:[0,.94,-.342] as const,
  bottomBracket:[0,.37,-.05] as const, crankLength:.17, pedalOffset:.125,
  frontAxle:[0,.34,.57] as const, rearAxle:[0,.34,-.57] as const,
} as const;
export type BicycleAnchorSet={seat:THREE.Vector3;leftGrip:THREE.Vector3;rightGrip:THREE.Vector3;leftPedal:THREE.Vector3;rightPedal:THREE.Vector3;leftPedalNormal:THREE.Vector3;rightPedalNormal:THREE.Vector3};
export type BicycleModel={root:THREE.Group;leanRoot:THREE.Group;frontAssembly:THREE.Group;frontWheel:THREE.Group;rearWheel:THREE.Group;crank:THREE.Group;leftPedal:THREE.Group;rightPedal:THREE.Group;anchors:BicycleAnchorSet;materials:THREE.Material[]};
export type BicyclePose={steer:number;crank:number;wheelRoll:number;lean?:number};
const V=(a:readonly number[])=>new THREE.Vector3(a[0],a[1],a[2]);
const axis=V(BICYCLE.steeringAxis).normalize();
/** Anchors in the unleaned bicycle coordinate frame. Apply bike lean/yaw/world transform exactly once. */
export function bicycleAnchors(crank=0,steer=0):BicycleAnchorSet {
  const pivot=V(BICYCLE.steeringPivot),q=new THREE.Quaternion().setFromAxisAngle(axis,-steer),bb=BICYCLE.bottomBracket,r=BICYCLE.crankLength;
  return {seat:V(BICYCLE.seat),leftGrip:V(BICYCLE.leftGrip).sub(pivot).applyQuaternion(q).add(pivot),rightGrip:V(BICYCLE.rightGrip).sub(pivot).applyQuaternion(q).add(pivot),
    leftPedal:new THREE.Vector3(BICYCLE.pedalOffset,bb[1]+r*Math.cos(crank),bb[2]+r*Math.sin(crank)),
    rightPedal:new THREE.Vector3(-BICYCLE.pedalOffset,bb[1]-r*Math.cos(crank),bb[2]-r*Math.sin(crank)),
    leftPedalNormal:new THREE.Vector3(0,1,0),rightPedalNormal:new THREE.Vector3(0,1,0)};
}

/** Refined 700C city bicycle, entirely procedural. +Z forward, +X rider-left, y=0 ground. */
export function buildBicycle(options:{color?:string;basket?:boolean}={}):BicycleModel {
  const root=new THREE.Group();root.name='PelagiaCityBicycle';root.userData={...BICYCLE,provenance:'Original procedural geometry; no external model or bitmap assets.'};
  const leanRoot=new THREE.Group();leanRoot.name='BicycleLean';root.add(leanRoot);
  const body=new THREE.Group();body.name='BicycleFrame';leanRoot.add(body);
  const frontAssembly=new THREE.Group();frontAssembly.name='FrontAssembly';frontAssembly.position.copy(V(BICYCLE.steeringPivot));leanRoot.add(frontAssembly);
  const frontWheel=new THREE.Group();frontWheel.name='WheelFront';frontWheel.position.copy(V(BICYCLE.frontAxle)).sub(frontAssembly.position);frontAssembly.add(frontWheel);
  const rearWheel=new THREE.Group();rearWheel.name='WheelRear';rearWheel.position.copy(V(BICYCLE.rearAxle));leanRoot.add(rearWheel);
  const crank=new THREE.Group();crank.name='Crank';crank.position.copy(V(BICYCLE.bottomBracket));leanRoot.add(crank);
  const leftPedal=new THREE.Group();leftPedal.name='PedalLeft';leftPedal.position.set(.125,.17,0);crank.add(leftPedal);
  const rightPedal=new THREE.Group();rightPedal.name='PedalRight';rightPedal.position.set(-.125,-.17,0);crank.add(rightPedal);
  const material=(name:string,color:string,roughness:number,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});m.name=name;return m;};
  const mats={paint:material('BicycleEnamel',options.color??'#3d777d',.34,.48),metal:material('BicycleBrushedAlloy','#a9b3b2',.29,.83),dark:material('BicycleDarkMetal','#2b3535',.55,.53),rubber:material('BicycleRubber','#232829',.89,.01),saddle:material('BicycleSaddle','#363c3a',.80,.03),red:material('BicycleRearReflector','#9f252b',.3,.16),amber:material('BicycleAmberReflector','#c39435',.34,.14),lamp:material('BicycleLamp','#e5eee1',.24,.17)};
  mats.lamp.emissive.set('#d8e6c9');mats.lamp.emissiveIntensity=.16;
  type M=keyof typeof mats;const groups=new Map<THREE.Group,Map<M,THREE.BufferGeometry[]>>();
  function add(g:THREE.BufferGeometry,m:M,p:readonly number[]=[0,0,0],r:readonly number[]=[0,0,0],part=body,world=false){
    const pos=V(p);if(world&&part===frontAssembly)pos.sub(frontAssembly.position);
    g.applyMatrix4(new THREE.Matrix4().compose(pos,new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0],r[1],r[2])),new THREE.Vector3(1,1,1)));
    let bucket=groups.get(part);if(!bucket){bucket=new Map();groups.set(part,bucket);}let list=bucket.get(m);if(!list){list=[];bucket.set(m,list);}list.push(g);
  }
  function box(m:M,size:readonly number[],p:readonly number[],part=body,r:readonly number[]=[0,0,0],bevel=0,world=false){add(bevel?new RoundedBoxGeometry(size[0],size[1],size[2],1,bevel):new THREE.BoxGeometry(...size as [number,number,number]),m,p,r,part,world);}
  function rod(m:M,a:readonly number[],b:readonly number[],radius:number,part=body,segments=8,world=false){
    const av=V(a),bv=V(b),d=bv.clone().sub(av),g=new THREE.CylinderGeometry(radius,radius,d.length(),segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));add(g,m,av.add(bv).multiplyScalar(.5).toArray(),[0,0,0],part,world);
  }
  function pipe(m:M,points:readonly (readonly number[])[],radius:number,part=body,world=false,steps=24){
    const curve=new THREE.CatmullRomCurve3(points.map(V));add(new THREE.TubeGeometry(curve,steps,radius,7,false),m,[0,0,0],[0,0,0],part,world);
  }
  const bb=BICYCLE.bottomBracket;
  // A softly bowed diamond frame: both triangles are actual separate metal tubes.
  rod('paint',bb,[0,.858,-.223],.030);
  pipe('paint',[[0,.747,-.184],[0,.756,.015],[0,.816,.23],[0,.888,.385]],.031,body,false,19);
  pipe('paint',[[0,.716,.451],[0,.51,.263],[0,.40,.105],bb],.038,body,false,18);
  rod('paint',[0,.711,.456],[0,.979,.359],.038);
  for(const side of [-1,1]){
    pipe('paint',[[side*.03,.752,-.187],[side*.055,.64,-.344],[side*.062,.34,-.57]],.016,body,false,11);
    pipe('paint',[[side*.04,.37,-.05],[side*.066,.332,-.335],[side*.062,.34,-.57]],.019,body,false,12);
    add(new THREE.CylinderGeometry(.039,.039,.016,10),'metal',[side*.07,.34,-.57],[0,0,Math.PI/2]);
    // Small weld collars, cable bosses, bottle-cage eyelets and axle lock.
    for(const y of [.48,.64])add(new THREE.CylinderGeometry(.006,.006,.010,6),'metal',[side*.034,y,-.05-(y-.37)*.36],[0,0,Math.PI/2]);
  }
  add(new THREE.CylinderGeometry(.055,.055,.128,14),'metal',bb,[0,0,Math.PI/2]);
  rod('metal',[0,.829,-.214],[0,.884,-.238],.018);
  add(new THREE.CylinderGeometry(.036,.036,.025,12),'dark',[0,.83,-.214]);
  // Sculpted long saddle with narrow nose, broad back and visible springless rails.
  box('saddle',[.177,.065,.188],[0,.876,-.285],body,[.015,0,0],.026);
  box('saddle',[.073,.050,.163],[0,.872,-.17],body,[-.07,0,0],.021);
  for(const x of [-.028,.028])pipe('metal',[[x,.851,-.37],[x,.826,-.29],[x,.831,-.14]],.005,body,false,10);
  box('dark',[.105,.018,.12],[0,.841,-.25]);
  // Curved fork and headset follow a real raked steering axis; no axle translation trick.
  for(const side of [-1,1]){
    pipe('paint',[[side*.035,.727,.449],[side*.044,.55,.49],[side*.054,.365,.585],[side*.054,.34,.57]],.021,frontAssembly,true,17);
    add(new THREE.CylinderGeometry(.036,.036,.012,10),'metal',[side*.06,.34,.57],[0,0,Math.PI/2],frontAssembly,true);
  }
  rod('metal',[0,.935,.375],[0,1.126,.307],.021,frontAssembly,10,true);
  add(new THREE.CylinderGeometry(.046,.046,.026,14),'dark',[0,.979,.359],[.349,0,0],frontAssembly,true);
  rod('paint',[0,1.126,.307],[0,1.155,.427],.025,frontAssembly,9,true);
  pipe('metal',[[-.287,1.18,.45],[-.17,1.186,.429],[0,1.155,.427],[.17,1.186,.429],[.287,1.18,.45]],.012,frontAssembly,true,22);
  for(const side of [-1,1]){
    rod('rubber',[side*.215,1.18,.45],[side*.294,1.18,.45],.020,frontAssembly,10,true);
    for(let i=0;i<7;i++)add(new THREE.TorusGeometry(.0202,.0018,4,9),'dark',[side*(.22+i*.01),1.18,.45],[0,Math.PI/2,0],frontAssembly,true);
    rod('dark',[side*.218,1.178,.45],[side*.224,1.152,.496],.010,frontAssembly,7,true);
    rod('metal',[side*.224,1.152,.496],[side*.284,1.147,.509],.005,frontAssembly,7,true);
    pipe('dark',[[side*.21,1.17,.48],[side*.145,1.078,.518],[side*.058,.909,.531],[side*.025,.71,.49]],.0024,frontAssembly,true,15);
  }
  add(new THREE.SphereGeometry(.027,10,7),'metal',[-.17,1.202,.436],[0,0,0],frontAssembly,true);
  // Low headlight and front reflector; rear red safety reflector under cargo carrier.
  rod('metal',[0,.736,.49],[0,.741,.63],.007,frontAssembly,7,true);
  add(new THREE.CylinderGeometry(.037,.041,.047,12),'dark',[0,.748,.646],[Math.PI/2,0,0],frontAssembly,true);
  add(new THREE.CylinderGeometry(.030,.030,.006,12),'lamp',[0,.748,.673],[Math.PI/2,0,0],frontAssembly,true);
  // Detailed wheels; locally pure RX rolling keeps the tire contact point on the road.
  for(const wheel of [frontWheel,rearWheel]){
    add(new THREE.TorusGeometry(.315,.025,8,48),'rubber',[0,0,0],[0,Math.PI/2,0],wheel);
    for(const x of [-.015,.015])add(new THREE.TorusGeometry(.301,.007,5,48),'metal',[x,0,0],[0,Math.PI/2,0],wheel);
    add(new THREE.TorusGeometry(.304,.008,5,48),'dark',[0,0,0],[0,Math.PI/2,0],wheel);
    add(new THREE.CylinderGeometry(.034,.034,.117,14),'metal',[0,0,0],[0,0,Math.PI/2],wheel);
    for(const side of [-1,1]){
      add(new THREE.CylinderGeometry(.027,.027,.016,10),'dark',[side*.059,0,0],[0,0,Math.PI/2],wheel);
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8+(side>0?.0:Math.PI/16),b=a+side*.28;
        rod('metal',[side*.047,Math.cos(b)*.025,Math.sin(b)*.025],[side*.013,Math.cos(a)*.297,Math.sin(a)*.297],.0019,wheel,4);
      }
    }
    // A silver brake disc with drilled recesses, axle nuts and an offset valve stem.
    add(new THREE.CylinderGeometry(.088,.088,.0035,24),'metal',[.050,0,0],[0,0,Math.PI/2],wheel);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;add(new THREE.CylinderGeometry(.004,.004,.004,5),'dark',[.053,Math.cos(a)*.067,Math.sin(a)*.067],[0,0,Math.PI/2],wheel);}
    rod('dark',[0,.279,0],[0,.299,0],.004,wheel,5);
    box('amber',[.008,.055,.016],[0,.188,0],wheel,[0,0,.05],.002);
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16;box('dark',[.011,.002,.009],[0,Math.cos(a)*.338,Math.sin(a)*.338],wheel,[a,0,0]);
    }
  }
  // Painted mudguards are narrow curved strips, leaving the spokes and rims visible.
  function fender(z:number,part:THREE.Group){
    const points=Array.from({length:25},(_,i)=>{const a=-.06+i*(Math.PI+.22)/24;return [0,.34+Math.sin(a)*.365,z+Math.cos(a)*.365];});
    for(const x of [-.023,0,.023])pipe('paint',points.map(p=>[x,p[1],p[2]]),.015,part,part===frontAssembly,30);
    for(const side of [-1,1])for(const a of [.30,2.84])rod('metal',[side*.055,.34,z],[side*.032,.34+Math.sin(a)*.355,z+Math.cos(a)*.355],.003,part,6,part===frontAssembly);
  }
  fender(-.57,body);fender(.57,frontAssembly);
  box('rubber',[.068,.086,.014],[0,.343,-.935],body,[-.13,0,0],.005);
  box('rubber',[.068,.067,.014],[0,.359,.931],frontAssembly,[.12,0,0],.004,true);
  // Functional-looking chain transmission: crank sprocket, rear cassette and link rollers.
  add(new THREE.CylinderGeometry(.111,.111,.011,40),'metal',[-.084,0,0],[0,0,Math.PI/2],crank);
  for(let i=0;i<32;i++){
    const a=i*Math.PI/16;box('metal',[.010,.012,.010],[-.084,Math.cos(a)*.114,Math.sin(a)*.114],crank,[a,0,0]);
  }
  for(let i=0;i<5;i++)add(new THREE.CylinderGeometry(.05-i*.005,.05-i*.005,.005,20),'metal',[-.064-i*.007,.34,-.57],[0,0,Math.PI/2]);
  const chainPoints:number[][]=[];
  for(let i=0;i<=14;i++){const a=Math.PI/2-i*Math.PI/14;chainPoints.push([-.096,.37+Math.cos(a)*.114,-.05+Math.sin(a)*.114]);}
  for(let i=0;i<=12;i++){const a=-Math.PI/2-i*Math.PI/12;chainPoints.push([-.096,.34+Math.cos(a)*.052,-.57+Math.sin(a)*.052]);}
  chainPoints.push(chainPoints[0]);pipe('dark',chainPoints,.004,body,false,48);
  for(let i=0;i<22;i++){const t=i/21;add(new THREE.CylinderGeometry(.0035,.0035,.007,5),'metal',[-.096,.484*(1-t)+.392*t,-.05*(1-t)-.57*t],[0,0,Math.PI/2]);}
  rod('metal',[-.077,.337,-.57],[-.084,.253,-.615],.006);add(new THREE.CylinderGeometry(.022,.022,.010,12),'dark',[-.084,.251,-.615],[0,0,Math.PI/2]);
  for(const side of [-1,1])rod('metal',[side*.093,0,0],[side*.093,side*.17,0],.010,crank,8);
  for(const pedal of [leftPedal,rightPedal]){
    box('dark',[.093,.018,.066],[0,0,0],pedal,[0,0,0],.006);
    for(const dz of [-.024,.024])box('amber',[.058,.010,.005],[0,0,dz],pedal);
    for(const dx of [-.034,.034])for(const dz of [-.025,.025])add(new THREE.CylinderGeometry(.003,.003,.004,5),'metal',[dx,.012,dz],[0,0,0],pedal);
  }
  // Rack, rear reflector, unobtrusive frame security lock and bottle cage.
  for(const side of [-1,1]){
    rod('metal',[side*.064,.34,-.57],[side*.095,.804,-.754],.006);
    pipe('metal',[[side*.095,.804,-.79],[side*.095,.814,-.44],[side*.036,.786,-.23]],.008,body,false,13);
  }
  for(const z of [-.76,-.65,-.54,-.43])rod('metal',[-.095,.806,z],[.095,.806,z],.006);
  box('dark',[.071,.045,.017],[0,.785,-.807],body,[0,0,0],.006);box('red',[.056,.029,.009],[0,.785,-.82],body,[0,0,0],.005);
  const lock=new THREE.TorusGeometry(.072,.011,6,16,Math.PI);add(lock,'dark',[0,.599,-.417],[0,Math.PI/2,0]);
  pipe('metal',[[.016,.497,.064],[.054,.489,.075],[.059,.602,.181],[.018,.629,.20]],.004,body,false,16);
  // Compact front wire basket, with open sides and no solid box hiding the fork.
  if(options.basket!==false){
    const y0=.889,y1=1.102,z0=.582,z1=.868;
    for(const y of [y0,y1]){
      const w=y===y0?.157:.193;pipe('dark',[[-w,y,z0],[w,y,z0],[w,y,z1],[-w,y,z1],[-w,y,z0]],.0048,frontAssembly,true,28);
    }
    for(let i=0;i<9;i++){
      const x=-.187+i*.04675;rod('dark',[x*.82,y0,z0],[x,y1,z0],.0021,frontAssembly,5,true);rod('dark',[x*.82,y0,z1],[x,y1,z1],.0021,frontAssembly,5,true);
      rod('dark',[x*.82,y0,z0],[x*.82,y0,z1],.0021,frontAssembly,5,true);
    }
    for(let i=1;i<6;i++){const z=z0+i*(z1-z0)/6;for(const side of [-1,1])rod('dark',[side*.157,y0,z],[side*.193,y1,z],.0021,frontAssembly,5,true);}
    for(const x of [-.11,.11])rod('metal',[x,.902,.67],[x*.3,.82,.449],.006,frontAssembly,7,true);
    box('paint',[.128,.064,.009],[0,1.064,.874],frontAssembly,[0,0,0],.008,true);
    for(let i=0;i<3;i++)pipe('metal',[[-.043,1.046+i*.013,.880],[-.015,1.057+i*.013,.880],[.014,1.043+i*.013,.880],[.043,1.050+i*.013,.880]],.0023,frontAssembly,true,9);
  }
  let triangles=0;
  for(const [part,bucket] of groups)for(const [mat,geos] of bucket){
    const normalised=geos.map(g=>{const h=g.index?g.toNonIndexed():g;if(h!==g)g.dispose();if(!h.attributes.uv)h.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(h.attributes.position.count*2),2));return h;});
    const g=mergeGeometries(normalised,false);normalised.forEach(g=>g.dispose());if(!g)throw new Error('Bicycle geometry batch failed');g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,mats[mat]);mesh.name=`${part.name}_${mat}`;mesh.castShadow=true;mesh.receiveShadow=true;part.add(mesh);triangles+=g.attributes.position.count/3;
  }
  root.userData.triangles=triangles;const model={root,leanRoot,frontAssembly,frontWheel,rearWheel,crank,leftPedal,rightPedal,anchors:bicycleAnchors(),materials:Object.values(mats)};
  applyBicyclePose(model,{steer:0,crank:0,wheelRoll:0,lean:0});return model;
}

/** Apply frame-local animation only. Root position/yaw/ground height are the caller's responsibility. */
export function applyBicyclePose(model:BicycleModel,pose:BicyclePose){
  const finite=(n:number)=>Number.isFinite(n)?n:0,steer=THREE.MathUtils.clamp(finite(pose.steer),-.6,.6),crank=finite(pose.crank),lean=THREE.MathUtils.clamp(finite(pose.lean??0),-.38,.38);
  model.frontAssembly.quaternion.setFromAxisAngle(axis,-steer);
  model.frontWheel.rotation.x=finite(pose.wheelRoll);model.rearWheel.rotation.x=finite(pose.wheelRoll);
  model.crank.rotation.x=crank;model.leftPedal.rotation.x=-crank;model.rightPedal.rotation.x=-crank;
  model.leanRoot.rotation.z=lean;
  // Analytic tire support avoids sinking the leaned/raked front wheel into the road.
  const leanQ=model.leanRoot.quaternion;
  const frontCenter=V(BICYCLE.frontAxle).sub(V(BICYCLE.steeringPivot)).applyQuaternion(model.frontAssembly.quaternion).add(V(BICYCLE.steeringPivot)).applyQuaternion(leanQ);
  const frontAxis=new THREE.Vector3(1,0,0).applyQuaternion(model.frontAssembly.quaternion).applyQuaternion(leanQ);
  const frontLow=frontCenter.y-(.315*Math.sqrt(Math.max(0,1-frontAxis.y*frontAxis.y))+.025);
  const rearLow=.025*(Math.cos(lean)-1);
  model.leanRoot.position.y=Math.max(0,-frontLow,-rearLow);
  model.anchors=bicycleAnchors(crank,steer);
  model.root.updateMatrixWorld(true);
}
export function disposeBicycle(model:BicycleModel){model.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});model.materials.forEach(m=>m.dispose());model.root.removeFromParent();}
