import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Obstacle } from './movement';

export type SignalAxis = 'ns' | 'ew';
export type SignalColor = 'red' | 'yellow' | 'green';
export type SignalPhase = {
  ns: SignalColor;
  ew: SignalColor;
  pedestrianNS: boolean;
  pedestrianEW: boolean;
  stage: 'ns-green' | 'ns-yellow' | 'clear-to-ew' | 'ew-green' | 'ew-yellow' | 'clear-to-ns';
  cycleTime: number;
  secondsToChange: number;
};

// Clearing from the stop position to the far side takes ~8.5 s at 4.3 m/s.
// Ten seconds of all-red also accommodates a late yellow entrant accelerating.
// Pedestrian green ends five seconds before the parallel vehicle green.
export const SIGNAL_CLEARANCE_SECONDS = 10;
export const SIGNAL_CYCLE_SECONDS = 2 * (18 + 3 + SIGNAL_CLEARANCE_SECONDS);
export const STOP_LINE_OFFSET = 16;
export const VEHICLE_STOP_MARGIN = 3.15; // front half-length plus a visible gap
export const INTERSECTIONS = [-48, 48].flatMap(x => [-132, -48, 48, 132].map(z => ({ x, z })));

export function phaseAt(time: number): SignalPhase {
  const t = ((Number.isFinite(time) ? time : 0) % SIGNAL_CYCLE_SECONDS + SIGNAL_CYCLE_SECONDS) % SIGNAL_CYCLE_SECONDS;
  if (t < 18) return { ns: 'green', ew: 'red', pedestrianNS: t < 13, pedestrianEW: false, stage: 'ns-green', cycleTime: t, secondsToChange: 18 - t };
  if (t < 21) return { ns: 'yellow', ew: 'red', pedestrianNS: false, pedestrianEW: false, stage: 'ns-yellow', cycleTime: t, secondsToChange: 21 - t };
  const ewStart = 21 + SIGNAL_CLEARANCE_SECONDS;
  if (t < ewStart) return { ns: 'red', ew: 'red', pedestrianNS: false, pedestrianEW: false, stage: 'clear-to-ew', cycleTime: t, secondsToChange: ewStart - t };
  if (t < ewStart + 18) return { ns: 'red', ew: 'green', pedestrianNS: false, pedestrianEW: t < ewStart + 13, stage: 'ew-green', cycleTime: t, secondsToChange: ewStart + 18 - t };
  if (t < ewStart + 21) return { ns: 'red', ew: 'yellow', pedestrianNS: false, pedestrianEW: false, stage: 'ew-yellow', cycleTime: t, secondsToChange: ewStart + 21 - t };
  return { ns: 'red', ew: 'red', pedestrianNS: false, pedestrianEW: false, stage: 'clear-to-ns', cycleTime: t, secondsToChange: SIGNAL_CYCLE_SECONDS - t };
}

export type SignalApproach = {
  x: number;
  z: number;
  axis: SignalAxis;
  dx: number;
  dz: number;
};

// +Z and -Z at the island's outside edge are not real incoming roads. The four
// waterfront junctions therefore receive three incoming heads, the inner four four.
export const SIGNAL_APPROACHES: SignalApproach[] = INTERSECTIONS.flatMap(({ x, z }) => {
  const approaches: SignalApproach[] = [{ x, z, axis: 'ew', dx: 1, dz: 0 }, { x, z, axis: 'ew', dx: -1, dz: 0 }];
  if (z !== -132) approaches.push({ x, z, axis: 'ns', dx: 0, dz: 1 });
  if (z !== 132) approaches.push({ x, z, axis: 'ns', dx: 0, dz: -1 });
  return approaches;
});

type XZ = { x: number; z: number };

/**
 * Maximum permitted speed in m/s, or Infinity when signals impose no limit.
 * `tangent` is the actual travel direction (reverse-route cars must negate it).
 * Call before the normal acceleration/braking integrator, using the same elapsed
 * simulation time passed to TrafficSignals.update(). This function has no state.
 */
