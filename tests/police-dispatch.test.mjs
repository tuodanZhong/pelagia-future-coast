import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Traffic} from '../lib/city/traffic.ts';
import {PoliceDispatch} from '../lib/city/police-dispatch.ts';
import {buildWorld} from '../lib/city/world.ts';
import {vehicleCollision,createDrivingState} from '../lib/city/driving.ts';
function fixture(){
 const scene=new THREE.Scene(),world=buildWorld(scene),original=GLTFLoader.prototype.load;
 GLTFLoader.prototype.load=function(_url,onLoad){onLoad({scene:new THREE.Group()});return this;};
 let traffic;try{traffic=new Traffic(scene,new THREE.LoadingManager(),world.obstacles,()=>{});}finally{GLTFLoader.prototype.load=original;}
 const police=new PoliceDispatch(scene,traffic),cops=traffic.cars.filter(c=>c.police);assert.equal(cops.length,2);assert.equal(traffic.cars.length,18);
 return {scene,world,traffic,police,cops};
}
function run(f,kind,player,limit){
 const {traffic,police,cops}=f,origins=cops.map(c=>c.position.clone());let state,firstClose=Infinity,maxStuck=0,time=0;
 assert.equal(police.offense(kind,0),true);
 for(let frame=1;frame<=limit*60;frame++){
  time=frame/60;state=police.update(1/60,time,player);traffic.update(1/60,new THREE.Vector3(player.x,0,player.z));
  for(const cop of cops){assert.equal(vehicleCollision({...cop.manual,id:cop.id},traffic.environment(cop)),undefined,'police must not penetrate another vehicle or the real station/city');if(Math.hypot(cop.position.x-player.x,cop.position.z-player.z)<7)firstClose=Math.min(firstClose,time);}
  if(time>4&&time<15)maxStuck=Math.max(maxStuck,...police.units.map(u=>u.stuck));
  if(state.arrested||state.level===0)break;
 }
 return {state,time,firstClose,maxStuck,moved:cops.map((c,i)=>c.position.distanceTo(origins[i]))};
}

test('each real offense dispatches both cars from the complete station and captures a nearby stopped offender',()=>{
 for(const kind of ['assault','car-collision','npc-impact']){
  const f=fixture(),r=run(f,kind,{x:-68,z:-48,speed:0,vehicle:false},25);
  assert.equal(r.state.arrested,true,`${kind}: police must reach and capture nearby offender, not repeat a false stuck/reverse cycle`);
  assert.ok(r.firstClose<10,`${kind}: ${r.firstClose}s to first approach`);assert.ok(r.moved.every(d=>d>14),'both units must leave their parking spaces');
  assert.ok(r.maxStuck<2.8,'moving police must not accumulate false stuck time');console.log('nearby police capture',kind,r.time.toFixed(2)+'s');f.traffic.dispose();
 }
});

test('a single assault at the main plaza is pursued to capture without despawning wanted during a station traffic jam',()=>{
 const f=fixture(),r=run(f,'assault',{x:18,z:116,speed:0,vehicle:false},55);
 assert.equal(r.state.arrested,true,'police must close to observation range before the 25-second escape timer');assert.ok(r.firstClose<42);assert.ok(r.moved.every(d=>d>190));
 console.log('plaza police capture',r.time.toFixed(2)+'s','first approach',r.firstClose.toFixed(2)+'s');f.traffic.dispose();
});

test('escaping beyond the marina clears wanted only after the active 25-second search',()=>{
 const f=fixture(),r=run(f,'car-collision',{x:400,z:72,speed:8,vehicle:true},26);
 assert.equal(r.state.arrested,false);assert.equal(r.state.level,0);assert.ok(r.time>=25&&r.time<25.05);assert.equal(r.firstClose,Infinity);f.traffic.dispose();
});

test('dispatch never takes controls from a player-owned police car and pause preserves wanted progress',()=>{
 const f=fixture(),car=f.cops[0];assert.equal(f.traffic.takeControl(car),true);
 car.manual=createDrivingState({x:40,z:116,yaw:0,speed:5});f.traffic.drive(0,{throttle:0,steer:0});
 f.police.offense('assault',0);const manual={...car.manual};f.police.update(1/60,1/60,{x:40,z:116,speed:5,vehicle:true});assert.deepEqual(car.manual,manual);
 const before=f.police.wanted.state;for(let i=1;i<=60;i++)f.police.update(0,1/60+i/60,{x:40,z:116,speed:5,vehicle:true});assert.deepEqual(f.police.wanted.state,before);assert.equal(f.traffic.controlled,car);f.traffic.dispose();
});
