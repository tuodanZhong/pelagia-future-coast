import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PERSON_MODELS} from '../lib/city/population.ts';
import {sweepVehicleImpact,personVehicleDistance,separateFromVehicle,createImpactState,applyVehicleImpact,stepImpact,impactPositionFree,impactPoseTime,IMPACT_TIMING} from '../lib/city/impact.ts';
const EMPTY={obstacles:[]},pose=(x=0,z=0,yaw=0)=>({id:'car',x,z,yaw});
const advance=(state,seconds,env=EMPTY,dt=1/60)=>{for(let t=0;t<seconds-1e-9;t+=dt)state=stepImpact(state,Math.min(dt,seconds-t),env);return state;};

test('high-speed sweeps hit even when both endpoints are beyond a small person',()=>{
  const person={x:0,z:0,radius:.18};
  const contact=sweepVehicleImpact(pose(0,-35),pose(0,35),person,.05);
  assert.ok(contact);assert.ok(contact.time>0&&contact.time<1);
  assert.ok(contact.normal.z>.99);assert.ok(contact.speed>10);assert.ok(contact.knockback.y>0);
  assert.ok(personVehicleDistance(person,pose(0,-35))>0&&personVehicleDistance(person,pose(0,35))>0);
});
test('reverse impacts push backwards and translation side swipes push to the side',()=>{
  const reverse=sweepVehicleImpact(pose(0,7),pose(),{x:0,z:-2.5},.5);
  assert.ok(reverse);assert.ok(reverse.normal.z<-.99&&reverse.knockback.z<0);
  const side=sweepVehicleImpact(pose(-5,0),pose(),{x:1.2,z:0},.5);
  assert.ok(side);assert.ok(side.normal.x>.99&&side.knockback.x>0);
});
test('narrow side grazes are detected but genuinely clear parallel motion is not',()=>{
  assert.ok(sweepVehicleImpact(pose(0,-8),pose(0,8),{x:1.40,z:0},.5));
  assert.equal(sweepVehicleImpact(pose(0,-8),pose(0,8),{x:1.50,z:0},.5),undefined);
});
test('rotation alone sweeps a car corner into a person',()=>{
  const person={x:2,z:0};
  assert.ok(personVehicleDistance(person,pose())>0);
  const hit=sweepVehicleImpact(pose(),pose(0,0,Math.PI/2),person,.2);
  assert.ok(hit);assert.ok(hit.time>0&&hit.time<1);assert.ok(hit.vehicleSpeed>0);
});
test('seated people remain hittable; a cylinder fully above the roof is ignored',()=>{
  assert.ok(sweepVehicleImpact(pose(0,-5),pose(),{x:0,z:2.5,height:1.0,elevation:0},.5));
  assert.equal(sweepVehicleImpact(pose(0,-5),pose(),{x:0,z:2.5,height:1.8,elevation:3},.5),undefined);
});
test('a stationary car overlap is immediately pushed to its closest reachable surface',()=>{
  const car=pose(),person={x:.2,z:0},contact=sweepVehicleImpact(car,car,person,1/60);
  assert.ok(contact);assert.equal(contact.vehicleSpeed,0);
  const result=applyVehicleImpact(createImpactState(person),contact,car,{obstacles:[],vehicles:[car]});
  assert.equal(result.blocked,false);assert.equal(result.separated,true);
  assert.ok(result.state.x>1.44&&Math.abs(result.state.z)<1e-6);assert.ok(personVehicleDistance(result.state,car)>.02);
});
test('depenetration chooses the other side instead of pushing through a wall',()=>{
  const car=pose(),person={x:.25,z:0},wall={x:1.7,z:0,rx:.2,rz:8,shape:'box'};
  const result=separateFromVehicle(person,car,{obstacles:[wall],vehicles:[car]});
  assert.ok(result);assert.ok(result.x<-1.44);assert.ok(impactPositionFree(result,{obstacles:[wall],vehicles:[car]}));
});
test('fully trapped contacts explicitly ask the caller to stop the vehicle',()=>{
  const car=pose(),person={x:0,z:0},obstacles=[
    {x:1.35,z:0,rx:.15,rz:5,shape:'box'},{x:-1.35,z:0,rx:.15,rz:5,shape:'box'},
    {x:0,z:2.7,rx:5,rz:.15,shape:'box'},{x:0,z:-2.7,rx:5,rz:.15,shape:'box'},
  ];
  const result=applyVehicleImpact(createImpactState(person),sweepVehicleImpact(car,car,person,1/60),car,{obstacles,vehicles:[car]});
  assert.equal(result.blocked,true);assert.equal(result.separated,false);assert.deepEqual([result.state.x,result.state.z],[0,0]);
});
test('low-speed contact only shuffles the person, with no airborne/down state',()=>{
  const car=pose(),person={x:0,z:2.5},contact=sweepVehicleImpact(pose(0,-.1),car,person,.1);
  assert.ok(contact);assert.equal(contact.knockback.y,0);
  let state=applyVehicleImpact(createImpactState(person),contact,car,{obstacles:[],vehicles:[car]}).state;
  assert.equal(state.phase,'pushed');
  for(let i=0;i<60;i++){state=stepImpact(state,1/60,EMPTY);assert.equal(state.height,0);assert.notEqual(state.phase,'down');}
  assert.equal(state.phase,'none');assert.ok(state.z<3.5);
});
test('fast impact has ballistic flight, ground contact, down time and smooth recovery',()=>{
  const car=pose(),person={x:0,z:2.5},contact=sweepVehicleImpact(pose(0,-7),car,person,.5);
  let state=applyVehicleImpact(createImpactState(person),contact,car,EMPTY).state;
  const phases=new Set([state.phase]);let apex=0,largestTilt=0;
  for(let i=0;i<360;i++){state=stepImpact(state,1/60,EMPTY);phases.add(state.phase);apex=Math.max(apex,state.height);largestTilt=Math.max(largestTilt,state.tilt);assert.ok(state.height>=0);}
  assert.ok(apex>.8&&apex<2);assert.ok(largestTilt>1.4);assert.deepEqual([...phases],['airborne','down','recover','none']);assert.equal(state.tilt,0);
});
test('cooldown prevents repeated launches but never suppresses separation',()=>{
  const car=pose(),person={x:0,z:2.5},contact=sweepVehicleImpact(pose(0,-7),car,person,.5);
  let state=applyVehicleImpact(createImpactState(person),contact,car,EMPTY).state;
  state=stepImpact(state,.1,EMPTY);const age=state.time;
  const movingCar=pose(state.x,state.z),again=applyVehicleImpact(state,contact,movingCar,{obstacles:[],vehicles:[movingCar]});
  assert.equal(again.applied,false);assert.equal(again.separated,true);assert.equal(again.state.time,age);
  assert.ok(personVehicleDistance(again.state,movingCar)>.02);assert.ok(again.state.cooldown<IMPACT_TIMING.cooldown);
});
test('airborne horizontal travel cannot tunnel through a thin building wall',()=>{
  const wall={x:0,z:5,rx:10,rz:.01,shape:'box'},environment={obstacles:[wall]};
  let state={...createImpactState({x:0,z:0}),phase:'airborne',height:.1,vz:30,vy:5};
  state=advance(state,2,environment,.25);assert.ok(state.z<4.66);assert.ok(impactPositionFree(state,environment));
});
test('elliptical water and the island boundary block knockback',()=>{
  const pool={x:0,z:6,rx:5,rz:1.4},environment={obstacles:[pool]};
  const state={...createImpactState({x:0,z:0}),phase:'airborne',height:.1,vz:20,vy:5};
  const stopped=advance(state,1,environment);assert.ok(stopped.z<4.27);assert.ok(impactPositionFree(stopped,environment));
  const edge=advance({...state,x:144,z:0,vx:20,vz:0},1,EMPTY);assert.ok(edge.x<=144.660001);assert.ok(impactPositionFree(edge,EMPTY));
});
test('seat obstacle can be excluded for a seated hit without excluding nearby furniture',()=>{
  const chair={x:0,z:0,rx:.36,rz:.36},table={x:1.9,z:0,rx:.6,rz:.6};
  const environment={obstacles:[chair,table],ignoreObstacles:[chair]},car=pose();
  assert.ok(!impactPositionFree({x:0,z:0},{obstacles:[chair]}));
  const p=separateFromVehicle({x:0,z:0},car,environment);assert.ok(p);assert.ok(p.x<0);assert.ok(impactPositionFree(p,environment));
});
test('a moving car cannot continue occupying a person during cooldown recovery',()=>{
  const car=pose(),state={...createImpactState({x:0,z:0}),phase:'down',cooldown:.8,tilt:1.48};
  const next=stepImpact(state,1/60,{obstacles:[],vehicles:[car]});assert.ok(personVehicleDistance(next,car)>.02);assert.equal(next.phase,'down');
});
test('state remains finite and update does not mutate its input',()=>{
  const state={...createImpactState({x:0,z:0}),phase:'airborne',height:.1,vy:5,vx:4,vz:2},copy={...state};
  const a=advance(state,3,EMPTY,1/30),b=advance(state,3,EMPTY,1/120);
  assert.deepEqual(state,copy);assert.ok(Object.values(a).filter(v=>typeof v==='number').every(Number.isFinite));
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.03);assert.equal(a.phase,b.phase);
});

