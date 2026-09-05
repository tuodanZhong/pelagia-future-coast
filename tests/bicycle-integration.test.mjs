import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildWorld} from '../lib/city/world.ts';
import {TrafficSignals} from '../lib/city/signals.ts';
import {Traffic} from '../lib/city/traffic.ts';
import {Bicycles} from '../lib/city/bicycles.ts';
import {vehicleCollision} from '../lib/city/driving.ts';
import {isWalkable} from '../lib/city/movement.ts';
import {applyVehicleImpact,createImpactState,sweepVehicleImpact} from '../lib/city/impact.ts';

test('all ten city bicycles allow mount, ride, brake, dismount and remount; impact colliders stay separate',()=>{
  const scene=new THREE.Scene(),world=buildWorld(scene);
  const signals=new TrafficSignals(scene,world.obstacles);
  const original=GLTFLoader.prototype.load;let traffic;
  GLTFLoader.prototype.load=function(_url,onLoad){onLoad({scene:new THREE.Group()});return this;};
  try{traffic=new Traffic(scene,new THREE.LoadingManager(),world.obstacles,()=>{});}finally{GLTFLoader.prototype.load=original;}
  const bicycles=new Bicycles(scene,world.obstacles);
  traffic.externalObstacles=bicycles.obstaclesSet;
  try{
    assert.equal(bicycles.bikes.length,10,'a colliding candidate must not silently remove a bike');
    assert.equal(traffic.externalObstacles.size,10);
    for(const bike of bicycles.bikes){
      const saved={...bike.state};
      const environment={obstacles:world.obstacles.filter(o=>o!==bike.obstacle)};
      assert.equal(vehicleCollision({...bike.state,length:1.95,width:.64},environment,.025),undefined,bike.id+' must fit with the actual riding margin');
      let approach;
      for(let i=0;i<48;i++){
        const angle=i*Math.PI/24,p={x:saved.x+Math.sin(angle)*1.6,z:saved.z+Math.cos(angle)*1.6};
        if(isWalkable(p.x,p.z,world.obstacles)&&bicycles.nearest(p)===bike){approach=p;break;}
      }
      assert.ok(approach,bike.id+' must have a walkable mount point');
      bicycles.takeControl(bike);
      assert.ok(bicycles.exitPosition(),bike.id+' must also allow an immediate dismount');
      for(let i=0;i<120;i++){
        assert.equal(bicycles.drive(1/60,{throttle:1,steer:0}),false,bike.id+' must ride clear of its station');
        bicycles.update(bike.state);
      }
      assert.ok(Math.hypot(bike.state.x-saved.x,bike.state.z-saved.z)>4.7,bike.id+' did not ride out');
      for(let i=0;i<90;i++){bicycles.drive(1/60,{throttle:0,steer:0,brake:1});bicycles.update(bike.state);}
      assert.equal(bike.state.speed,0,bike.id+' did not stop');
      const exit=bicycles.exitPosition();assert.ok(exit,bike.id+' has no exit after riding');
      bicycles.release();const parked={x:bike.state.x,z:bike.state.z};
      for(let i=0;i<10;i++)bicycles.update(exit,true);
      assert.equal(bike.state.x,parked.x);assert.equal(bike.state.z,parked.z);
      assert.equal(bicycles.nearest(exit),bike,bike.id+' must remain usable from the dismount position');
      Object.assign(bike.state,saved);bicycles.update(approach,true);
    }
    // The existing traffic environment must expose these by identity, regardless of dimensions.
    for(const bike of bicycles.bikes)assert.ok(traffic.externalObstacles.has(bike.obstacle));
    const staticObstacles=traffic.environment().obstacles.filter(o=>!traffic.externalObstacles.has(o));
    for(const bike of bicycles.bikes)assert.equal(staticObstacles.includes(bike.obstacle),false);
    const bike=bicycles.bikes[9];
    const previous={...bicycles.poses().find(p=>p.id===bike.id),speed:6};
    bike.state.z+=1;bike.state.speed=6;bike.state.wheelRoll+=1/.34;bicycles.update(bike.state);
    const current=bicycles.poses().find(p=>p.id===bike.id);
    const person=createImpactState({x:bike.state.x,z:bike.state.z+.8,radius:.34});
    const contact=sweepVehicleImpact(previous,current,{...person,height:1.78},1/6);assert.ok(contact);
    const result=applyVehicleImpact(person,contact,current,{obstacles:staticObstacles,vehicles:[current]});
    assert.equal(result.blocked,false);assert.equal(result.applied,true);
    const duplicated=applyVehicleImpact(person,contact,current,{obstacles:[...staticObstacles,bike.obstacle],vehicles:[current]});
    assert.equal(duplicated.blocked,true,'regression setup must detect the old own-static-collider failure');
    bicycles.stopBeforeImpact(previous);bicycles.update(previous,true);
    assert.equal(bike.state.wheelRoll,previous.roll);assert.equal(bike.state.steer,previous.steer);
    assert.equal(bike.model.root.position.x,previous.x);assert.equal(bike.model.root.position.z,previous.z);
    assert.equal(bike.obstacle.x,previous.x);assert.equal(bike.obstacle.z,previous.z);
  }finally{
    signals.dispose();traffic.dispose();
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const g of geometries)g.dispose();for(const m of materials){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);m.dispose();}for(const t of textures)t.dispose();
  }
});
