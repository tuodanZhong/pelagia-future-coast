import test from 'node:test';
import assert from 'node:assert/strict';
import {drivingVelocity,resolveVehicleCrash} from '../lib/city/vehicle-collision.ts';
const body=(z,speed,mass=1600)=>({x:0,z,yaw:0,length:4.9,width:2.2,mass,velocity:{x:0,z:speed}});
test('rear-end collision transfers momentum to the other car and loses energy',()=>{
  const a=body(0,14),b=body(4.95,0),r=resolveVehicleCrash(a,b);
  assert.ok(r.b.velocity.z>6);assert.ok(r.a.velocity.z<7);assert.ok(r.a.velocity.z<r.b.velocity.z);
  assert.ok(Math.abs(r.a.velocity.z+r.b.velocity.z-14)<1e-8);
  assert.ok(r.a.velocity.z**2+r.b.velocity.z**2<196);assert.equal(r.a.yawRate,0);assert.equal(a.velocity.z,14);
});
test('a heavier bus is displaced less and oncoming cars recoil in their own lanes',()=>{
  const bus=resolveVehicleCrash(body(0,14),body(4.95,0,10500));
  assert.ok(bus.b.velocity.z<4);assert.ok(bus.a.velocity.z<0);
  const opposing=resolveVehicleCrash(body(0,10),body(4.95,-10));
  assert.ok(opposing.a.velocity.z<0);assert.ok(opposing.b.velocity.z>0);
});
test('offset and side impacts create bounded spin without inventing momentum',()=>{
  const a=body(0,12),b={...body(4.95,0),x:1.25};
  const r=resolveVehicleCrash(a,b);assert.ok(Math.abs(r.a.yawRate)>.1);assert.ok(Math.abs(r.b.yawRate)>.1);
  assert.ok(Math.abs(r.a.yawRate)<=1.5&&Math.abs(r.b.yawRate)<=1.5);
  const side=resolveVehicleCrash({...body(0,0),x:-3,velocity:{x:8,z:2}},body(0,0));
  assert.ok(side.b.velocity.x>0);assert.ok(side.a.velocity.x<8);
});
test('separating cars do not bounce again and drift contributes world-side velocity',()=>{
  assert.equal(resolveVehicleCrash(body(0,-2),body(4.95,2)).impulse,0);
  assert.deepEqual(drivingVelocity({yaw:0,speed:8,lateralSpeed:3}),{x:-3,z:8});
  const v=drivingVelocity({yaw:Math.PI/2,speed:8,lateralSpeed:3});assert.ok(Math.abs(v.x-8)<1e-8&&Math.abs(v.z-3)<1e-8);
});
