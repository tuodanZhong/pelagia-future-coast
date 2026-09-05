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
  for (const p of [SPAWN,{x:-48,z:30},{x:138,z:105}]) assert.ok(isWalkable(p.x,p.z,world.obstacles),JSON.stringify(p));
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
