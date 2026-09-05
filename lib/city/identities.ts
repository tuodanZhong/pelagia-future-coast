import * as THREE from 'three';

export type IdentityTower = { x: number; z: number; h: number; r: number; rot?: number; name?: string };
export type IdentityContext = {
  // The city's existing add() clones and batches geometry by material.
  add: (geometry: THREE.BufferGeometry, material: THREE.Material) => void;
};
export const BUILDING_IDENTITIES = [
  { en: 'PELAGIA GROUP', zh: '海境集团', emblem: 'pelagia' },
  { en: 'SAILHOUSE', zh: '白帆置业', emblem: 'sail' },
  { en: 'NORTHSTAR LABS', zh: '北辰科技', emblem: 'star' },
  { en: 'AERIS', zh: '云庭生活', emblem: 'aeris' },
  { en: 'MERIDIAN', zh: '远航实业', emblem: 'meridian' },
  { en: 'BLUEHAVEN', zh: '蓝湾资管', emblem: 'haven' },
  { en: 'TIDAL RESEARCH', zh: '潮汐研究院', emblem: 'tidal' },
  { en: 'VERDANT SKY', zh: '云上生态', emblem: 'verdant' },
] as const;

type Face = 'north' | 'south' | 'east' | 'west';
export type IdentityPlacement = {
  towerIndex: number;
  kind: 'tower' | 'entrance';
  company: string;
  chinese: string;
  face: Face;
  // Position lies exactly on the facade, before the mount gap is applied.
  position: { x: number; y: number; z: number };
  normal: { x: number; z: number };
  width: number;
  height: number;
  mountGap: number;
  flatHalfWidth: number;
  facadeTangentOffset: number;
  floor: number;
  floorBase: number;
  floorHeight: number;
};

function faceNormal(face: Face) {
  return face === 'north' ? { x: 0, z: -1 } : face === 'south' ? { x: 0, z: 1 }
    : face === 'east' ? { x: 1, z: 0 } : { x: -1, z: 0 };
}

function roadFace(t: IdentityTower): Face {
  const roads: { distance: number; face: Face }[] = [];
  for (const x of [-48, 48]) roads.push({ distance: Math.abs(x - t.x), face: x > t.x ? 'east' : 'west' });
  for (const z of [-132, -48, 48, 132]) roads.push({ distance: Math.abs(z - t.z), face: z > t.z ? 'south' : 'north' });
  roads.sort((a, b) => a.distance - b.distance);
  return roads[0].face;
}

/**
 * Matches architecture.ts's actual rounded rectangular floor plates and setbacks.
 * Its legacy rot field is deliberately not applied: the built facades are unrotated.
 * Signs fit inside a flat tangent section, so their corners never cut the curve.
 */
