import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Traffic} from '../lib/city/traffic.ts';
import {personVehicleDistance,impactPositionFree} from '../lib/city/impact.ts';

// Run the real Characters methods without its asset-fetching constructor. Transform only the
// current source's TS syntax; this also supports existing parameter properties in Node 22.
const characterURL=new URL('../lib/city/characters.ts',import.meta.url);
const runtime=stripTypeScriptTypes(fs.readFileSync(characterURL,'utf8'),{mode:'transform',sourceUrl:characterURL.href})
  .replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
    const resolved=specifier.startsWith('.')?new URL(/\.[a-z]+$/i.test(specifier)?specifier:specifier+'.ts',characterURL).href:import.meta.resolve(specifier);
    return `from ${JSON.stringify(resolved)}`;
  });
const {Characters}=await import('data:text/javascript;base64,'+Buffer.from(runtime).toString('base64'));
const vehicle=(id,x=0,z=0,yaw=0)=>({id,x,z,yaw,length:4.9,width:2.2,height:1.7,speed:10,distance:0,roll:0,steer:0});
const enclosure=x=>[
  {x:x+1.35,z:0,rx:.15,rz:5,shape:'box'},{x:x-1.35,z:0,rx:.15,rz:5,shape:'box'},
  {x,z:2.7,rx:5,rz:.15,shape:'box'},{x,z:-2.7,rx:5,rz:.15,shape:'box'},
];
function citizen(x,z,seatId){
  const root=new THREE.Group(),model=new THREE.Group(),pelvis=new THREE.Bone();pelvis.name='Bip01';model.add(pelvis);root.add(model);root.position.set(x,.125,z);
  const mixer=new THREE.AnimationMixer(model),actions={};
  for(const name of ['idle','walk','run','seated','impact_air','impact_ground','impact_recover']){
    actions[name]=mixer.clipAction(new THREE.AnimationClip(name,4,[new THREE.QuaternionKeyframeTrack('Bip01.quaternion',[0,4],[0,0,0,1,0,0,0,1])]));
  }
  const action=seatId?'seated':'walk';actions[action].play();
  return {root,mixer,actions,action,yaw:0,spec:{model:'test-person',x,z,pace:1.2,route:8,seatId},model:{id:'test-person',height:1.8,gaitSpeed:1.4},distance:0,direction:1,turnPause:0,hitTime:-100,fearUntil:0,disturbed:false,escapeYaw:0};
}
function characters(citizens,seats=[],obstacles=[]){
  const characters=Object.create(Characters.prototype);
  Object.assign(characters,{citizens,seats,obstacles,grounding:{},lastNpcUpdate:0,disposed:false});return characters;
}

test('actual Characters impact scan hits invisible NPCs before the animation update throttle',()=>{
  const actor=citizen(0,2.5);actor.root.visible=false;const crowd=characters([actor]);crowd.lastNpcUpdate=100;
  const hits=crowd.updateVehicleImpacts([vehicle('car',0,-7)],[vehicle('car')],.5,1,[],()=>assert.fail('unexpected rollback'));
  assert.equal(hits.get('car'),1);assert.equal(actor.impact.phase,'airborne');assert.ok(actor.impact.height>0);
  assert.equal(actor.action,'impact_air');assert.equal(actor.actions.walk.isScheduled(),false);assert.equal(actor.actions.impact_air.isScheduled(),true);
  const before=actor.root.position.clone();crowd.update(1,new THREE.Vector3(1000,0,1000),false);
  assert.ok(actor.root.position.distanceTo(before)<1e-8);assert.equal(actor.impact.phase,'airborne');
});

test('a blocked member rolls back every uncommitted contact from that car, including seat release',()=>{
  const first=citizen(0,-5,'bench'),trapped=citizen(0,0),chair={x:0,z:-5,rx:.36,rz:.36};
  const seats=[{id:'bench',obstacle:chair,occupied:true}],obstacles=[...enclosure(0),chair],crowd=characters([first,trapped],seats,obstacles),stops=[];
  const previous=[vehicle('car',0,-9)],current=[vehicle('car')];
  const hits=crowd.updateVehicleImpacts(previous,current,.5,1,obstacles,p=>stops.push(p));
  assert.deepEqual(stops.map(p=>p.id),['car']);assert.equal(current[0],previous[0]);assert.equal(hits.size,0);
  assert.equal(first.impact.phase,'none');assert.equal(first.impact.cooldown,0);assert.equal(first.seatReleased,undefined);assert.equal(seats[0].occupied,true);
  assert.equal(first.root.position.z,-5);assert.equal(trapped.impact.phase,'none');
});

