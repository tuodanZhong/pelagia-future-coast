import test from 'node:test';
import assert from 'node:assert/strict';
import {GullFeeding,GULL_FEED_ZONES,MAX_GULL_CRUMBS,FEED_COOLDOWN,crumbPosition} from '../lib/city/seagull-feeding.ts';
const east={x:138,z:105},south={x:-120,z:139};
test('feeding is available only near coast zones and enforces monotonic time and cooldown',()=>{
 const f=new GullFeeding();assert.equal(f.available({x:0,z:0}),false);assert.equal(f.available(east),true);
 assert.equal(f.feed(east,0,0).length,8);assert.equal(f.available(east),false);assert.equal(f.feed(east,0,.5),undefined);
 f.tick(FEED_COOLDOWN);assert.equal(f.available(east),true);assert.equal(f.feed(south,0,FEED_COOLDOWN).length,8);
 assert.equal(f.feed(east,0,0),undefined);assert.equal(f.feed({x:NaN,z:0},0,4),undefined);assert.equal(f.feed(east,NaN,5),undefined);assert.equal(f.feed(east,0,NaN),undefined);
});
test('all throw directions land only on a safe fixed promenade zone',()=>{
 for(const p of [east,south])for(let i=0;i<32;i++){
  const f=new GullFeeding((x,z)=>!(x>143&&z>105));const crumbs=f.feed(p,i/16*Math.PI,0);assert.ok(crumbs?.length);
  for(const c of crumbs){assert.equal(f.safe(c.x,c.z,c.zone),true);assert.ok(Math.abs(c.x)<145&&Math.abs(c.z)<145);assert.ok(!(c.x>143&&c.z>105));}
 }
});
test('blocked zones reject food without spending cooldown or allocating particles',()=>{
 const f=new GullFeeding((x,z)=>x<140);assert.equal(f.available(east),true);assert.equal(f.feed(east,0,1),undefined);assert.equal(f.crumbs.length,0);assert.equal(f.cooldownRemaining,0);
});
test('crumb budget and expiry stay bounded through repeated feeding',()=>{
 const f=new GullFeeding();for(let i=0;i<100;i++){f.feed(east,0,i*1.81);assert.ok(f.crumbs.length<=MAX_GULL_CRUMBS);assert.equal(new Set(f.crumbs.map(c=>c.id)).size,f.crumbs.length);}
 assert.equal(f.crumbs.length,MAX_GULL_CRUMBS);f.tick(300);assert.equal(f.crumbs.length,0);
});
test('exclusive claims cannot be stolen or consumed while food is still airborne',()=>{
 const f=new GullFeeding();f.feed(east,0,0);const a=f.claim(0,0,east),b=f.claim(1,0,east);assert.notEqual(a.id,b.id);assert.equal(f.claim(0,0,east),a);
 assert.equal(f.consume(a.id,1,1),false);assert.equal(f.consume(a.id,0,.1),false);assert.equal(f.consume(a.id,0,1),true);assert.equal(f.get(a.id),undefined);f.release(1);assert.equal(f.get(b.id).claimedBy,undefined);
});
test('new dynamic obstacles invalidate food rather than attracting birds into vehicles',()=>{
 let blocked=false;const f=new GullFeeding(()=>!blocked);f.feed(east,0,0);f.claim(0,0,east);blocked=true;f.tick(.1);assert.equal(f.crumbs.length,0);
});
test('food arcs have exact endpoints, lift in midair and stop at the landing point',()=>{
 const f=new GullFeeding(),c=f.feed(east,0,0)[0],height=()=>.17;
 assert.deepEqual(crumbPosition(c,-1,height),{x:east.x,z:east.z,y:1.22});
 const end=crumbPosition(c,c.landsAt,height);assert.ok(Math.abs(end.y-.195)<1e-9);assert.equal(end.x,c.x);assert.equal(end.z,c.z);
 const mid=crumbPosition(c,c.landsAt/2,height);assert.ok(mid.y>1);const later=crumbPosition(c,20,height);assert.deepEqual(later,end);
});