export function describeBuildingIdentities(towers: readonly IdentityTower[]): IdentityPlacement[] {
  const placements: IdentityPlacement[] = [];
  towers.slice(0, BUILDING_IDENTITIES.length).forEach((t, index) => {
    const identity = BUILDING_IDENTITIES[index];
    const residential = [1, 3, 5, 7].includes(index), landmark = index === 0;
    const floorHeight = residential ? 3.15 : 3.6;
    const floors = Math.floor((t.h - 12) / floorHeight);
    let floor = Math.max(0, floors - 2);
    // Every third residential floor has no projecting balcony or balcony rail.
    while (residential && floor % 3 !== 0 && floor > 0) floor--;
    const bw = t.r * (landmark ? 1.26 : 1.32), bd = t.r * (residential ? .91 : .93);
    const corner = landmark ? Math.min(bw, bd) * .72 : 2.5;
    const setback = floor > floors * .72 ? 1.4 : floor > floors * .42 && residential ? .55 : 0;
    const ww = bw - setback, dd = bd - setback * .65;
    // The principal landmark addresses the plaza; other companies address a road.
    const face = landmark ? 'south' : roadFace(t), normal = faceNormal(face);
    const flatHalfWidth = normal.z !== 0 ? ww - corner : dd - corner;
    const width = Math.min(landmark ? 9.6 : residential ? 7.5 : 8.2, flatHalfWidth * 2 - .65);
    const height = landmark ? 2.28 : residential ? 1.83 : 2.0;
    const floorBase = 12 + floor * floorHeight;
    placements.push({ towerIndex: index, kind: 'tower', company: identity.en, chinese: identity.zh, face,
      position: { x: t.x + normal.x * ww, y: floorBase + (residential ? 1.38 : 1.64), z: t.z + normal.z * dd }, normal,
      width, height, mountGap: .135, flatHalfWidth, facadeTangentOffset: 0, floor, floorBase, floorHeight });

    // The actual entrance is +Z for every podium. Place its plaque beside the
    // canopy and beyond the x=6 m column, where a pedestrian can read it directly.
    const entranceWidth = landmark ? 5.4 : 4.8, offset = landmark ? 9.6 : 9.3;
    placements.push({ towerIndex: index, kind: 'entrance', company: identity.en, chinese: identity.zh, face: 'south',
      position: { x: t.x + offset, y: 2.36, z: t.z + (t.r + 10) * .76 }, normal: { x: 0, z: 1 },
      width: entranceWidth, height: 1.3, mountGap: .15, flatHalfWidth: t.r + 10 - 4,
      facadeTangentOffset: offset, floor: 0, floorBase: .12, floorHeight: 3.45 });
  });
  return placements;
}

const ATLAS_WIDTH = 2048, ATLAS_HEIGHT = 1024, CELL_WIDTH = 1024, CELL_HEIGHT = 256;
const BOARD_COLOR = '#283335';

/** Eight bilingual marks share an opaque atlas; no alpha blending or glow. */
function makeWordmarkAtlas(): { texture: THREE.Texture; textAvailable: boolean } {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = ATLAS_WIDTH; canvas.height = ATLAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = BOARD_COLOR; ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
      const font = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif';
      const tracked = (text: string, x: number, y: number, tracking: number, maxWidth: number) => {
        const widths = Array.from(text, character => ctx.measureText(character).width);
        const width = widths.reduce((a, b) => a + b, 0) + Math.max(0, text.length - 1) * tracking;
        const scale = Math.min(1, maxWidth / Math.max(1, width));
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, 1);
        let at = 0;
        Array.from(text).forEach((character, i) => { ctx.fillText(character, at, 0); at += widths[i] + tracking; });
        ctx.restore();
      };
      BUILDING_IDENTITIES.forEach((identity, i) => {
        const x = (i % 2) * CELL_WIDTH, y = Math.floor(i / 2) * CELL_HEIGHT;
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        ctx.font = `600 90px ${font}`; ctx.fillStyle = '#e9e6db';
        tracked(identity.zh, x + 34, y + 116, 11, 956);
        ctx.font = `500 63px ${font}`; ctx.fillStyle = '#c5cfcb';
        tracked(identity.en, x + 38, y + 207, 4.5, 948);
      });
      const texture = new THREE.CanvasTexture(canvas); texture.name = 'Building identities / bilingual atlas';
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
      return { texture, textAvailable: true };
    }
  }
  // Node can build and verify all physical geometry without a DOM or font API.
  const texture = new THREE.DataTexture(new Uint8Array([40, 51, 53, 255]), 1, 1);
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return { texture, textAvailable: false };
}

function roundedShape(width: number, height: number, radius: number) {
  const s = new THREE.Shape(), x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2);
  s.moveTo(x + r, y); s.lineTo(x + width - r, y); s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

function polygon(points: [number, number][]) {
  const s = new THREE.Shape(); s.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) s.lineTo(...points[i]); s.closePath(); return s;
}

function ribbon(points: THREE.Vector2[], width: number) {
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tangent = b.clone().sub(a).normalize(), dx = -tangent.y * width / 2, dy = tangent.x * width / 2;
    left.push([points[i].x + dx, points[i].y + dy]); right.push([points[i].x - dx, points[i].y - dy]);
  }
  return polygon([...left, ...right.reverse()]);
}

