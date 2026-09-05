import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { isWalkable, moveWithCollisions, movementVector, SPAWN, WORLD_EDGE } from '../lib/city/movement.ts';
import { buildWorld, TOWERS } from '../lib/city/world.ts';
const obstacles = [{ x: 0, z: 0, rx: 10, rz: 7 }, { x: 30, z: 10, rx: 12, rz: 3, shape: 'box' }];
test('diagonal movement has the same speed as forward', () => {
  const a = movementVector(1,0,0,5.4,1), b = movementVector(1,1,0,5.4,1);
  assert.ok(Math.abs(Math.hypot(a.dx,a.dz)-Math.hypot(b.dx,b.dz)) < 1e-9);
});
test('forward follows camera yaw, strafe stays perpendicular', () => {
  const a = movementVector(1,0,Math.PI/2,5,1), b = movementVector(0,1,Math.PI/2,5,1);
  assert.ok(Math.abs(a.dx+5)<1e-9 && Math.abs(a.dz)<1e-9);
  assert.ok(Math.abs(b.dx)<1e-9 && Math.abs(b.dz+5)<1e-9);
});
test('high-speed movement does not tunnel through tower', () => {
  const p=moveWithCollisions(-20,0,50,0,obstacles); assert.ok(p.x<-10); assert.ok(isWalkable(p.x,p.z,obstacles));
});
test('diagonal movement slides along obstacles', () => {
  const p=moveWithCollisions(-12,0,6,7,obstacles); assert.ok(p.z>6.5); assert.ok(isWalkable(p.x,p.z,obstacles));
});
test('pool corners and world bounds block walking', () => {
  assert.equal(isWalkable(41,12,obstacles),false);
  assert.equal(isWalkable(WORLD_EDGE+1,0,obstacles),false);
  const p=moveWithCollisions(140,140,30,30,[]);assert.ok(p.x<=WORLD_EDGE && p.z<=WORLD_EDGE);
  assert.equal(isWalkable(NaN,0,[]),false);
});
const world = buildWorld(new THREE.Scene());
test('spawn and every destination are clear of all obstacles', () => {
  for (const p of [SPAWN,{x:18.7,z:102.7},{x:-48,z:30},{x:138,z:105}]) assert.ok(isWalkable(p.x,p.z,world.obstacles),JSON.stringify(p));
});
test('continuous routes exist on both avenues and waterfront', () => {
  for (const x of [-48,48,138,-138]) for (let z=-125;z<=125;z++) assert.ok(isWalkable(x,z,world.obstacles),`${x},${z}`);
});
test('geometry is finite and stays inside a bounded scene budget', () => {
  let triangles=0,draws=0;
  world.root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    draws++;const p=obj.geometry.attributes.position;
    for (let i=0;i<p.array.length;i++) assert.ok(Number.isFinite(p.array[i]));
    triangles+=(obj.geometry.index?.count??p.count)/3*(obj.count??1);
  });
  assert.equal(TOWERS.length,8);assert.ok(draws<180,`${draws} calls`);assert.ok(triangles<1800000,`${triangles} triangles`);
  console.log(JSON.stringify({draws,triangles,obstacles:world.obstacles.length}));
});

test('third-person camera stops before walls and preserves its player target', async () => {
  const { resolveFollowCamera } = await import('../lib/city/camera.ts');
  const target={x:0,y:1.6,z:0};
  const camera=resolveFollowCamera(target,{x:0,y:2.2,z:5},[{x:0,z:4,rx:5,rz:1,shape:'box',height:20}]);
  assert.ok(camera.z<2.76&&camera.z>2.4);
  assert.deepEqual(target,{x:0,y:1.6,z:0});
});
test('follow camera clears low street furniture and remains above the ground', async () => {
  const { resolveFollowCamera, followOffset }=await import('../lib/city/camera.ts');
  const p=resolveFollowCamera({x:0,y:2,z:0},{x:0,y:2.3,z:5},[{x:0,z:3,rx:1,rz:1,height:.8}]);
  assert.equal(p.z,5);
  assert.ok(resolveFollowCamera({x:0,y:1.6,z:0},{x:0,y:-2,z:4},[]).y>=.28);
  const a=followOffset(0,0),b=followOffset(Math.PI/2,0);
  assert.ok(Math.abs(a.z-b.x)<1e-8&&Math.abs(a.x+b.z)<1e-8);
});
test('character asset includes textured skinning and three valid in-place animations', async()=>{
  const {readFile}=await import('node:fs/promises');
  const buffer=await readFile(new URL('../public/assets/pelagia-citizen.glb',import.meta.url));
  assert.equal(buffer.toString('utf8',0,4),'glTF');
  const length=buffer.readUInt32LE(12),gltf=JSON.parse(buffer.toString('utf8',20,20+length));
  assert.ok(gltf.skins[0].joints.length>40);assert.ok(gltf.images.length>=3);
  assert.deepEqual(gltf.animations.map(a=>a.name).sort(),['Idle','Run','Walk']);
  for(const animation of gltf.animations)assert.ok(animation.channels.length>20);
});

