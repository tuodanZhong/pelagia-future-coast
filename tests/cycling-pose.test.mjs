import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { poseRider } from '../lib/city/cycling-driver.ts';

// Keep the production mesh and skeleton, omitting only browser-only image loading.
const bytes = await readFile(new URL('../public/assets/pelagia-citizen.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltfJson = JSON.parse(bytes.subarray(20, 20 + jsonLength));
for (const material of gltfJson.materials ?? []) {
  for (const owner of [material, material.pbrMetallicRoughness ?? {}]) {
    for (const key of Object.keys(owner)) if (key.endsWith('Texture')) delete owner[key];
  }
}
delete gltfJson.images;
delete gltfJson.textures;
delete gltfJson.samplers;
gltfJson.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString('base64')}`;
globalThis.ProgressEvent ??= class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
const { scene } = await new GLTFLoader().parseAsync(JSON.stringify(gltfJson), '');
const bounds = new THREE.Box3().setFromObject(scene);
const scale = 1.78 / (bounds.max.y - bounds.min.y);
const clips = await Promise.all(['cycling', 'cycling-rest'].map(async file =>
  THREE.AnimationClip.parse(JSON.parse(await readFile(new URL(`../public/assets/${file}.json`, import.meta.url), 'utf8')))));

function createActor() {
  const model = clone(scene);
  model.scale.multiplyScalar(scale);
  model.position.y = -bounds.min.y * scale;
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  return { root, mixer, actions: { cycling: mixer.clipAction(clips[0]), cycling_rest: mixer.clipAction(clips[1]) }, action: '', yaw: 0 };
}
function disposeActor(actor) {
  actor.mixer.stopAllAction();
  actor.mixer.uncacheRoot(actor.mixer.getRoot());
}
function relativeRotation(actor, name) {
  return actor.root.getWorldQuaternion(new THREE.Quaternion()).invert()
    .multiply(actor.root.getObjectByName(name).getWorldQuaternion(new THREE.Quaternion())).normalize();
}
function sample(actor, input) {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(12, .125, -8),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, input.yaw ?? 0, input.lean ?? 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  poseRider(actor, matrix, input.yaw ?? 0, input.crank, input.steer, input.speed, true, 1 / 60);
  actor.root.updateMatrixWorld(true);
  const expected = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), expected, new THREE.Vector3());
  assert.ok(actor.root.quaternion.angleTo(expected) < 1e-5, 'rider root must stay aligned with bicycle');
}
const correctedBones = ['Bip01_Spine1', 'Bip01_Head', ...['L', 'R'].flatMap(side =>
  ['UpperArm', 'Forearm', 'Hand'].map(part => `Bip01_${side}_${part}`))];
const cases = [
  { name: 'constant right turn', frames: 360, constant: true, input: () => ({ crank: 1.2, steer: .6, speed: 3 }) },
  { name: 'constant left turn', frames: 360, constant: true, input: () => ({ crank: 1.2, steer: -.6, speed: 3 }) },
  { name: 'continuous pedaling', frames: 420, input: i => ({ crank: i * .052, steer: .6, speed: 3 }) },
  { name: 'variable steering with world yaw and lean', frames: 540, input: i => ({ crank: i * .07, steer: .6 * Math.sin(i * .023), speed: 4, yaw: i * .012, lean: .14 * Math.sin(i * .023) }) },
  { name: 'right turn, straighten, reverse, straighten', frames: 480, input: i => ({ crank: i * .045, steer: i < 120 ? .6 : i < 240 ? 0 : i < 360 ? -.6 : 0, speed: 3, yaw: i * .008 }) },
  { name: 'stationary one-foot rest while turning', frames: 360, constant: true, input: () => ({ crank: Math.PI / 2, steer: .45, speed: 0, yaw: .7, lean: .05 }) },
  { name: 'ride, stop, restart', frames: 720,
    fading: i => (i >= 240 && i < 260) || (i >= 480 && i < 500),
    input: i => i < 240 ? { crank: i * .06, steer: .4, speed: 3 }
      : i < 480 ? { crank: Math.PI / 2, steer: -.4, speed: 0 }
        : { crank: (i - 480) * .06, steer: .3, speed: 3, yaw: (i - 480) * .002, lean: .05 } },
];
for (const scenario of cases) test(`cycling pose does not accumulate: ${scenario.name}`, () => {
  const actor = createActor();
  const bonePositions = actor.root.getObjectsByProperty('type', 'Bone')
    .filter(bone => bone.name !== 'Bip01').map(bone => [bone, bone.position.clone()]);
  let previous, first, accumulated = 0;
  try {
    for (let frame = 0; frame < scenario.frames; frame++) {
      const input = scenario.input(frame);
      sample(actor, input);
      const chest = relativeRotation(actor, 'Bip01_Spine1');
      if (previous) accumulated += chest.angleTo(previous);
      previous = chest;
      first ??= chest.clone();
      if (scenario.constant) assert.ok(chest.angleTo(first) < .001, `frame ${frame}: chest drifted from first pose`);
      for (const [bone, position] of bonePositions) assert.ok(bone.position.distanceTo(position) < 1e-7, `bone length changed: ${bone.name}`);
      // A fresh real skeleton is an independent first-frame reference. During the
      // intentional .22s crossfade it differs legitimately, so compare once settled.
      if (scenario.fading?.(frame) || (frame % 15 !== 0 && frame !== scenario.frames - 1)) continue;
      const reference = createActor();
      try {
        sample(reference, input);
        for (const bone of correctedBones) assert.ok(relativeRotation(actor, bone).angleTo(relativeRotation(reference, bone)) < .001, `frame ${frame}: ${bone} retained a previous procedural rotation`);
        for (const side of ['L', 'R']) for (const part of ['Hand', 'Foot']) {
          const name = `Bip01_${side}_${part}`;
          const a = actor.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
          const b = reference.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
          assert.ok(a.distanceTo(b) < .0001, `frame ${frame}: ${name} drifted from current target`);
        }
      } finally { disposeActor(reference); }
    }
    if (scenario.constant) assert.ok(accumulated < .002, 'constant input must not accumulate torso rotation across frames');
  } finally { disposeActor(actor); }
});
