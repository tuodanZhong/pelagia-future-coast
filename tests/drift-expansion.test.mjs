import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrivingState,stepDriving,vehicleCollision,drivingVelocity,drivingCollisionImpact} from '../lib/city/driving.ts';
const OPEN={obstacles:[],worldEdge:10000};
function run(start,input,seconds,environment=OPEN,dt=1/60){
  let state=createDrivingState(start),result,travel=0;
  for(let t=0;t<seconds-1e-9;t+=dt){result=stepDriving(state,input,Math.min(dt,seconds-t),environment);state=result.state;travel+=result.travel;}
  return {...result,state,travel};
}
const length=state=>Math.hypot(state.speed,state.lateralSpeed??0);

test('Shift boost raises forward speed to 24 m/s and accelerates harder than normal',()=>{
  const start={x:0,z:0,yaw:0},normal=run(start,{throttle:1,steer:0},2),boosted=run(start,{throttle:1,steer:0,boost:true},2);
  assert.ok(boosted.state.speed>normal.state.speed+3);
  const top=run(start,{throttle:1,steer:0,boost:true},10);assert.ok(top.state.speed>23.9&&top.state.speed<=24);
  const reverse=run(start,{throttle:-1,steer:0,boost:true},4);assert.ok(reverse.state.speed>=-4&&reverse.state.speed<-3.9);
});

test('releasing boost keeps momentum for the first frame and smoothly returns to cruise speed',()=>{
  const state=run({x:0,z:0,yaw:0},{throttle:1,steer:0,boost:true},10).state;
  const first=stepDriving(state,{throttle:1,steer:0,boost:false},1/60,OPEN);
  assert.ok(first.state.speed>23.5);assert.ok(state.speed-first.state.speed<.2);
  const restored=run(first.state,{throttle:1,steer:0,boost:false},3);
  assert.ok(restored.state.speed<=14.05&&restored.state.speed>=13.9);assert.equal(restored.state.boostBlend,0);
});

test('handbrake with a steering input retains world momentum while the vehicle body yaws',()=>{
  const state=run({x:0,z:0,yaw:0,speed:12},{throttle:1,steer:1,handbrake:true},1).state;
  assert.ok(state.z>9);assert.ok(state.yaw<-.8);assert.ok(Math.abs(state.lateralSpeed)>5);
  const velocity=drivingVelocity(state),heading=Math.atan2(velocity.x,velocity.z);
  assert.ok(Math.abs(heading-state.yaw)>.6,'trajectory should visibly differ from the body heading');
  assert.ok(length(state)>7,'the car must slide through space rather than spin in place');
});

test('left and right drift initiation stay correct at all four world headings',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const command of [-1,1]){
    const state=run({x:0,z:0,yaw,speed:12},{throttle:1,steer:command,handbrake:true},.8).state;
    const change=Math.atan2(Math.sin(state.yaw-yaw),Math.cos(state.yaw-yaw));
    assert.ok(change*command<-.5);assert.ok(state.steer*command>0);
    const driverRight=-Math.cos(yaw)*state.x+Math.sin(yaw)*state.z;assert.ok(driverRight*command>0);
  }
});

test('counter-steering catches a slide and releasing the handbrake progressively restores grip',()=>{
  const entry=run({x:0,z:0,yaw:0,speed:12},{throttle:1,steer:1,handbrake:true},.8).state;
  const caught=run(entry,{throttle:1,steer:-1,handbrake:true},.8).state;
  assert.ok(caught.yawRate>0);assert.ok(Math.abs(caught.lateralSpeed)<Math.abs(entry.lateralSpeed));
  const first=stepDriving(entry,{throttle:1,steer:0,handbrake:false},1/60,OPEN).state;
  assert.ok(Math.abs(first.lateralSpeed)>4,'grip cannot erase lateral momentum in one frame');
  const recovered=run(first,{throttle:1,steer:0,handbrake:false},2).state;
  assert.equal(recovered.drift,0);assert.ok(Math.abs(recovered.lateralSpeed)<.04);assert.ok(Math.abs(recovered.yawRate)<.025);
});

test('handbrake without steering does not spin, and stopped handbrake cannot pivot in place',()=>{
  const straight=run({x:0,z:0,yaw:0,speed:12},{throttle:0,steer:0,handbrake:true},1).state;
  assert.ok(straight.z>7);assert.equal(straight.yaw,0);assert.equal(straight.lateralSpeed,0);
  const stopped=run({x:0,z:0,yaw:0},{throttle:1,steer:1,handbrake:true},2).state;
  assert.equal(stopped.speed,0);assert.equal(stopped.x,0);assert.equal(stopped.z,0);assert.equal(stopped.yaw,0);
});

test('full brake overrides boost, reverse throttle and handbrake, stopping all momentum',()=>{
  let state=createDrivingState({x:0,z:0,yaw:0,speed:12,lateralSpeed:-6,yawRate:-.8,drift:1,boostBlend:1});
  let before=length(state);
  for(let i=0;i<180;i++){
    state=stepDriving(state,{throttle:-1,steer:1,boost:true,handbrake:true,brake:1},1/60,OPEN).state;
    assert.ok(length(state)<=before+1e-8);assert.ok(state.speed>=-.00001);before=length(state);
  }
  assert.equal(state.speed,0);assert.equal(state.lateralSpeed,0);assert.equal(state.yawRate,0);assert.equal(state.drift,0);
});