test('jump has grounded anticipation, a ballistic flight, and grounded landing recovery',async()=>{
  const {JumpController,JUMP_TIMING,FLIGHT_DURATION,JUMP_DURATION,sampleJump}=await import('../lib/city/jump.ts');
  const jump=new JumpController();assert.equal(jump.request(),true);
  jump.update(.08);assert.equal(jump.frame.phase,'takeoff');assert.equal(jump.frame.height,0);
  assert.equal(jump.request(),false);
  const apex=sampleJump(JUMP_TIMING.takeoff+FLIGHT_DURATION/2);
  assert.equal(apex.phase,'airborne');assert.ok(apex.height>.7&&apex.height<.8);assert.ok(Math.abs(apex.velocity)<1e-8);
  const landing=sampleJump(JUMP_TIMING.takeoff+FLIGHT_DURATION+.1);
  assert.equal(landing.phase,'landing');assert.equal(landing.height,0);
  jump.update(JUMP_DURATION);assert.equal(jump.frame.phase,'grounded');assert.equal(jump.request(),true);
  jump.reset();assert.equal(jump.frame.phase,'grounded');
});
test('jump clip bends both legs and swings both arms on the same clock as physics',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {JUMP_DURATION}=await import('../lib/city/jump.ts');
  const json=JSON.parse(await readFile(new URL('../public/assets/jump-clip.json',import.meta.url),'utf8'));
  const clip=THREE.AnimationClip.parse(json);assert.ok(Math.abs(clip.duration-JUMP_DURATION)<1e-6);
  for(const side of ['L','R'])for(const limb of ['Calf','UpperArm']){
    const t=clip.tracks.find(t=>t.name.includes(`${side}_${limb}`)&&t.name.endsWith('.quaternion'));
    assert.ok(t,`${side} ${limb} animated`);
    assert.ok(t.times.length>4);assert.ok(new Set(t.values).size>12);
  }
});
test('population contains distinct men, women, seniors and true child models on clear paths',async()=>{
  const {PERSON_MODELS,CITIZENS}=await import('../lib/city/population.ts');
  assert.ok(new Set(CITIZENS.map(p=>p.model)).size>=7);
  for(const kind of ['adult','senior','child'])for(const sex of ['male','female'])
    assert.ok(PERSON_MODELS.some(m=>m.kind===kind&&m.sex===sex&&CITIZENS.some(p=>p.model===m.id)));
  for(const p of CITIZENS){assert.ok(isWalkable(p.x,p.z,world.obstacles,.30),`pedestrian ${p.model}: ${p.x},${p.z}`);}
  for(const m of PERSON_MODELS.filter(m=>m.kind==='child'))assert.ok(m.height<1.5&&m.file.includes('npc-'));
});

