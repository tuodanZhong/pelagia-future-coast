import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrivingState, stepDriving, vehicleCollision, findSafeExit, DEFAULT_DRIVING } from '../lib/city/driving.ts';

const EMPTY={obstacles:[]};
const idle={throttle:0,steer:0};
const drive=(start,input,seconds,environment=EMPTY,dt=1/60)=>{
  let state=createDrivingState(start),travel=0,hits=0;
  for(let t=0;t<seconds-1e-8;t+=dt){const result=stepDriving(state,input,Math.min(dt,seconds-t),environment);state=result.state;travel+=result.travel;hits+=Number(result.collided);}
  return {state,travel,hits};
};

test('forward and reverse reach their limits; +Z is forward, travel is signed',()=>{
  const forward=drive({x:0,z:0,yaw:0},{throttle:1,steer:0},6);
  assert.ok(forward.state.speed>13.9&&forward.state.speed<=14);
  assert.ok(forward.state.z>45&&Math.abs(forward.state.x)<1e-9);
  assert.ok(Math.abs(forward.travel-forward.state.z)<1e-8);
  const reverse=drive({x:0,z:0,yaw:0},{throttle:-1,steer:0},3);
  assert.ok(reverse.state.speed>=-4&&reverse.state.speed<-3.9);
  assert.ok(reverse.state.z<0&&reverse.travel<0);
});

test('opposite throttle brakes before reverse, brake holds at zero',()=>{
  let state=createDrivingState({x:0,z:0,yaw:0,speed:10});
  const first=stepDriving(state,{throttle:-1,steer:0},.25,EMPTY);assert.ok(first.state.speed>7&&first.state.speed<10);assert.ok(first.travel>0);
  const reversed=drive(first.state,{throttle:-1,steer:0},2);assert.ok(reversed.state.speed<0);
  state=drive({x:0,z:0,yaw:0,speed:8},{throttle:-1,steer:0,brake:1},2).state;
  assert.equal(state.speed,0);
  assert.equal(stepDriving(state,{throttle:-1,steer:0,brake:1},.1,EMPTY).state.speed,0);
});

test('steering follows bicycle direction while reversing and auto-centres',()=>{
  const forward=drive({x:0,z:0,yaw:0,speed:3},{throttle:1,steer:1},.7);
  assert.ok(forward.state.yaw>.1&&forward.state.x>0);assert.ok(forward.state.steer>0);
  const reverse=drive({x:0,z:0,yaw:0,speed:-3},{throttle:-1,steer:1},.7);
  assert.ok(reverse.state.yaw<-.1&&reverse.state.x<0);
  const centred=drive(forward.state,idle,.5);assert.equal(centred.state.steer,0);
});

test('full steering automatically reduces speed for the turning radius',()=>{
  const result=drive({x:0,z:0,yaw:0,speed:14},{throttle:1,steer:1},4);
  const limit=Math.sqrt(DEFAULT_DRIVING.maxLateralAcceleration*DEFAULT_DRIVING.wheelbase/Math.tan(DEFAULT_DRIVING.maxSteer));
  assert.ok(result.state.speed<=limit+.01,`${result.state.speed} > ${limit}`);
});

test('all four corners stay on dry land, including a diagonal car',()=>{
  assert.equal(vehicleCollision({x:142,z:0,yaw:0},EMPTY),undefined);
  assert.equal(vehicleCollision({x:144,z:0,yaw:0},EMPTY)?.kind,'world-edge');
  assert.equal(vehicleCollision({x:142.6,z:0,yaw:Math.PI/4},EMPTY)?.kind,'world-edge');
  const result=drive({x:0,z:139,yaw:0,speed:14},{throttle:1,steer:0},1);
  assert.ok(result.hits>0);assert.ok(result.state.z<145-2.45);assert.equal(result.state.speed,0);
});

test('a thin wall cannot be crossed by high speed or a capped long frame',()=>{
  const environment={obstacles:[{x:0,z:5,rx:20,rz:.005,shape:'box'}]};
  const result=stepDriving(createDrivingState({x:0,z:0,yaw:0,speed:14}),{throttle:1,steer:0},3,environment);
  assert.equal(result.collided,true);assert.equal(result.collision.kind,'obstacle');
  assert.ok(result.state.z<2.51);assert.equal(result.state.speed,0);
  assert.equal(vehicleCollision(result.state,environment),undefined);
  const escape=drive(result.state,{throttle:-1,steer:0},1,environment);
  assert.ok(escape.state.z<result.state.z-.5);assert.ok(escape.state.speed<0);
});

