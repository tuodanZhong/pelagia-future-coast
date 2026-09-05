import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWorld } from '../lib/city/world.ts';
import { isWalkable, moveWithCollisions } from '../lib/city/movement.ts';
import { MARINA, stepBoat, boatFree, BOAT_SIZE } from '../lib/city/waterfront.ts';
import { Yachts } from '../lib/city/yachts.ts';
import { createBikeState, stepBike } from '../lib/city/bicycle-motion.ts';
import { vehicleCollision } from '../lib/city/driving.ts';

const boat=(x=250,z=0,yaw=0)=>({x,z,yaw,speed:0,steer:0,vx:0,vz:0,yawRate:0});
const input={throttle:1,steer:0,brake:false,boost:false};
test('marina has a continuous walkable gangway and fingers, while adjacent water remains blocked',()=>{
  const world=buildWorld(new THREE.Scene());
  let p={x:143.5,z:72};for(let i=0;i<128;i++)p=moveWithCollisions(p.x,p.z,.25,0,world.obstacles);
  assert.ok(p.x>=175.3&&p.x<=176);assert.ok(isWalkable(MARINA.spawn.x,MARINA.spawn.z,world.obstacles));
  assert.equal(isWalkable(148,65,world.obstacles),false);assert.equal(isWalkable(178,72,world.obstacles),false);
});
test('each real yacht is boardable, departs outward, stops and permits disembarkation only near a pier',()=>{
  const scene=new THREE.Scene(),world=buildWorld(scene),fleet=new Yachts(scene,world.obstacles);
  for(const b of fleet.boats){
    const p={x:174.6,z:b.berth};assert.equal(fleet.nearest(p),b);fleet.takeControl(b);assert.ok(fleet.exitPosition());
    assert.ok(boatFree(b.state,fleet.poses(),b.id));const start=b.state.x;
    for(let i=0;i<180;i++){assert.equal(fleet.drive(1/60,input),false);fleet.update(1/60,i/60);}
    assert.ok(b.state.x>start+4);assert.equal(fleet.exitPosition(),undefined);
    fleet.release(true);fleet.update(0,4);fleet.takeControl(b);assert.ok(fleet.exitPosition());fleet.release();
  }
});
test('yachts obey left/right steering, water drag, brake and reverse',()=>{
  const run=(steer)=>{let s=boat();for(let i=0;i<180;i++)s=stepBoat(s,{...input,steer},1/60).state;return s;};
  const right=run(1),left=run(-1);assert.ok(right.x<250&&right.yaw<0);assert.ok(left.x>250&&left.yaw>0);
  let s=right;for(let i=0;i<360;i++)s=stepBoat(s,{...input,throttle:0,brake:true},1/60).state;assert.equal(s.speed,0);assert.ok(Math.hypot(s.vx,s.vz)<.001);
  for(let i=0;i<180;i++)s=stepBoat(s,{...input,throttle:-1},1/60).state;assert.ok(s.speed<-.5);
});
test('a fast yacht cannot pass into the island, pier, another boat, or the navigation boundary',()=>{
  for(const [start,others]of [[{...boat(166,0,-Math.PI/2),speed:14,vx:-14},[]],[{...boat(184,60,-Math.PI/2),speed:14,vx:-14},[]],[{...boat(250,0),speed:14,vz:14},[{id:'ahead',x:250,z:25,yaw:0,...BOAT_SIZE}]],[{...boat(520,0,Math.PI/2),speed:14,vx:14},[]]]){
    let s=start,hit=false;for(let i=0;i<200;i++){const r=stepBoat(s,{...input,boost:true},1/30,others);s=r.state;hit ||=r.collided;assert.ok(boatFree(s,others));}assert.ok(hit);
  }
});
test('bike left/right inputs are symmetric, braking never reverses, and thin barriers stop its full body',()=>{
  const run=(steer)=>{let s=createBikeState();for(let i=0;i<120;i++)s=stepBike(s,{throttle:1,steer},1/60).state;return s;};
  const a=run(-1),d=run(1);assert.ok(a.x>0&&d.x<0);assert.ok(Math.abs(a.x+d.x)<1e-7);
  let s=createBikeState({speed:10});for(let i=0;i<180;i++)s=stepBike(s,{throttle:-1,steer:0},1/60).state;assert.equal(s.speed,0);
  const r=stepBike(createBikeState({speed:12}),{throttle:1,steer:0},.25,{blocked:p=>!!vehicleCollision(p,{obstacles:[{x:0,z:2,rx:20,rz:.01,shape:'box'}]})});assert.ok(r.collided);assert.ok(r.state.z<1.03);assert.equal(r.state.speed,0);
});
