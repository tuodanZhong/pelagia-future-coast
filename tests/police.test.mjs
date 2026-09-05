import test from 'node:test';
import assert from 'node:assert/strict';
import {WantedController,planPoliceRoute,drivePoliceInput} from '../lib/city/police-logic.ts';
import {stepDriving,createDrivingState,vehicleCollision} from '../lib/city/driving.ts';
const player={x:0,z:0,speed:0},near={x:0,z:20,yaw:0,speed:0},far={x:120,z:120,yaw:0,speed:0};
function advance(w,seconds,p=player,cops=[far],start=0){let state;for(let t=.25;t<=seconds+1e-8;t+=.25)state=w.update(.25,start+t,p,cops);return state;}
test('distinct offenses raise three wanted levels while repeated contact is throttled',()=>{
 const w=new WantedController();assert.equal(w.offense('assault',0,'npc1'),true);assert.equal(w.state.level,1);assert.equal(w.offense('assault',.1,'npc1'),false);
 w.offense('assault',.7,'npc1');assert.equal(w.state.level,2);w.offense('npc-impact',1,'npc2');assert.equal(w.state.level,3);assert.ok(w.state.heat<=100);
 const touch=new WantedController();for(let i=0;i<240;i++)touch.offense('car-collision',i/100,'same-car');assert.equal(touch.state.heat,12);assert.equal(touch.offense('car-collision',2.5,'same-car'),true);assert.equal(touch.state.heat,24);
});
test('twenty-five active far seconds clear wanted; renewed proximity restarts the search timer',()=>{
 const w=new WantedController();w.offense('car-collision',0);let s=advance(w,24.75);assert.equal(s.searching,true);assert.equal(s.level,1);assert.ok(s.remaining<.26);
 s=w.update(.25,25,player,[near]);assert.equal(s.remaining,25);assert.equal(s.searching,false);s=advance(w,25,player,[far],25);assert.equal(s.level,0);assert.equal(s.arrested,false);
});
test('pause dt=0 freezes both escape and arrest instead of clearing wanted',()=>{
 const w=new WantedController();w.offense('assault',0);advance(w,8);const before=w.state;
 for(let i=0;i<100;i++)w.update(0,9+i,player,[far]);assert.deepEqual(w.state,before);
 const close={x:0,z:3,yaw:0,speed:0};w.update(.25,109,player,[close]);const hold=w.state;w.update(0,300,player,[close]);assert.deepEqual(w.state,hold);assert.equal(w.state.level,1);
});
test('a moving offender or moving police car cannot be arrested; capture requires three uninterrupted seconds',()=>{
 const w=new WantedController(),cop={x:0,z:3.3,yaw:0,speed:0};w.offense('assault',0);
 assert.equal(advance(w,2.5,player,[cop]).arrested,false);w.update(.25,2.75,{...player,speed:1},[cop]);assert.equal(w.state.arrestProgress,0);
 advance(w,2.5,player,[cop],2.75);assert.equal(w.state.arrested,false);w.update(.25,5.5,player,[{...cop,speed:2.1}]);assert.equal(w.state.arrestProgress,0);
 const s=advance(w,3,player,[cop],5.5);assert.equal(s.arrested,true);assert.equal(s.level,0);assert.equal(s.arrestProgress,1);assert.equal(w.offense('assault',10),false);
 w.reset();assert.equal(w.offense('assault',0),true,'explicit new-session reset accepts a fresh clock');
});
test('vehicle capture uses bumper-safe 6.5m range while on-foot range stays 3.4m',()=>{
 const cop={x:0,z:6.2,yaw:0,speed:0},w=new WantedController();w.offense('assault',0);assert.equal(advance(w,3,player,[cop]).arrestProgress,0);
 assert.equal(advance(w,3,{...player,vehicle:true},[cop],3).arrested,true);
 const disabled=new WantedController();disabled.offense('assault',0);assert.equal(advance(disabled,4,{...player,vehicle:true},[{...cop,canArrest:false}]).arrested,false);
});
test('unseen target uses last-known location; a new offense updates that location on the next tick',()=>{
 const w=new WantedController();w.offense('assault',0);w.update(.1,.1,player,[near]);const known=w.state.lastKnown;
 w.update(.1,.2,{x:-60,z:-60,speed:8},[far]);assert.deepEqual(w.state.lastKnown,known);
 w.offense('car-collision',1);w.update(.1,1.1,{x:-70,z:-70,speed:8},[far]);assert.deepEqual(w.state.lastKnown,{x:-70,z:-70});const state=w.state;w.update(.2,.5,player,[near]);assert.deepEqual(w.state,state,'stale simulation updates are ignored');
});
test('police route follows open corridors around buildings and the actual bicycle model reaches its goal',()=>{
 const environment={obstacles:[{x:0,z:0,rx:30,rz:31,shape:'box'}]},start={x:-48,z:-48,yaw:0,speed:0},target={x:48,z:48};
 const route=planPoliceRoute(start,target,environment);assert.ok(route.points.length>=3);assert.equal(route.reachesTarget,true);
 let state=createDrivingState(start);for(let i=0;i<6000;i++){const result=stepDriving(state,drivePoliceInput(state,route),1/60,environment);assert.equal(result.collided,false);state=result.state;}
 assert.ok(Math.hypot(state.x-target.x,state.z-target.z)<3.4);assert.ok(Math.abs(state.speed)<.1);
});
test('unreachable water/building targets stop at a safe land position and dynamic vehicles do not contaminate static routing',()=>{
 const environment={obstacles:[{x:0,z:0,rx:20,rz:20,shape:'box'}],vehicles:[{id:'parked',x:-48,z:-24,yaw:0}]},start={x:-48,z:-48,yaw:0,speed:0};
 for(const target of [{x:0,z:0},{x:175,z:72}]){const route=planPoliceRoute(start,target,environment);assert.ok(route.points.length>1);assert.equal(route.reachesTarget,false);assert.equal(vehicleCollision({...route.goal,yaw:0},{obstacles:environment.obstacles}),undefined);assert.ok(Math.abs(route.goal.x)<143&&Math.abs(route.goal.z)<143);}
 const road=planPoliceRoute(start,{x:-48,z:36},environment),without=planPoliceRoute(start,{x:-48,z:36},{obstacles:environment.obstacles});assert.deepEqual(road,without);
});
test('pursuit steering preserves driver-side convention at four headings and brakes near the goal',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const right of [-1,1]){
  const cop={x:0,z:0,yaw,speed:4},goal={x:Math.sin(yaw)*15-Math.cos(yaw)*right*5,z:Math.cos(yaw)*15+Math.sin(yaw)*right*5};
  const input=drivePoliceInput(cop,{points:[{x:0,z:0},goal],goal,reachesTarget:true,length:16});assert.ok(input.steer*right>0);
  assert.equal(drivePoliceInput({...cop,...goal},{points:[{x:0,z:0},goal],goal,reachesTarget:true,length:16}).brake,1);
 }
});