test('ellipse collisions include long edges and a contained small pool',()=>{
  const car={x:0,z:0,yaw:0};
  assert.equal(vehicleCollision(car,{obstacles:[{x:0,z:0,rx:.1,rz:.1}]}).kind,'obstacle');
  assert.equal(vehicleCollision(car,{obstacles:[{x:1.2,z:0,rx:.11,rz:.2}]}).kind,'obstacle');
  assert.equal(vehicleCollision(car,{obstacles:[{x:1.5,z:0,rx:.11,rz:.2}]}),undefined);
  const ellipse={x:6,z:6,rx:3,rz:1.2};
  const result=drive({x:6,z:0,yaw:0,speed:14},{throttle:1,steer:0},1,{obstacles:[ellipse]});
  assert.ok(result.hits>0);assert.equal(vehicleCollision(result.state,{obstacles:[ellipse]}),undefined);
});

test('oriented car SAT avoids AABB false positives and detects true intersections',()=>{
  const yaw=Math.PI/4,a={id:'self',x:0,z:0,yaw};
  const other={id:'other',x:Math.cos(yaw)*2.3,z:-Math.sin(yaw)*2.3,yaw};
  assert.equal(vehicleCollision(a,{obstacles:[],vehicles:[a,other]}),undefined);
  other.x*=.8;other.z*=.8;
  assert.equal(vehicleCollision(a,{obstacles:[],vehicles:[a,other]})?.id,'other');
  const lead={id:'lead',x:0,z:8,yaw:Math.PI};
  const result=drive({x:0,z:0,yaw:0,speed:14},{throttle:1,steer:0},1,{obstacles:[],vehicles:[lead]});
  assert.ok(result.hits>0);assert.ok(result.state.z<3.1);assert.equal(result.state.speed,0);
});

test('self filtering is explicit, and unnamed other cars remain collidable',()=>{
  const car={id:3,x:0,z:0,yaw:0};
  assert.equal(vehicleCollision(car,{obstacles:[],vehicles:[car]}),undefined);
  assert.equal(vehicleCollision(car,{obstacles:[],vehicles:[{x:0,z:0,yaw:0}]})?.kind,'vehicle');
  assert.equal(vehicleCollision({x:0,z:0,yaw:0},{obstacles:[],vehicles:[car],ignoreVehicleId:3}),undefined);
});

test('safe exits prefer driver side, avoid the car, and fall back away from a wall',()=>{
  const car={id:'self',x:0,z:0,yaw:0};
  const preferred=findSafeExit(car,{obstacles:[],vehicles:[car]});
  assert.equal(preferred.side,'left');assert.ok(preferred.x<-1.44);assert.equal(preferred.yaw,0);
  const blockedLeft={obstacles:[{x:-2,z:0,rx:.7,rz:5,shape:'box'}],vehicles:[car]};
  assert.equal(findSafeExit(car,blockedLeft)?.side,'right');
  const blockedBoth={...blockedLeft,obstacles:[...blockedLeft.obstacles,{x:2,z:0,rx:.7,rz:5,shape:'box'}]};
  assert.equal(findSafeExit(car,blockedBoth),undefined);
  const atEdge={id:'edge',x:143.7,z:0,yaw:0,width:2.2};
  assert.equal(findSafeExit(atEdge,EMPTY,{side:'right'})?.side,'left');
});

test('exit cannot place a pedestrian inside other vehicles or an ellipse',()=>{
  const car={id:'self',x:0,z:0,yaw:Math.PI/4};
  const exit=findSafeExit(car,{obstacles:[],vehicles:[car]});assert.ok(exit);
  assert.equal(vehicleCollision({...exit,width:.68,length:.68},{obstacles:[],vehicles:[car]}),undefined);
  const blocker={x:exit.x,z:exit.z,rx:1.2,rz:3};
  const alternative=findSafeExit(car,{obstacles:[blocker],vehicles:[car]});
  assert.ok(alternative);assert.equal(alternative.side,'right');
});

test('motion stays finite, does not mutate arguments, and is frame-rate independent',()=>{
  const start=createDrivingState({x:0,z:0,yaw:.2,speed:2}),copy={...start};
  const a=drive(start,{throttle:1,steer:.4},2,EMPTY,1/30),b=drive(start,{throttle:1,steer:.4},2,EMPTY,1/120);
  assert.ok(Math.hypot(a.state.x-b.state.x,a.state.z-b.state.z)<.06);assert.ok(Math.abs(a.state.yaw-b.state.yaw)<.01);
  assert.deepEqual(start,copy);
  const zero=stepDriving(start,idle,0,EMPTY);assert.deepEqual(zero.state,start);assert.equal(zero.travel,0);
  const invalid=stepDriving({...start,speed:NaN},{throttle:Infinity,steer:NaN},NaN,EMPTY);
  assert.ok(Object.values(invalid.state).every(Number.isFinite));
});