export function speedLimit(position: XZ, tangent: XZ, speed: number, time: number): number {
  if (![position.x, position.z, tangent.x, tangent.z, speed].every(Number.isFinite)) return 0;
  const norm = Math.hypot(tangent.x, tangent.z);
  if (norm < 1e-6) return Infinity;
  const tx = tangent.x / norm, tz = tangent.z / norm, phase = phaseAt(time), velocity = Math.max(0, speed);
  let limit = Infinity;
  for (const approach of SIGNAL_APPROACHES) {
    // Curving vehicles that have already entered a junction must finish their turn.
    if (tx * approach.dx + tz * approach.dz < .93) continue;
    const dx = position.x - approach.x, dz = position.z - approach.z;
    const lateral = Math.abs(-approach.dz * dx + approach.dx * dz);
    if (lateral > 10.5) continue;
    const distance = -(dx * approach.dx + dz * approach.dz) - STOP_LINE_OFFSET - VEHICLE_STOP_MARGIN;
    // Keep a vehicle resting at its stop point held, but never acquire a new red
    // light once its front has crossed the line. This also handles corner turns.
    if (distance < -.55 || distance > 45) continue;
    const color = phase[approach.axis];
    if (color === 'green') continue;
    // A moving car in the yellow dilemma zone clears the junction. A car already
    // slowing to a stop continues stopping; tiny low-speed creep is not a commit.
    const emergencyStoppingDistance = velocity * velocity / (2 * 4.5) + velocity * .2;
    if (color === 'yellow' && velocity > 1.25 && distance <= emergencyStoppingDistance) continue;
    // Comfortable 2.4 m/s² approach, below Traffic.brakingSpeed's 4.5 m/s²
    // maximum. The integrator can follow this envelope without a velocity snap.
    limit = Math.min(limit, Math.sqrt(2 * 2.4 * Math.max(0, distance - .2)));
  }
  return limit;
}

type StaticMaterial = 'metal' | 'housing' | 'trim' | 'paint';
type Lamp = { axis: SignalAxis; color: SignalColor; matrix: THREE.Matrix4 };
type PedestrianPixel = { axis: SignalAxis; walking: boolean; matrix: THREE.Matrix4 };

/** Batches all 28 approaches into six draw calls, including both animated displays. */
export class TrafficSignals {
  readonly root = new THREE.Group();
  private readonly lens: THREE.InstancedMesh;
  private readonly pedestrian: THREE.InstancedMesh;
  private readonly lamps: Lamp[] = [];
  private readonly pixels: PedestrianPixel[] = [];
  private readonly ownObstacles: Obstacle[] = [];
  private readonly obstacleList: Obstacle[];
  private phaseKey = '';
  private dead = false;

