import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildWorld} from '../lib/city/world.ts';
import {createTrafficRoute,Traffic} from '../lib/city/traffic.ts';
import {isWalkable} from '../lib/city/movement.ts';
import {vehicleCollision,findSafeExit,createDrivingState,stepDriving} from '../lib/city/driving.ts';

test('existing route footprints and both parked cars have clear driving and exit space',()=>{
  const world=buildWorld(new THREE.Scene()),environment={obstacles:world.obstacles};
  for(const reverse of [false,true]){
    const route=createTrafficRoute(reverse);
    for(let i=0;i<400;i++){
      const p=route.getPointAt(i/400),t=route.getTangentAt(i/400).multiplyScalar(reverse?-1:1);
      const car={x:p.x,z:p.z,yaw:Math.atan2(t.x,t.z)};
      assert.equal(vehicleCollision(car,environment,.045),undefined,`route ${reverse} sample ${i}`);
      assert.ok(findSafeExit(car,environment),`route ${reverse} sample ${i} exit`);
    }
  }
  for(const [x,z,yaw] of [[57.4,89,0],[-57.4,18,Math.PI]]){
    const car={x,z,yaw};assert.equal(vehicleCollision(car,environment,.045),undefined);assert.ok(findSafeExit(car,environment));
  }
});

test('all 14 actual initial vehicles can drive and exit safely beside each other',()=>{
  const scene=new THREE.Scene(),world=buildWorld(scene),originalLoad=GLTFLoader.prototype.load;
  // Geometry loading is irrelevant to physics. Prevent this headless test making asset requests.
  GLTFLoader.prototype.load=function(){return this;};
  let traffic;
  try{traffic=new Traffic(scene,new THREE.LoadingManager(),world.obstacles,()=>{});}
  finally{GLTFLoader.prototype.load=originalLoad;}
  assert.equal(traffic.cars.length,14);assert.equal(traffic.cars.filter(c=>c.parked).length,2);
  const carObstacles=new Set(traffic.cars.map(c=>c.obstacle));
  const vehicles=traffic.cars.map((car,i)=>({id:car.id??String(i),x:car.matrix.elements[12],z:car.matrix.elements[14],yaw:Math.atan2(car.matrix.elements[8],car.matrix.elements[10])}));
  for(const car of vehicles){
    const environment={obstacles:world.obstacles.filter(o=>!carObstacles.has(o)),vehicles,ignoreVehicleId:car.id};
    assert.equal(vehicleCollision(car,environment,.045),undefined,`${car.id} initial collision`);
    const result=stepDriving(createDrivingState(car),{throttle:1,steer:0},.1,environment);
    assert.ok(result.travel>0,`${car.id} unable to drive`);assert.equal(result.collided,false,`${car.id} immediately collides`);
    const exit=findSafeExit(car,environment);assert.ok(exit,`${car.id} lacks safe exit`);
    assert.ok(isWalkable(exit.x,exit.z,world.obstacles,.34),`${car.id} exit not walkable: ${JSON.stringify(exit)}`);
  }
  traffic.dispose();
});

function trafficFixture(){
  const scene=new THREE.Scene(),world=buildWorld(scene),original=GLTFLoader.prototype.load;
  GLTFLoader.prototype.load=function(url,onLoad){onLoad({scene:new THREE.Group()});return this;};
  try{return {world,traffic:new Traffic(scene,new THREE.LoadingManager(),world.obstacles,()=>{})};}finally{GLTFLoader.prototype.load=original;}
}
test('every rendered car supports takeover, manual movement, parking and re-entry without route snapping',()=>{
  for(let index=0;index<14;index++){
    const {world,traffic}=trafficFixture(),car=traffic.cars[index];
    const start=car.position.clone();assert.equal(traffic.takeControl(car),true);
    assert.equal(traffic.takeControl(traffic.cars[(index+1)%14]),false);
    for(let i=0;i<30;i++)traffic.drive(1/60,{throttle:1,steer:0});
    assert.ok(start.distanceTo(car.position)>.2,car.id);
    for(let i=0;i<60;i++)traffic.drive(1/60,{throttle:0,steer:0,brake:1});
    const exit=traffic.exitPosition();assert.ok(exit,car.id);assert.ok(isWalkable(exit.x,exit.z,world.obstacles));
    assert.equal(traffic.nearestVehicle(exit),car);
    const parked=car.position.clone(),yaw=car.yaw;traffic.releaseControl();
    for(let i=0;i<60;i++)traffic.update(1/60,new THREE.Vector3(200,0,200));
    assert.deepEqual(car.position.toArray(),parked.toArray());assert.equal(car.yaw,yaw);assert.equal(car.speed,0);
    assert.equal(traffic.takeControl(car),true);traffic.dispose();
  }
});
test('AI brakes for an offset sideways car and never overlaps its body',()=>{
  const {traffic}=trafficFixture(),ai=traffic.cars[1],parked=traffic.cars[12];
  traffic.takeControl(parked);parked.manual=createDrivingState({x:46.8,z:-12.568,yaw:Math.PI/2});traffic.drive(0,{throttle:0,steer:0});traffic.releaseControl();
  for(let i=0;i<600;i++){
    traffic.update(1/60,new THREE.Vector3(200,0,200));
    assert.equal(vehicleCollision({...parked.manual,id:parked.id}, {obstacles:[],vehicles:[{id:ai.id,x:ai.position.x,z:ai.position.z,yaw:ai.yaw}]}),undefined);
  }
  assert.ok(ai.speed<.1);traffic.dispose();
});
test('reset and navigation can find open ground when a driven car occupies their destination',async()=>{
  const {clearArrival}=await import('../lib/city/movement.ts');
  const obstacle={x:18,z:116,rx:1.1,rz:2.45,shape:'box',yaw:.7};
  const arrival=clearArrival(18,116,[obstacle]);assert.ok(arrival);assert.ok(isWalkable(arrival.x,arrival.z,[obstacle]));
  const next=clearArrival(arrival.x,arrival.z,[obstacle]);assert.deepEqual(next,arrival);
});
