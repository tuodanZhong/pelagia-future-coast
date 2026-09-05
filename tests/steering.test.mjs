import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Traffic} from '../lib/city/traffic.ts';
import {createDrivingState,stepDriving} from '../lib/city/driving.ts';

const YAWS=[0,Math.PI/2,Math.PI,-Math.PI/2],KINDS=['concept','rover'];
const assetJSON=Object.fromEntries(KINDS.map(kind=>{
  const bytes=fs.readFileSync(new URL(`../public/assets/${kind}-traffic.glb`,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  return [kind,JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))];
}));
// Preserve the real asset hierarchy/pivot transforms; dummy marker meshes avoid texture/DOM loads.
function template(kind){
  const json=assetJSON[kind],nodes=json.nodes.map(n=>{
    const group=new THREE.Group();group.name=n.name??'';
    if(n.matrix){group.matrix.fromArray(n.matrix);group.matrix.decompose(group.position,group.quaternion,group.scale);}
    else{if(n.translation)group.position.fromArray(n.translation);if(n.rotation)group.quaternion.fromArray(n.rotation);if(n.scale)group.scale.fromArray(n.scale);}
    if(/^Wheel(Front|Rear)/.test(group.name)||group.name==='SteeringWheel'){
      const material=new THREE.MeshStandardMaterial({name:`Fixture-${kind}-${group.name}`});
      group.add(new THREE.Mesh(new THREE.PlaneGeometry(.02,.02),material));
    }
    return group;
  });
  json.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
  const root=new THREE.Group();json.scenes[json.scene??0].nodes.forEach(index=>root.add(nodes[index]));return root;
}
function makeTraffic(){
  const original=GLTFLoader.prototype.load;
  GLTFLoader.prototype.load=function(url,onLoad){const kind=String(url).includes('concept')?'concept':'rover';onLoad({scene:template(kind)});return this;};
  let traffic;
  try{traffic=new Traffic(new THREE.Scene(),new THREE.LoadingManager(),[],()=>{});}
  finally{GLTFLoader.prototype.load=original;}
  // Other cars must not interfere with these controlled steering probes.
  traffic.cars.forEach((car,i)=>car.position.set(1000+i*10,0,1000));return traffic;
}
function configure(traffic,kind,yaw,steer=0,speed=0){
  traffic.releaseControl();const car=traffic.cars.find(c=>c.model===kind);
  assert.ok(traffic.takeControl(car));car.manual=createDrivingState({x:0,z:0,yaw,speed,steer});car.roll=0;
  traffic.drive(0,{throttle:0,steer:0});return car;
}
function matrixOf(traffic,car,part){
  const mesh=part==='rover-cockpit'
    ? traffic.root.children.find(o=>o.isInstancedMesh&&o.material.name==='RoverSteeringWheel')
    : traffic.root.children.find(o=>o.isInstancedMesh&&o.material.name===`Fixture-${car.model}-${part}`);
  assert.ok(mesh,`${car.model} ${part} is independently animated`);
  const index=traffic.cars.filter(c=>c.model===car.model).indexOf(car),matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);return matrix;
}
const screenRight=yaw=>new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));
function cameraFor(kind,mode,yaw){
  const camera=new THREE.PerspectiveCamera(68,16/9,.025,100),vehicle=new THREE.Matrix4().makeRotationY(yaw);
  if(mode==='driver'){
    const eye=kind==='concept'?[-.015785,.928885,.225431]:[.412368,1.534724,.290663];
    camera.position.fromArray(eye).applyMatrix4(vehicle);camera.rotation.set(0,yaw+Math.PI,0,'YXZ');
  }else{camera.position.set(0,2.2,-7.5).applyMatrix4(vehicle);camera.lookAt(new THREE.Vector3(0,.9,0).applyMatrix4(vehicle));}
  camera.updateMatrixWorld(true);return camera;
}