test('traffic loops are continuous and keep both lanes on asphalt',async()=>{
  const {createTrafficRoute}=await import('../lib/city/traffic.ts');
  const {groundHeight}=await import('../lib/city/movement.ts');
  for(const reverse of [false,true]){
    const route=createTrafficRoute(reverse);assert.ok(route.getPointAt(0).distanceTo(route.getPointAt(1))<1e-6);
    for(let i=0;i<400;i++){
      const p=route.getPointAt(i/400),t=route.getTangentAt(i/400);
      assert.equal(groundHeight(p.x,p.z),.04,`lane ${reverse} at ${p.x},${p.z}`);
      assert.ok(Number.isFinite(t.x)&&Math.abs(t.length()-1)<1e-6);
    }
  }
});
test('traffic brakes progressively and never reverses while yielding',async()=>{
  const {brakingSpeed}=await import('../lib/city/traffic.ts');
  let speed=4.3,distance=0;
  for(let i=0;i<60;i++){speed=brakingSpeed(speed,0,1/60);distance+=speed/60;assert.ok(speed>=0);}
  assert.equal(speed,0);assert.ok(distance<2.3);
  assert.ok(brakingSpeed(0,4.3,.1)>0&&brakingSpeed(0,4.3,.1)<.3);
});
test('sprinting accelerates smoothly, is faster than walking, and stops on release',async()=>{
  const {locomotionSpeed,WALK_SPEED,SPRINT_SPEED}=await import('../lib/city/locomotion.ts');
  let speed=0,distance=0;
  for(let i=0;i<120;i++){
    const next=locomotionSpeed(speed,true,true,1/60);
    assert.ok(next>=speed&&next-speed<=8/60+1e-9);speed=next;distance+=speed/60;
  }
  assert.equal(speed,SPRINT_SPEED);assert.ok(distance>WALK_SPEED*2*2);
  for(let i=0;i<60;i++)speed=locomotionSpeed(speed,true,false,1/60);
  assert.equal(speed,WALK_SPEED);assert.equal(locomotionSpeed(speed,false,true,1/60),0);
});
test('traffic signals have exclusive phases, clearance intervals and correct approach coverage',async()=>{
  const {phaseAt,SIGNAL_CYCLE_SECONDS,SIGNAL_APPROACHES,TrafficSignals}=await import('../lib/city/signals.ts');
  assert.equal(SIGNAL_APPROACHES.length,28);
  const stages=new Set();
  for(let t=0;t<SIGNAL_CYCLE_SECONDS;t+=.1){
    const phase=phaseAt(t);stages.add(phase.stage);
    assert.ok(!(phase.ns!=='red'&&phase.ew!=='red'));
    if(phase.pedestrianNS)assert.equal(phase.ew,'red');
    if(phase.pedestrianEW)assert.equal(phase.ns,'red');
  }
  assert.equal(stages.size,6);assert.equal(phaseAt(SIGNAL_CYCLE_SECONDS).stage,phaseAt(0).stage);
  const scene=new THREE.Scene(),fixed=[...world.obstacles],signals=new TrafficSignals(scene,fixed);
  assert.ok(signals.root.children.length<=8);
  for(const x of [-48,48,138,-138])for(let z=-125;z<=125;z++)assert.ok(isWalkable(x,z,fixed),`signal pole blocks ${x},${z}`);
  const {CITIZENS}=await import('../lib/city/population.ts');
  for(const p of CITIZENS)assert.ok(isWalkable(p.x,p.z,fixed,.3),`signal overlaps citizen ${p.x},${p.z}`);
  signals.update(SIGNAL_CYCLE_SECONDS/2);signals.dispose();assert.equal(fixed.length,world.obstacles.length);
});
test('cars stop before a red signal and accelerate again on green',async()=>{
  const {speedLimit,phaseAt,SIGNAL_CYCLE_SECONDS,STOP_LINE_OFFSET,VEHICLE_STOP_MARGIN}=await import('../lib/city/signals.ts');
  const {brakingSpeed}=await import('../lib/city/traffic.ts');
  const redTime=Array.from({length:SIGNAL_CYCLE_SECONDS},(_,i)=>i).find(t=>phaseAt(t).ew==='green');
  assert.notEqual(redTime,undefined);
  let z=10,speed=4.3;const x=43.8,heading={x:0,z:1};
  for(let i=0;i<600;i++){
    speed=brakingSpeed(speed,Math.min(4.3,speedLimit({x,z},heading,speed,redTime)),1/60);z+=speed/60;
  }
  const stop=48-STOP_LINE_OFFSET-VEHICLE_STOP_MARGIN;
  assert.ok(z<stop&&z>stop-.8,`resting at ${z}, expected just before ${stop}`);assert.ok(speed<.01);
  speed=brakingSpeed(speed,Math.min(4.3,speedLimit({x,z},heading,speed,0)),.1);assert.ok(speed>0);
  assert.equal(speedLimit({x,z:48},heading,4.3,redTime),Infinity,'entered vehicles clear the junction');
});
test('running jump has a distinct, synchronised pose and the market is accessible',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {JUMP_DURATION}=await import('../lib/city/jump.ts');
  const {STREET_LIFE_VENUES}=await import('../lib/city/street-life.ts');
  const standing=JSON.parse(await readFile(new URL('../public/assets/jump-clip.json',import.meta.url),'utf8'));
  const running=JSON.parse(await readFile(new URL('../public/assets/jump-run-clip.json',import.meta.url),'utf8'));
  assert.equal(running.name,'JumpRun');assert.ok(Math.abs(running.duration-JUMP_DURATION)<1e-6);
  const leg='Bip01_L_Thigh.quaternion';
  assert.notDeepEqual(standing.tracks.find(t=>t.name===leg)?.values,running.tracks.find(t=>t.name===leg)?.values);
  assert.equal(STREET_LIFE_VENUES.filter(v=>v.type==='stall').length,4);
  assert.equal(STREET_LIFE_VENUES.filter(v=>v.type==='shop').length,3);
  for(let z=103;z<=116;z+=.25)assert.ok(isWalkable(18.2,z,world.obstacles),`market access ${z}`);
});
