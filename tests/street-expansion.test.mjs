import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Traffic,createTrafficRoute} from '../lib/city/traffic.ts';
import {createDrivingState,vehicleCollision} from '../lib/city/driving.ts';
import {buildWorld} from '../lib/city/world.ts';
import {SCHOOL} from '../lib/city/school.ts';
import {isWalkable} from '../lib/city/movement.ts';
import {createCityBus,BUS_METADATA,disposeCityBus} from '../lib/city/bus.ts';
const world=buildWorld(new THREE.Scene());
function trafficFixture(){
  const original=GLTFLoader.prototype.load;GLTFLoader.prototype.load=function(url,onLoad){onLoad({scene:new THREE.Group()});return this;};
  try{return new Traffic(new THREE.Scene(),new THREE.LoadingManager(),[...world.obstacles],()=>{});}finally{GLTFLoader.prototype.load=original;}
}
test('school gate, courtyard and bus-stop access remain walkable while classroom walls collide',()=>{
  assert.ok(isWalkable(SCHOOL.spawn.x,SCHOOL.spawn.z,world.obstacles));
  for(const points of [SCHOOL.accessWaypoints,SCHOOL.busStop.pedestrianAccess])for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];for(let j=0;j<=40;j++){const t=j/40;assert.ok(isWalkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,world.obstacles),`${i} ${t}`);}
  }
  assert.equal(isWalkable(0,-85,world.obstacles),false);
});
test('bus asset retains independent wheels, glazing and a bounded detailed body',()=>{
  const bus=createCityBus();let triangles=0;const materials=new Set();
  bus.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
  assert.ok(triangles>10000&&triangles<60000);assert.ok(materials.size<=14);
  for(const name of ['WheelFrontLeft','WheelFrontRight','WheelRearLeft','WheelRearRight'])assert.ok(bus.getObjectByName(name),name);
  const bounds=new THREE.Box3().setFromObject(bus);assert.ok(bounds.min.y>=-.001);assert.ok(bounds.max.y<=BUS_METADATA.body.height+.01);assert.ok(bounds.max.z-bounds.min.z>10);
  disposeCityBus(bus);
});
test('the full bus footprint fits both traffic routes and no initial vehicles overlap',()=>{
  for(const reverse of [false,true]){
    const route=createTrafficRoute(reverse);
    for(let i=0;i<800;i++){const p=route.getPointAt(i/800),t=route.getTangentAt(i/800).multiplyScalar(reverse?-1:1);assert.equal(vehicleCollision({x:p.x,z:p.z,yaw:Math.atan2(t.x,t.z),length:10.4,width:2.5},{obstacles:world.obstacles},.045),undefined,`${reverse} ${i}`);}
  }
  const traffic=trafficFixture();for(const c of traffic.cars)assert.equal(vehicleCollision({id:c.id,x:c.position.x,z:c.position.z,yaw:c.yaw,length:c.length??4.9,width:c.width??2.2},traffic.environment(c)),undefined,c.id);traffic.dispose();
});
test('both buses dwell, resume along the road, and reject player takeover',()=>{
  const traffic=trafficFixture(),buses=traffic.cars.filter(c=>c.model==='bus');assert.equal(buses.length,2);
  const starts=buses.map(c=>c.position.clone());
  for(const bus of buses){assert.equal(traffic.takeControl(bus),false);assert.equal(bus.drivable,false);}
  for(let i=0;i<50;i++)traffic.update(.1,new THREE.Vector3(140,0,140));
  buses.forEach((c,i)=>assert.ok(c.position.distanceTo(starts[i])<.001));
  for(let i=0;i<130;i++)traffic.update(.1,new THREE.Vector3(140,0,140));
  buses.forEach((c,i)=>assert.ok(c.position.distanceTo(starts[i])>1,c.id+' did not depart'));traffic.dispose();
});
test('driving into another actual vehicle pushes it off its route without passing through it',()=>{
  const traffic=trafficFixture();
  for(const [i,c] of traffic.cars.entries()){c.position.set(1000+i*20,0,1000);c.manual=createDrivingState({x:c.position.x,z:c.position.z,yaw:0});}
  const source=traffic.cars[0],target=traffic.cars[1];traffic.takeControl(source);
  source.manual=createDrivingState({x:48,z:0,yaw:0,speed:12});traffic.drive(0,{throttle:0,steer:0});
  target.position.set(48,.04,7);target.yaw=0;target.speed=0;target.manual=undefined;target.cruise=0;
  let collided=false;
  for(let i=0;i<90;i++){
    collided=traffic.drive(1/60,{throttle:1,steer:0})||collided;
    if(target.manual)traffic.update(1/60,new THREE.Vector3(140,0,140));
    assert.equal(vehicleCollision({id:source.id,x:source.position.x,z:source.position.z,yaw:source.yaw},{obstacles:[],vehicles:[{id:target.id,x:target.position.x,z:target.position.z,yaw:target.yaw}]}),undefined);
  }
  assert.ok(collided);assert.ok(target.manual);assert.ok(target.position.z>8,`hit car stayed at ${target.position.z}`);
  const displaced=target.position.clone();for(let i=0;i<180;i++)traffic.update(1/60,new THREE.Vector3(140,0,140));
  assert.ok(target.position.distanceTo(displaced)<15,'hit car snapped to old route');traffic.dispose();
});