test('rolling back a blocked second car preserves a different car successful contacts',()=>{
  const free=citizen(-20,2.5),pending=citizen(20,-5),trapped=citizen(20,0),obstacles=enclosure(20),crowd=characters([free,pending,trapped],[],obstacles),stops=[];
  const previous=[vehicle('a',-20,-7),vehicle('b',20,-9)],current=[vehicle('a',-20,0),vehicle('b',20,0)];
  const hits=crowd.updateVehicleImpacts(previous,current,.5,1,obstacles,p=>stops.push(p));
  assert.equal(hits.get('a'),1);assert.equal(hits.has('b'),false);assert.deepEqual(stops.map(p=>p.id),['b']);
  assert.equal(free.impact.phase,'airborne');assert.equal(pending.impact.phase,'none');assert.equal(trapped.impact.phase,'none');
});

test('cooldown contacts still separate but do not restart impulse, animation time, or hit accounting',()=>{
  const actor=citizen(0,2.5),crowd=characters([actor]);
  crowd.updateVehicleImpacts([vehicle('car',0,-7)],[vehicle('car')],.05,1,[],()=>assert.fail('unexpected rollback'));
  const oldTime=actor.impact.time,oldVelocity=actor.impact.vy;
  const overlap=vehicle('car',actor.impact.x,actor.impact.z);
  const hits=crowd.updateVehicleImpacts([overlap],[{...overlap}],1/60,1.016,[],()=>assert.fail('unexpected rollback'));
  assert.equal(hits.size,0);assert.ok(actor.impact.time>oldTime);assert.ok(actor.impact.vy<oldVelocity);
  assert.ok(personVehicleDistance(actor.impact,overlap)>=.015);assert.equal(actor.action,'impact_air');
});

test('seated NPC releases its chair, cannot be punched while down, and recovers at the displaced position',()=>{
  const actor=citizen(0,0,'chair'),chair={x:0,z:0,rx:.36,rz:.36},seat={id:'chair',obstacle:chair,occupied:true};
  const crowd=characters([actor],[seat],[chair]);
  crowd.updateVehicleImpacts([vehicle('car',0,-7)],[vehicle('car',0,-2.5)],.3,1,[chair],()=>assert.fail('unexpected rollback'));
  assert.equal(actor.seatReleased,true);assert.equal(seat.occupied,false);assert.equal(actor.actions.seated.isScheduled(),false);
  assert.equal(crowd.strike(new THREE.Vector3(actor.root.position.x,.125,actor.root.position.z+.6),Math.PI,1.1),false);
  const far=vehicle('car',100,100);let sawDown=false,sawRecover=false;
  for(let i=0;i<360;i++){
    const time=1+(i+1)/60;crowd.updateVehicleImpacts([far],[{...far}],1/60,time,[chair],()=>assert.fail('unexpected rollback'));
    sawDown||=actor.impact.phase==='down';sawRecover||=actor.impact.phase==='recover';
    crowd.update(time,new THREE.Vector3(1000,0,1000),i%2===0);
  }
  assert.ok(sawDown&&sawRecover);assert.equal(actor.impact.phase,'none');assert.notEqual(actor.action,'seated');
  assert.ok(Math.hypot(actor.root.position.x,actor.root.position.z)>1);assert.equal(actor.root.rotation.x,0);
  assert.equal(actor.impactSeatObstacle,undefined);assert.ok(impactPositionFree(actor.impact,{obstacles:[chair]}));
});

test('low-speed integration leaves the NPC on its feet without selecting impact flight animations',()=>{
  const actor=citizen(0,2.5),crowd=characters([actor]);
  crowd.updateVehicleImpacts([vehicle('car',0,-.1)],[vehicle('car')],.1,1,[],()=>assert.fail('unexpected rollback'));
  assert.equal(actor.impact.phase,'pushed');assert.equal(actor.impact.height,0);assert.equal(actor.action,'idle');
  assert.equal(actor.actions.impact_air.isScheduled(),false);
});

test('actual Traffic rollback restores pose and manual state while preserving free-driving ownership',()=>{
  const original=GLTFLoader.prototype.load;GLTFLoader.prototype.load=function(url,onLoad){onLoad({scene:new THREE.Group()});return this;};
  let traffic;try{traffic=new Traffic(new THREE.Scene(),new THREE.LoadingManager(),[],()=>{});}finally{GLTFLoader.prototype.load=original;}
  const car=traffic.cars.find(c=>c.parked);assert.ok(traffic.takeControl(car));
  const before=traffic.poses().find(p=>p.id===car.id);traffic.drive(.05,{throttle:1,steer:1});traffic.stopBeforeImpact(before);
  assert.equal(traffic.controlled,car);assert.equal(car.speed,0);assert.equal(car.manual.speed,0);
  assert.equal(car.position.x,before.x);assert.equal(car.position.z,before.z);assert.equal(car.yaw,before.yaw);
  assert.equal(car.manual.x,before.x);assert.equal(car.manual.z,before.z);assert.equal(car.manual.yaw,before.yaw);
  assert.equal(car.manual.steer,before.steer);assert.equal(car.steer,before.steer);assert.equal(car.roll,before.roll);
  traffic.releaseControl();traffic.update(1,new THREE.Vector3(1000,0,1000));assert.equal(car.position.x,before.x);assert.equal(car.position.z,before.z);traffic.dispose();
});