test('externally supplied sideways and angular collision momentum is preserved then damped',()=>{
  const state=createDrivingState({x:0,z:0,yaw:0,speed:4,lateralSpeed:5,yawRate:1,drift:.2});
  const first=stepDriving(state,{throttle:0,steer:0},1/60,OPEN).state;
  assert.ok(first.lateralSpeed>4);assert.ok(first.yawRate>.8);assert.ok(first.x<-.06);
  const settled=run(first,{throttle:0,steer:0},2).state;assert.ok(Math.abs(settled.lateralSpeed)<.04);assert.ok(Math.abs(settled.yawRate)<.025);
});

test('boost cannot cross a thin wall and reports pre-collision world momentum and contact',()=>{
  const env={obstacles:[{x:0,z:5,rx:10,rz:.005,shape:'box'}]};
  const result=stepDriving(createDrivingState({x:0,z:0,yaw:0,speed:24,boostBlend:1}),{throttle:1,steer:0,boost:true},.25,env);
  assert.equal(result.collided,true);assert.equal(result.collision.kind,'obstacle');assert.ok(result.state.z<2.51);
  assert.equal(result.state.speed,0);assert.equal(result.state.lateralSpeed,0);assert.equal(result.state.yawRate,0);
  assert.ok(result.impact.velocity.z>23.5);assert.ok(result.impact.normal.z<-.99);assert.ok(result.impact.speed>23.5);
  assert.ok(Math.abs(result.impact.point.z-5)<.08);assert.equal(vehicleCollision(result.state,env),undefined);
});

test('high lateral drift cannot cross a side wall or island boundary',()=>{
  const start={x:0,z:0,yaw:0,speed:0,lateralSpeed:20,yawRate:0,drift:1},env={obstacles:[{x:-4,z:0,rx:.005,rz:10,shape:'box'}]};
  const result=stepDriving(createDrivingState(start),{throttle:0,steer:0},.25,env);
  assert.equal(result.collided,true);assert.ok(result.state.x>-2.95);assert.ok(result.impact.velocity.x<-10);assert.ok(result.impact.normal.x>.99);
  const edge=stepDriving(createDrivingState({...start,x:-142}),{throttle:0,steer:0},.25,{obstacles:[]});
  assert.equal(edge.collision?.kind,'world-edge');assert.ok(edge.state.x>=-143.9);assert.ok(edge.impact.normal.x>.99);
});

test('rotated static boxes stop the car with the physical face normal',()=>{
  const env={obstacles:[{x:0,z:6,rx:6,rz:.02,shape:'box',yaw:Math.PI/4}]};
  const result=stepDriving(createDrivingState({x:0,z:0,yaw:0,speed:24,boostBlend:1}),{throttle:1,steer:0,boost:true},.25,env);
  assert.equal(result.collided,true);assert.ok(result.impact.normal.x<-.65&&result.impact.normal.z<-.65);
  assert.equal(vehicleCollision(result.state,env),undefined);
});

test('vehicle contact honors long bus dimensions and reports the other vehicle id',()=>{
  const env={obstacles:[],vehicles:[{id:'bus',x:0,z:12,yaw:0,length:11,width:2.5}]};
  const result=stepDriving(createDrivingState({x:0,z:0,yaw:0,speed:24,boostBlend:1}),{throttle:1,steer:0,boost:true},.25,env);
  assert.equal(result.collision?.id,'bus');assert.ok(result.state.z<4.1);assert.ok(result.impact.normal.z<-.99);
  assert.ok(result.impact.point.z>6.4&&result.impact.point.z<6.6);assert.ok(result.impact.speed>23);
});

test('an offset bus side contact stays on the overlapping face instead of the bus centre',()=>{
  const env={obstacles:[],vehicles:[{id:'bus',x:0,z:0,yaw:0,width:2.5,length:11}]};
  const impact=drivingCollisionImpact({x:2.34,z:-5.1,yaw:0},{kind:'vehicle',index:0,id:'bus'},env,{x:-8,z:0},.2);
  assert.ok(impact.normal.x>.99);assert.ok(impact.point.x>1.2&&impact.point.x<1.3);
  assert.ok(impact.point.z>=-5.5&&impact.point.z<=-2.65);assert.equal(impact.speed,8);assert.equal(impact.yawRate,.2);
});

test('ellipse and rotated ellipse collision helpers return finite outward unit normals',()=>{
  for(const yaw of [0,.7]){
    const env={obstacles:[{x:0,z:5,rx:4,rz:1.5,yaw}]};
    const result=stepDriving(createDrivingState({x:0,z:0,yaw:0,speed:24,boostBlend:1}),{throttle:1,steer:0,boost:true},.25,env);
    assert.equal(result.collided,true);assert.ok(Math.abs(Math.hypot(result.impact.normal.x,result.impact.normal.z)-1)<1e-8);
    assert.ok(result.impact.normal.z<0);assert.equal(vehicleCollision(result.state,env),undefined);
  }
});

test('drift remains frame-rate stable and does not mutate legacy input objects',()=>{
  const start={x:0,z:0,yaw:0,speed:12},copy={...start};
  const a=run(start,{throttle:1,steer:1,handbrake:true},1,OPEN,1/30),b=run(start,{throttle:1,steer:1,handbrake:true},1,OPEN,1/120);
  assert.ok(Math.hypot(a.state.x-b.state.x,a.state.z-b.state.z)<.06);assert.ok(Math.abs(a.state.yaw-b.state.yaw)<.01);assert.deepEqual(start,copy);
  const normal=stepDriving(createDrivingState(start),{throttle:1,steer:0},1/60,OPEN).state;
  assert.deepEqual(Object.keys(normal).sort(),['speed','steer','x','yaw','z']);
  assert.ok(Object.values(a.state).every(Number.isFinite));
});