test('impact clips preserve every NPC bone length and have finite normalized rotations',()=>{
  for(const file of ['impact-air.json','impact-ground.json','impact-recover.json']){
    const clip=THREE.AnimationClip.parse(JSON.parse(readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8')));
    assert.equal(clip.tracks.length,21);
    for(const track of clip.tracks){
      assert.ok(track.name.endsWith('.quaternion'),file+' contains a position or scale override');
      for(let i=0;i<track.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)<.00001);
    }
  }
});
test('ground offsets cover the actual proportions of every loaded character and all fall phases',()=>{
  const profiles=JSON.parse(readFileSync(new URL('../public/assets/impact-grounding.json',import.meta.url),'utf8')).models;
  for(const model of PERSON_MODELS){
    const profile=profiles[model.id];assert.ok(profile,model.id);assert.equal(profile.height,model.height);assert.equal(profile.file,model.file);
    assert.ok(profile.pivot.every(Number.isFinite));
    for(const [phase,duration] of [['airborne',.70],['down',.55],['recover',.95]]){
      const samples=profile.samples[phase];assert.ok(samples.length>=25);assert.equal(samples[0].time,0);
      assert.ok(samples.at(-1).time>=duration-1e-6,model.id+' '+phase+' duration');
      for(let i=0;i<samples.length;i++){
        assert.ok(Number.isFinite(samples[i].rootOffsetY));assert.ok(Number.isFinite(samples[i].tilt));
        if(i)assert.ok(samples[i].time>samples[i-1].time);
      }
    }
  }
});

test('short and long flights finish the airborne pose before entering ground animation',()=>{
  for(const speed of [2.6001,3,4,6,10,14,25]){
    const car=pose(),person={x:0,z:2.5};
    const contact=sweepVehicleImpact(pose(0,-speed*.1),car,person,.1);assert.ok(contact);
    const launched=applyVehicleImpact(createImpactState(person),contact,car,EMPTY).state;
    assert.equal(launched.phase,'airborne');assert.ok(launched.airDuration>0);
    const before=advance(launched,launched.airDuration*(1-1e-5),EMPTY,1/240);
    assert.equal(before.phase,'airborne',`speed ${speed} lands early`);
    assert.ok(Math.abs(before.tilt-1.48)<1e-5,`speed ${speed} enters ground with incomplete tilt`);
    assert.ok(impactPoseTime(before)>.6999&&impactPoseTime(before)<=.7,`speed ${speed} skips the airborne clip ending`);
    const landed=stepImpact(before,.002,EMPTY);
    assert.equal(landed.phase,'down');assert.equal(landed.height,0);assert.ok(Math.abs(landed.tilt-before.tilt)<1e-5);
  }
});