test('A and D move both vehicle bodies toward the requested driver-screen side at four headings',()=>{
  for(const kind of KINDS)for(const yaw of YAWS)for(const command of [-1,1]){
    const traffic=makeTraffic(),car=configure(traffic,kind,yaw,0,3),input={throttle:1,steer:command};
    let expected=createDrivingState({x:0,z:0,yaw,speed:3});
    for(let i=0;i<30;i++){expected=stepDriving(expected,input,1/60,{obstacles:[]}).state;traffic.drive(1/60,input);}
    assert.ok(Math.hypot(car.position.x-expected.x,car.position.z-expected.z)<1e-8);
    const displayed=new THREE.Vector3().setFromMatrixPosition(car.matrix);
    assert.ok(displayed.dot(screenRight(yaw))*command>.05,`${kind} yaw ${yaw} command ${command} body moves wrong screen side`);
    const yawChange=Math.atan2(Math.sin(car.yaw-yaw),Math.cos(car.yaw-yaw));assert.ok(yawChange*command<0);
    const displayedForward=new THREE.Vector3(0,0,1).transformDirection(car.matrix);
    assert.ok(displayedForward.distanceTo(new THREE.Vector3(Math.sin(expected.yaw),0,Math.cos(expected.yaw)))<1e-7);
    traffic.dispose();
  }
});

test('reverse steering retains wheel direction while body yaw changes sign',()=>{
  for(const kind of KINDS)for(const yaw of YAWS)for(const command of [-1,1]){
    const traffic=makeTraffic(),car=configure(traffic,kind,yaw,0,-3);
    for(let i=0;i<15;i++)traffic.drive(1/60,{throttle:-1,steer:command});
    const change=Math.atan2(Math.sin(car.yaw-yaw),Math.cos(car.yaw-yaw));
    assert.ok(change*command>0);assert.ok(car.steer*command>0);assert.ok(car.speed<0);traffic.dispose();
  }
});

test('actual Traffic front-wheel instance matrices steer to the requested screen side; rear wheels stay straight',()=>{
  for(const kind of KINDS)for(const yaw of YAWS)for(const command of [-1,1]){
    const traffic=makeTraffic(),car=configure(traffic,kind,yaw,command*.3),right=screenRight(yaw);
    const frontNames=assetJSON[kind].nodes.filter(n=>/^WheelFront/.test(n.name)).map(n=>n.name);
    const rearNames=assetJSON[kind].nodes.filter(n=>/^WheelRear/.test(n.name)).map(n=>n.name);
    assert.equal(frontNames.length,2);assert.equal(rearNames.length,2);
    for(const name of frontNames){
      const heading=new THREE.Vector3(0,0,1).transformDirection(matrixOf(traffic,car,name));
      assert.ok(heading.dot(right)*command>.1,`${kind} ${name} yaw ${yaw} turns opposite to the driver's command`);
    }
    for(const name of rearNames){const heading=new THREE.Vector3(0,0,1).transformDirection(matrixOf(traffic,car,name));assert.ok(Math.abs(heading.dot(right))<1e-6);}
    traffic.dispose();
  }
});

test('both cockpit wheels turn their top marker toward A/D in driver and chase projection',()=>{
  for(const kind of KINDS)for(const yaw of YAWS)for(const mode of ['driver','chase'])for(const command of [-1,1]){
    const traffic=makeTraffic(),car=configure(traffic,kind,yaw),part=kind==='concept'?'SteeringWheel':'rover-cockpit';
    const camera=cameraFor(kind,mode,yaw),marker=new THREE.Vector3(0,kind==='concept'?.16:.18,0);
    const rest=marker.clone().applyMatrix4(matrixOf(traffic,car,part)).project(camera);
    car.manual.steer=command*.3;traffic.drive(0,{throttle:0,steer:0});
    const steered=marker.clone().applyMatrix4(matrixOf(traffic,car,part)).project(camera);
    assert.ok((steered.x-rest.x)*command>1e-5,`${kind} ${mode} yaw ${yaw}: wheel top rotates against command`);
    traffic.dispose();
  }
});

test('concept cockpit remains an independent tilted shaft part rather than a fixed body mesh',()=>{
  const node=assetJSON.concept.nodes.find(n=>n.name==='SteeringWheel');assert.ok(node);
  const traffic=makeTraffic(),car=configure(traffic,'concept',0),matrix=matrixOf(traffic,car,'SteeringWheel');
  const pivot=new THREE.Vector3().setFromMatrixPosition(matrix);assert.ok(pivot.distanceTo(new THREE.Vector3(.0007,.652+.125,.6948))<1e-5);
  const shaft=new THREE.Vector3(0,0,1).transformDirection(matrix);
  assert.ok(shaft.z>.90&&shaft.y<-.30&&shaft.y>-.39);
  traffic.dispose();
});
