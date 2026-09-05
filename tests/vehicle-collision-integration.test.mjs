import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Traffic} from '../lib/city/traffic.ts';
import {createDrivingState,vehicleCollision} from '../lib/city/driving.ts';
import {drivingVelocity} from '../lib/city/vehicle-collision.ts';
const player=new THREE.Vector3(200,0,200),input={throttle:1,steer:0};
function fixture(){
  const original=GLTFLoader.prototype.load,obstacles=[];
  GLTFLoader.prototype.load=function(_url,onLoad){onLoad({scene:new THREE.Group()});return this;};
  let traffic;try{traffic=new Traffic(new THREE.Scene(),new THREE.LoadingManager(),obstacles,()=>{});}finally{GLTFLoader.prototype.load=original;}
  const a=traffic.cars[0],b=traffic.cars[1];traffic.cars.splice(0,traffic.cars.length,a,b);obstacles.length=0;obstacles.push(a.obstacle,b.obstacle);
  a.model='rover';b.model='rover';return {traffic,a,b};
}
function place(traffic,car,x,z,yaw,speed=0,manual=false){
  car.position.set(x,.04,z);car.yaw=yaw;car.speed=speed;car.parked=undefined;
  car.manual=manual?createDrivingState({x,z,yaw,speed}):undefined;traffic.place(car);
}
function clear(traffic){for(const c of traffic.cars)assert.equal(vehicleCollision({id:c.id,x:c.position.x,z:c.position.z,yaw:c.yaw,length:c.length??4.9,width:c.width??2.2},traffic.environment(c)),undefined,'crash response must not overlap another car');}

test('actual Traffic crash injects world momentum in each heading and the struck vehicle coasts',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const {traffic,a,b}=fixture(),f=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    place(traffic,a,20,20,yaw,12);place(traffic,b,20+f.x*5.2,20+f.z*5.2,yaw,0,true);traffic.takeControl(a);
    const origin=b.position.clone();assert.ok(traffic.drive(.1,{throttle:0,steer:0}));
    const velocity=drivingVelocity(b.manual);assert.ok(velocity.x*f.x+velocity.z*f.z>6,'recipient gets forward impact velocity');
    assert.ok(Math.abs(velocity.x*f.z-velocity.z*f.x)<1e-7,'head-on contact adds no side impulse');
    assert.ok(a.speed<6);assert.ok(Math.abs(b.manual.yawRate)<1e-7);clear(traffic);
    traffic.releaseControl();for(let i=0;i<30;i++){traffic.update(1/60,player);clear(traffic);}
    assert.ok(b.position.clone().sub(origin).dot(f)>1.2);traffic.dispose();
  }
});

test('an impacted live AI car leaves its route permanently and settles at its new position',()=>{
  const {traffic,a,b}=fixture(),origin=b.position.clone(),distance=b.distance,yaw=b.yaw;
  const f=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  place(traffic,a,origin.x-f.x*5.25,origin.z-f.z*5.25,yaw,14);traffic.takeControl(a);
  assert.equal(b.manual,undefined);assert.ok(traffic.drive(.1,input));assert.ok(b.manual);
  traffic.releaseControl();for(let i=0;i<600;i++){traffic.update(1/60,player);clear(traffic);}
  assert.equal(b.distance,distance,'route clock must not resume');assert.ok(b.position.distanceTo(origin)>2);
  const settled=b.position.clone();for(let i=0;i<120;i++)traffic.update(1/60,player);
  assert.ok(b.position.distanceTo(settled)<1e-5,'settled off-route car remains parked');traffic.dispose();
});

test('side impact applies correct lateral momentum and bounded angular response',()=>{
  const {traffic,a,b}=fixture();place(traffic,a,16.1,21,Math.PI/2,10);place(traffic,b,20,20,0,0,true);traffic.takeControl(a);
  assert.ok(traffic.drive(.1,{throttle:0,steer:0}));const velocity=drivingVelocity(b.manual);
  assert.ok(velocity.x>1,'side hit transfers world +X velocity');assert.ok(b.manual.lateralSpeed<0,'+X is driver-left at yaw zero');
  assert.ok(Math.abs(b.manual.yawRate)>.1&&Math.abs(b.manual.yawRate)<=1.5);clear(traffic);
  traffic.releaseControl();traffic.update(1/60,player);assert.ok(b.position.x>20,'received lateral impulse survives next update');clear(traffic);traffic.dispose();
});

test('continuous throttle at rest pushes a touching free car instead of losing every substep impulse',()=>{
  for(const hz of [30,60,120]){
    const {traffic,a,b}=fixture();place(traffic,a,20,0,0);place(traffic,b,20,4.9451,0);b.parked=b.position.clone();traffic.takeControl(a);
    const start=b.position.z;for(let i=0;i<hz*5;i++){traffic.drive(1/hz,input);traffic.update(1/hz,player);clear(traffic);}
    assert.ok(b.manual,`at ${hz}Hz stationary contact must receive low-speed impulse`);
    assert.ok(b.position.z-start>.5,`at ${hz}Hz continuous contact must move the other car`);traffic.dispose();
  }
});

test('same-speed close following retains momentum when predicted static contact has no positive closing speed',()=>{
  const {traffic,a,b}=fixture();place(traffic,a,20,0,0,8);place(traffic,b,20,4.9451,0,8,true);traffic.takeControl(a);
  traffic.drive(1/60,{throttle:0,steer:0});assert.equal(traffic.lastCrash,0);
  assert.ok(a.speed>7.9,'8m/s equal-speed following must not become a full stop');clear(traffic);traffic.dispose();
});