/** Authored geometric emblems: cast metal/ceramic pieces, never downloaded logos. */
function emblemShapes(kind: typeof BUILDING_IDENTITIES[number]['emblem']) {
  const shapes: { shape: THREE.Shape; accent?: boolean }[] = [];
  const line = (points: [number, number][], width: number, accent = false) => shapes.push({ shape: ribbon(points.map(p => new THREE.Vector2(...p)), width), accent });
  const arc = (rx: number, ry: number, start: number, end: number, width: number, accent = false) => line(Array.from({ length: 33 }, (_, i) => {
    const angle = start + (end - start) * i / 32; return [Math.cos(angle) * rx, Math.sin(angle) * ry] as [number, number];
  }), width, accent);
  if (kind === 'pelagia' || kind === 'tidal') {
    for (let row = 0; row < 3; row++) line(Array.from({ length: 25 }, (_, i) => {
      const x = -.46 + i * .92 / 24;
      return [x, (row - 1) * .235 + Math.sin((x + .48) * Math.PI * (kind === 'tidal' ? 2 : 1.6)) * .085] as [number, number];
    }), rowWidth(kind), row === 0);
    if (kind === 'pelagia') shapes.push({ shape: polygon([[-.06, .19], [.33, .43], [.40, .17]]), accent: true });
  } else if (kind === 'sail') {
    shapes.push({ shape: polygon([[-.39, -.27], [.05, .46], [.05, -.27]]) });
    shapes.push({ shape: polygon([[.12, -.27], [.12, .34], [.45, -.27]]), accent: true });
    line([[-.44, -.37], [.39, -.37]], .07);
  } else if (kind === 'star') {
    const points: [number, number][] = Array.from({ length: 8 }, (_, i) => {
      const a = Math.PI / 2 + i * Math.PI / 4, r = i % 2 === 0 ? .46 : .13;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    shapes.push({ shape: polygon(points) }); arc(.29, .29, Math.PI * 1.08, Math.PI * 1.92, .055, true);
  } else if (kind === 'aeris') {
    shapes.push({ shape: polygon([[-.46, -.38], [-.29, -.38], [.02, .40], [-.08, .40]]) });
    shapes.push({ shape: polygon([[.06, .4], [.43, -.38], [.26, -.38], [-.04, .26]]), accent: true });
    line([[-.12, -.16], [.15, -.16]], .07);
  } else if (kind === 'meridian') {
    arc(.33, .44, 0, Math.PI * 2, .065); arc(.15, .44, 0, Math.PI * 2, .04, true);
    line([[-.45, -.1], [.45, .1]], .06, true);
  } else if (kind === 'haven') {
    arc(.44, .40, Math.PI * .95, Math.PI * 2.05, .075); arc(.26, .24, Math.PI * .95, Math.PI * 2.05, .065, true);
    shapes.push({ shape: polygon([[-.10, .07], [.12, .37], [.34, .07]]), accent: true });
  } else {
    const leaf = (side: number) => {
      const s = new THREE.Shape(); s.moveTo(0, -.28);
      s.bezierCurveTo(side * .47, -.19, side * .46, .18, side * .35, .39);
      s.bezierCurveTo(side * .02, .37, side * .04, .01, 0, -.28); return s;
    };
    shapes.push({ shape: leaf(-1) }, { shape: leaf(1), accent: true }); line([[0, -.42], [0, .04]], .045);
  }
  return shapes;
}

function rowWidth(kind: 'pelagia' | 'tidal') { return kind === 'pelagia' ? .073 : .087; }

/**
 * Add immediately after buildArchitecture(), before the world's material batches
 * are merged. No scene, DOM, loading manager, external font, or obstacle required.
 */
export function buildBuildingIdentities(ctx: IdentityContext, towers: readonly IdentityTower[]) {
  const placements = describeBuildingIdentities(towers), atlas = makeWordmarkAtlas();
  const materials = {
    frame: new THREE.MeshStandardMaterial({ color: '#92968f', metalness: .72, roughness: .4 }),
    board: new THREE.MeshStandardMaterial({ color: BOARD_COLOR, metalness: .28, roughness: .52 }),
    mark: new THREE.MeshStandardMaterial({ color: '#e0ddd1', metalness: .38, roughness: .37 }),
    accent: new THREE.MeshStandardMaterial({ color: '#a59a7d', metalness: .66, roughness: .46 }),
    words: new THREE.MeshStandardMaterial({ map: atlas.texture, color: 0xffffff, roughness: .62, metalness: .12 }),
  };
  Object.entries(materials).forEach(([key, material]) => { material.name = `BuildingIdentity_${key}`; });
  const bolt = new THREE.CylinderGeometry(1, 1, 1, 10); bolt.rotateX(Math.PI / 2);
  let pieces = 0;
  for (const p of placements) {
    const yaw = Math.atan2(p.normal.x, p.normal.z);
    const basis = new THREE.Matrix4().makeRotationY(yaw).setPosition(p.position.x, p.position.y, p.position.z);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
      geometry.applyMatrix4(basis.clone().multiply(transform)); ctx.add(geometry, material); geometry.dispose(); pieces++;
    };
    const extrusion = (shape: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10, steps: 1 });
    const front = p.mountGap + .11;
    add(extrusion(roundedShape(p.width, p.height, .08), .085), materials.frame, 0, 0, p.mountGap);
    add(extrusion(roundedShape(p.width - .055, p.height - .055, .061), .025), materials.board, 0, 0, p.mountGap + .085);
    // Real stand-off mounts terminate in the wall. Four front fasteners retain the plaque.
    for (const x of [-p.width / 2 + .16, p.width / 2 - .16]) for (const y of [-p.height / 2 + .15, p.height / 2 - .15]) {
      add(bolt.clone(), materials.frame, x, y, p.mountGap / 2, .041, .041, p.mountGap + .012);
      add(bolt.clone(), materials.frame, x, y, front + .007, .026, .026, .014);
    }
    const margin = p.kind === 'tower' ? .30 : .22;
    const logoSize = p.height * .66;
    const logoX = -p.width / 2 + margin + logoSize / 2;
    for (const emblem of emblemShapes(BUILDING_IDENTITIES[p.towerIndex].emblem)) {
      add(extrusion(emblem.shape, .065 / logoSize), emblem.accent ? materials.accent : materials.mark, logoX, .005, front + .012, logoSize, logoSize, logoSize);
    }
    const textLeft = logoX + logoSize / 2 + margin * .7;
    const textWidth = p.width / 2 - margin - textLeft;
    const textHeight = Math.min(p.height - .18, textWidth / 4);
    const text = new THREE.PlaneGeometry(textWidth, textHeight);
    const uv = text.attributes.uv, column = p.towerIndex % 2, row = Math.floor(p.towerIndex / 2);
    // Half-texel inset plus 30+ px safe padding prevents inter-cell mip bleeding.
    for (let i = 0; i < uv.count; i++) {
      const u = (column * CELL_WIDTH + .5 + uv.getX(i) * (CELL_WIDTH - 1)) / ATLAS_WIDTH;
      const v = 1 - (row * CELL_HEIGHT + .5 + (1 - uv.getY(i)) * (CELL_HEIGHT - 1)) / ATLAS_HEIGHT;
      uv.setXY(i, u, v);
    }
    add(text, materials.words, textLeft + textWidth / 2, 0, front + .004);
  }
  bolt.dispose();
  return { placements, materials, atlas: atlas.texture, textAvailable: atlas.textAvailable,
    stats: { plaques: placements.length, companies: Math.min(towers.length, BUILDING_IDENTITIES.length), materialBatches: 5, pieces, atlasWidth: ATLAS_WIDTH, atlasHeight: ATLAS_HEIGHT } };
}