  constructor(scene: THREE.Scene, obstacles: Obstacle[]) {
    this.obstacleList = obstacles;
    this.root.name = 'TrafficSignals';
    const materials: Record<StaticMaterial, THREE.MeshStandardMaterial> = {
      metal: new THREE.MeshStandardMaterial({ color: '#869396', metalness: .72, roughness: .48 }),
      housing: new THREE.MeshStandardMaterial({ color: '#151c1e', metalness: .12, roughness: .7, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ color: '#b8bfbd', metalness: .45, roughness: .52 }),
      paint: new THREE.MeshStandardMaterial({ color: '#e4e5dd', roughness: .92 }),
    };
    const pieces: Record<StaticMaterial, THREE.BufferGeometry[]> = { metal: [], housing: [], trim: [], paint: [] };
    const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
    const pole = new THREE.CylinderGeometry(.75, 1, 1, 12);
    const rim = new THREE.TorusGeometry(.137, .014, 5, 16);
    const hood = new THREE.CylinderGeometry(.151, .151, .25, 12, 1, true, Math.PI / 2, Math.PI);
    hood.rotateX(Math.PI / 2);
    const unit = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const matrix = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, q = unit) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    const add = (geometry: THREE.BufferGeometry, material: StaticMaterial, transform: THREE.Matrix4) => pieces[material].push(geometry.clone().applyMatrix4(transform));
    const local = (basis: THREE.Matrix4, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => basis.clone().multiply(matrix(x, y, z, sx, sy, sz));
    const rod = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: StaticMaterial = 'metal') => {
      const direction = to.clone().sub(from), middle = from.clone().add(to).multiplyScalar(.5);
      add(cylinder, material, matrix(middle.x, middle.y, middle.z, radius, direction.length(), radius, new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())));
    };
    const clearPole = (x: number, z: number) => Math.abs(z) < 145 && !obstacles.some(o => {
      if (o.shape === 'box') return Math.abs(x - o.x) < o.rx + .32 && Math.abs(z - o.z) < o.rz + .32;
      return ((x - o.x) / (o.rx + .32)) ** 2 + ((z - o.z) / (o.rz + .32)) ** 2 < 1;
    });
    const standing = ['00100', '00100', '01110', '10101', '00100', '01010', '01010'];
    const walking = ['00100', '00100', '01110', '10100', '00110', '01001', '10001'];
    for (const a of SIGNAL_APPROACHES) {
      const rx = -a.dz, rz = a.dx;
      let px = a.x - a.dx * 14.7 + rx * 13.2, pz = a.z - a.dz * 14.7 + rz * 13.2;
      // The seafront roads are narrower than the internal avenues; poles go on
      // their actual outside curb, inside the public waterfront promenade.
      pz = THREE.MathUtils.clamp(pz, -141.1, 141.1);
      if (!clearPole(px, pz)) {
        for (const shift of [1.1, -1.1, 2.2, -2.2]) {
          const x = px + a.dx * shift, z = pz + a.dz * shift;
          if (clearPole(x, z)) { px = x; pz = z; break; }
        }
      }
      const obstacle: Obstacle = { x: px, z: pz, rx: .22, rz: .22, height: 5.48, shape: 'ellipse' };
      obstacles.push(obstacle); this.ownObstacles.push(obstacle);
      add(box, 'trim', matrix(px, .10, pz, .40, .12, .40));
      add(box, 'metal', matrix(px, .18, pz, .29, .05, .29));
      add(pole, 'metal', matrix(px, 2.84, pz, .09, 5.27, .09));
      for (const x of [-.10, .10]) for (const z of [-.10, .10]) add(cylinder, 'housing', matrix(px + x, .22, pz + z, .022, .033, .022));
      for (const y of [.56, 2.26, 4.62]) add(cylinder, 'metal', matrix(px, y, pz, .103, .075, .103));
      const hx = a.x - a.dx * 14.2 + rx * 4.2, hz = a.z - a.dz * 14.2 + rz * 4.2;
      const armStart = new THREE.Vector3(px, 5.34, pz), armEnd = new THREE.Vector3(hx, 5.34, hz);
      rod(armStart, armEnd, .055);
      rod(new THREE.Vector3(px, 4.70, pz), armStart.clone().lerp(armEnd, .29), .035);
      const yaw = Math.atan2(-a.dx, -a.dz);
      const basis = new THREE.Matrix4().makeRotationY(yaw).setPosition(hx, 4.79, hz);
      add(box, 'trim', local(basis, 0, 0, -.065, .49, 1.16, .065));
      add(box, 'housing', local(basis, 0, 0, 0, .435, 1.10, .21));
      add(box, 'metal', local(basis, 0, .51, -.12, .16, .13, .17));
      for (const [i, color] of (['red', 'yellow', 'green'] as const).entries()) {
        const y = .335 - i * .335;
        add(rim, 'housing', local(basis, 0, y, .122));
        add(hood, 'housing', local(basis, 0, y, .235));
        this.lamps.push({ axis: a.axis, color, matrix: local(basis, 0, y, .133, .118, .118, .025) });
      }
      // Near-side pedestrian repeater, with actual standing/walking LED figures.
      const pb = new THREE.Matrix4().makeRotationY(yaw).setPosition(px - a.dx * .14, 2.16, pz - a.dz * .14);
      add(box, 'housing', local(pb, 0, 0, 0, .30, .53, .15));
      add(box, 'trim', local(pb, 0, 0, -.07, .32, .55, .045));
      for (const [walk, glyph] of [[false, standing], [true, walking]] as const) {
        for (let row = 0; row < glyph.length; row++) for (let col = 0; col < glyph[row].length; col++) if (glyph[row][col] === '1') {
          this.pixels.push({ axis: a.axis, walking: walk, matrix: local(pb, (col - 2) * .027, (walk ? -.123 : .123) + (3 - row) * .027, .080, .023, .023, .009) });
        }
      }
      const stop = new THREE.Matrix4().makeRotationY(yaw).setPosition(a.x - a.dx * STOP_LINE_OFFSET + rx * 5, .078, a.z - a.dz * STOP_LINE_OFFSET + rz * 5);
      add(box, 'paint', local(stop, 0, 0, 0, 8.8, .013, .23));
    }
    for (const key of Object.keys(pieces) as StaticMaterial[]) {
      const geometry = mergeGeometries(pieces[key]); pieces[key].forEach(g => g.dispose());
      if (!geometry) throw new Error(`Unable to batch traffic signal ${key}`);
      const mesh = new THREE.Mesh(geometry, materials[key]); mesh.name = `Signals_${key}`;
      mesh.castShadow = key !== 'paint'; mesh.receiveShadow = true; this.root.add(mesh);
    }
    [box, cylinder, pole, rim, hood].forEach(g => g.dispose());
    // Instance colours allow every direction and lamp state to share one draw.
    const led = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.lens = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), led, this.lamps.length);
    this.lens.name = 'SignalLenses';
    this.pedestrian = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), led, this.pixels.length);
    this.pedestrian.name = 'PedestrianLEDs';
    this.lamps.forEach((lamp, i) => this.lens.setMatrixAt(i, lamp.matrix));
    this.pixels.forEach((pixel, i) => this.pedestrian.setMatrixAt(i, pixel.matrix));
    this.lens.computeBoundingSphere(); this.pedestrian.computeBoundingSphere();
    this.root.add(this.lens, this.pedestrian); scene.add(this.root); this.update(0);
  }

  update(time: number) {
    if (this.dead) return;
    const phase = phaseAt(time), key = `${phase.stage}:${phase.pedestrianNS}:${phase.pedestrianEW}`;
    if (key === this.phaseKey) return;
    this.phaseKey = key;
    const lit = { red: new THREE.Color('#ef4c35'), yellow: new THREE.Color('#efad42'), green: new THREE.Color('#44cb98') };
    const unlit = { red: new THREE.Color('#301511'), yellow: new THREE.Color('#302716'), green: new THREE.Color('#102b22') };
    this.lamps.forEach((lamp, i) => this.lens.setColorAt(i, phase[lamp.axis] === lamp.color ? lit[lamp.color] : unlit[lamp.color]));
    this.pixels.forEach((pixel, i) => {
      const walk = pixel.axis === 'ns' ? phase.pedestrianNS : phase.pedestrianEW;
      const color = pixel.walking ? 'green' : 'red';
      this.pedestrian.setColorAt(i, walk === pixel.walking ? lit[color] : unlit[color]);
    });
    this.lens.instanceColor!.needsUpdate = true; this.pedestrian.instanceColor!.needsUpdate = true;
  }

  speedLimit(position: XZ, tangent: XZ, speed: number, time: number) {
    return speedLimit(position, tangent, speed, time);
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.root.removeFromParent();
    const owned = new Set(this.ownObstacles);
    for (let i = this.obstacleList.length - 1; i >= 0; i--) if (owned.has(this.obstacleList[i])) this.obstacleList.splice(i, 1);
    const materials = new Set<THREE.Material>();
    this.root.traverse(o => {
      if (o instanceof THREE.Mesh) {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
      }
    });
    materials.forEach(m => m.dispose());
  }
}
