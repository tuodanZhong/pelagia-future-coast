import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { AttackController, PUNCH_TIMING, punchTarget } from '../lib/city/combat.ts';

test('each punch has one contact, a recovery, and an enforced cooldown',()=>{
  const attack=new AttackController();assert.equal(attack.request(),true);assert.equal(attack.request(),false);
  let contacts=0;
  for(let i=0;i<39;i++)contacts+=Number(attack.update(1/60).contact);
  assert.equal(contacts,1);assert.equal(attack.frame.active,false);assert.equal(attack.request(),false);
  attack.update(.2);assert.equal(attack.request(),true);attack.reset();assert.equal(attack.frame.active,false);
  assert.equal(attack.update(.5).contact,false);
});
test('punches only hit the nearest reachable person in front within physical reach',()=>{
  const near={x:.1,z:.9},far={x:0,z:1.7},behind={x:0,z:-.8},side={x:1,z:0};
  assert.equal(punchTarget({x:0,z:0},0,[far,behind,near,side],[]),near);
  assert.equal(punchTarget({x:0,z:0},0,[far,behind,side],[]),undefined);
  assert.equal(punchTarget({x:0,z:0},0,[near],[{x:0,z:.45,rx:2,rz:.04,shape:'box',height:3}]),undefined);
});
test('a seated person can react without ignoring walls or other furniture',()=>{
  const chair={x:0,z:0,rx:.35,rz:.35,shape:'box'},target={x:0,z:0,seatObstacle:chair};
  assert.equal(punchTarget({x:0,z:.9},Math.PI,[target],[chair]),target);
  assert.equal(punchTarget({x:0,z:.9},Math.PI,[target],[chair,{x:0,z:.6,rx:2,rz:.1,shape:'box'}]),undefined);
});
test('driver variants and punch animate the real rig without changing bone lengths',async()=>{
  for(const [file,name,duration] of [['driving-idle.json','DrivingIdle',8],['driving-concept.json','DrivingIdle',8],['punch.json','PunchRight',PUNCH_TIMING.duration]]){
    const clip=THREE.AnimationClip.parse(JSON.parse(await readFile(new URL('../public/assets/'+file,import.meta.url),'utf8')));
    assert.equal(clip.name,name);assert.ok(Math.abs(clip.duration-duration)<1e-6);
    assert.equal(clip.tracks.length,83);
    assert.deepEqual(clip.tracks.filter(t=>!t.name.endsWith('.quaternion')).map(t=>t.name),['Bip01.position']);
    assert.ok(clip.tracks.every(t=>Array.from(t.values).every(Number.isFinite)));
  }
});
