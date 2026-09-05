import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Structural subset of DetailKit, so this file can be copied without path changes. */
export type RetailContext = {
  root: THREE.Group;
  obstacles: { x: number; z: number; rx: number; rz: number; shape?: 'ellipse' | 'box'; height?: number }[];
  add: (g: THREE.BufferGeometry, m: THREE.Material, x?: number, y?: number, z?: number, sx?: number, sy?: number, sz?: number, ry?: number) => void;
  block: (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rot?: number) => void;
  pipe: (points: THREE.Vector3[], radius: number, material: THREE.Material, segments?: number) => void;
  white: THREE.Material; steel: THREE.Material; dark: THREE.Material;
};

export type RetailPlacement = {
  id: 'atelier-ligne' | 'sonata';
  tower: string;
  /** World point on the podium's existing solid side wall, not a detached pavilion. */
  x: number; z: number;
  rotation: number;
  kind: 'clothing' | 'piano';
};

export const RETAIL_PLACEMENTS: readonly RetailPlacement[] = [
  { id: 'atelier-ligne', tower: '白帆公馆', x: -77, z: 75, rotation: Math.PI / 2, kind: 'clothing' },
  { id: 'sonata', tower: '海镜中心', x: 76.5, z: 74, rotation: -Math.PI / 2, kind: 'piano' },
];

const FLOOR = .46;
const WIDTH = 11.5;
const DEPTH = 4.2;
const SHOP_HEIGHT = 3.39;
const signText = [
  ['线 衣', 'ATELIER LIGNE', 'CONTEMPORARY WARDROBE'],
  ['和声琴行', 'SONATA', 'PIANOS · MUSIC · EVERY DAY'],
  ['日常，亦有轮廓', 'NATURAL TEXTURES', 'THE COASTAL COLLECTION'],
  ['织物与线条', 'LINEN · WOOL · COTTON', 'SELECTED BY ATELIER LIGNE'],
  ['SONATA', 'GRAND PIANO', '88 KEYS · ACOUSTIC COLLECTION'],
  ['和声之选', 'UPRIGHT PIANO', '音乐，从日常开始'],
  ['SONATA', 'PIANO COLLECTION', 'EST. PELAGIA'],
  ['线 衣', 'ATELIER LIGNE', 'NEW SEASON'],
];

function makeSignAtlas() {
  const material = new THREE.MeshStandardMaterial({
    name: 'RetailSignAtlas', color: '#e3dccd', roughness: .83,
    emissive: '#f5e6cf', emissiveIntensity: .13, side: THREE.DoubleSide,
  });
  if (typeof document === 'undefined') return material;
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const context = canvas.getContext('2d'); if (!context) return material;
  signText.forEach(([title, subtitle, note], i) => {
    const x = (i % 2) * 1024, y = Math.floor(i / 2) * 256, isPiano = [1, 4, 5, 6].includes(i);
    context.fillStyle = isPiano ? '#302f2b' : '#d6cbb9'; context.fillRect(x, y, 1024, 256);
    context.fillStyle = isPiano ? '#d6c6a2' : '#3c423d';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `500 ${i < 2 ? 72 : 59}px Georgia, "Noto Serif CJK SC", serif`;
    context.fillText(title, x + 512, y + 76, 920);
    context.font = `${i < 2 ? 38 : 32}px Georgia, serif`;
    context.fillText(subtitle, x + 512, y + 153, 940);
    context.font = '21px Arial, sans-serif'; context.fillText(note, x + 512, y + 211, 950);
    context.strokeStyle = isPiano ? '#8a7859' : '#9b947e'; context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(x + 68, y + 237); context.lineTo(x + 956, y + 237); context.stroke();
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  material.map = texture; material.color.set('#ffffff'); return material;
}

/** Call before DetailKit's material batches flush. No ground-floor glass must be removed. */
export function buildRetail<Ctx extends RetailContext>(ctx: Ctx, placements: readonly RetailPlacement[] = RETAIL_PLACEMENTS) {
  const standard = (name: string, color: string, roughness = .8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
  const stone = standard('RetailLimestone', '#b8b1a4', .88);
  const plaster = standard('RetailWarmPlaster', '#bcb5a5', .94);
  const oak = standard('RetailOak', '#92785b', .82);
  const walnut = standard('RetailWalnut', '#675343', .65);
  const brass = standard('RetailBrass', '#a2926d', .33, .68);
  const fabricIvory = standard('RetailIvoryFabric', '#c8c2b3', .97);
  const fabricSage = standard('RetailSageFabric', '#778474', .95);
  const fabricInk = standard('RetailInkFabric', '#38444e', .94);
  const fabricRust = standard('RetailRustFabric', '#8f6c58', .95);
  const mannequinMaterial = standard('RetailMannequin', '#c8c4ba', .57);
  const ivory = standard('PianoIvoryKeys', '#e8e4d8', .34);
  const ebony = standard('PianoEbonyKeys', '#161b1b', .26);
  const leather = standard('PianoBenchLeather', '#343531', .78);
  const pianoBlack = new THREE.MeshPhysicalMaterial({
    name: 'PianoPolishedEbony', color: '#202826', roughness: .18, metalness: .06,
    clearcoat: .8, clearcoatRoughness: .13, envMapIntensity: 1.0,
  });
  const warm = new THREE.MeshStandardMaterial({
    name: 'RetailWarmLights', color: '#eadfc7', emissive: '#f1d4a1', emissiveIntensity: .5, roughness: .45,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: 'RetailClearDisplayGlass', color: '#bdc5bd', roughness: .085, metalness: .02,
    transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: .60,
  });
  const signs = makeSignAtlas();
  const box = new RoundedBoxGeometry(1, 1, 1, 1, .024);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 14);
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const knob = new THREE.SphereGeometry(1, 8, 6);
  const panes: THREE.BufferGeometry[] = [];

  function frame(x: number, z: number, rotation: number, floor = FLOOR) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const point = (u: number, y: number, v: number) => new THREE.Vector3(x + u * c + v * s, floor + y, z - u * s + v * c);
    return {
      point,
      at(u: number, v: number, angle = 0, rise = 0) { const p = point(u, 0, v); return frame(p.x, p.z, rotation + angle, floor + rise); },
      block(m: THREE.Material, u: number, y: number, v: number, w: number, h: number, d: number, turn = 0) {
        const p = point(u, y, v); ctx.block(m, p.x, p.y, p.z, w, h, d, rotation + turn);
      },
      shape(g: THREE.BufferGeometry, m: THREE.Material, u = 0, y = 0, v = 0, sx = 1, sy = 1, sz = 1, angle = 0) {
        const p = point(u, y, v); ctx.add(g, m, p.x, p.y, p.z, sx, sy, sz, rotation + angle);
      },
      pipe(points: [number, number, number][], r: number, m: THREE.Material, segments = 8) {
        ctx.pipe(points.map(([u, y, v]) => point(u, y, v)), r, m, segments);
      },
      bar(a: [number, number, number], b: [number, number, number], bottomRadius: number, topRadius: number, m: THREE.Material, radial = 10) {
        const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), direction = vb.clone().sub(va);
        const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, direction.length(), radial);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
        geometry.translate(...va.add(vb).multiplyScalar(.5).toArray());
        this.shape(geometry, m); geometry.dispose();
      },
      label(tile: number, u: number, y: number, v: number, w: number, h: number) {
        const geometry = new THREE.PlaneGeometry(w, h), uv = geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile % 2 + uv.getX(i)) / 2, (3 - Math.floor(tile / 2) + uv.getY(i)) / 4);
        this.shape(geometry, signs, u, y, v); geometry.dispose();
      },
      pane(u: number, y: number, v: number, w: number, h: number, turn = 0) {
        const transform = new THREE.Matrix4().makeRotationY(rotation + turn); transform.setPosition(point(u, y, v));
        panes.push(new THREE.PlaneGeometry(w, h).applyMatrix4(transform));
      },
      light(u: number, y: number, v: number) {
        const lamp = new THREE.PointLight('#f3ddbb', 12, 7, 2); lamp.position.copy(point(u, y, v)); lamp.castShadow = false;
        lamp.name = 'RetailDisplayFill'; ctx.root.add(lamp);
      },
      obstacle(u: number, v: number, w: number, d: number, height: number) {
        const p = point(u, 0, v);
        ctx.obstacles.push({ x: p.x, z: p.z, rx: Math.abs(c) * w / 2 + Math.abs(s) * d / 2, rz: Math.abs(s) * w / 2 + Math.abs(c) * d / 2, height, shape: 'box' });
      },
    };
  }
  type Frame = ReturnType<typeof frame>;

  function shell(f: Frame, kind: RetailPlacement['kind']) {
    // Podium attachment: the back panel lies 4 cm outside the existing solid wall.
    // The raised display floor finishes 2 cm above the existing podium floor to avoid z-fighting.
    f.block(stone, 0, -.18, DEPTH / 2, WIDTH + .28, .34, DEPTH + .12);
    f.block(kind === 'clothing' ? oak : walnut, 0, -.012, DEPTH / 2, WIDTH + .12, .045, DEPTH + .09);
    f.block(plaster, 0, 1.52, .085, WIDTH, 3.04, .09);
    for (const side of [-1, 1]) {
      f.block(stone, side * (WIDTH / 2 - .05), 1.50, DEPTH / 2, .17, 3.03, DEPTH);
      for (let j = 0; j < 7; j++) f.block(kind === 'clothing' ? oak : walnut, side * (WIDTH / 2 - .151), 1.5, .6 + j * .43, .038, 2.96, .065);
    }
    f.block(stone, 0, 3.245, DEPTH / 2, WIDTH + .33, .24, DEPTH + .32);
    f.block(ctx.dark, 0, 3.386, DEPTH / 2, WIDTH + .36, .04, DEPTH + .34);
    f.block(kind === 'clothing' ? plaster : walnut, 0, 3.13, DEPTH + .03, WIDTH + .23, .48, .14);
    f.label(kind === 'clothing' ? 0 : 1, 0, 3.15, DEPTH + .109, 6.40, .39);
    f.block(brass, 0, 2.888, DEPTH + .11, WIDTH + .13, .025, .035);
    const divisions = kind === 'clothing' ? [-5.64, -1.92, 1.92, 5.64] : [-5.64, -.72, 3.21, 5.64];
    for (const u of divisions) f.block(brass, u, 1.47, DEPTH + .022, .042, 2.82, .065);
    f.block(brass, 0, .075, DEPTH + .022, 11.32, .055, .064);
    for (let j = 0; j < divisions.length - 1; j++) {
      const left = divisions[j], right = divisions[j + 1]; f.pane((left + right) / 2, 1.475, DEPTH + .032, right - left - .045, 2.745);
    }
    // Suspended track heads and physical warm fill, with no extra shadow passes.
    f.block(ctx.dark, 0, 3.025, 2.79, 10.48, .04, .046);
    for (let i = 0; i < 7; i++) {
      const u = -4.70 + i * 1.56;
      f.shape(cylinder, ctx.dark, u, 2.928, 2.78, .057, .16, .057);
      f.shape(cylinder, warm, u, 2.842, 2.78, .048, .012, .048);
    }
    f.block(warm, 0, 2.969, .41, 10.30, .025, .040);
    f.light(0, 2.74, 2.63);
    // Closed displays share the podium barrier; there is no fake door or entry prompt.
    f.obstacle(0, DEPTH / 2, WIDTH + .24, DEPTH + .16, SHOP_HEIGHT + FLOOR);
  }

  function torso(f: Frame, material: THREE.Material, profile: [number, number, number][], folds = 0) {
    const vertices: number[] = [], indices: number[] = [], around = 28;
    profile.forEach(([y, rx, rz], level) => {
      for (let j = 0; j <= around; j++) {
        const a = j / around * Math.PI * 2, fold = 1 + Math.cos(a * 9) * folds * (1 - level / profile.length);
        vertices.push(Math.cos(a) * rx * fold, y, Math.sin(a) * rz * fold);
        if (level < profile.length - 1 && j < around) { const n = level * (around + 1) + j; indices.push(n, n + around + 1, n + 1, n + 1, n + around + 1, n + around + 2); }
      }
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    f.shape(geometry, material); geometry.dispose();
  }

  function mannequin(f: Frame, dress: boolean) {
    f.shape(cylinder, brass, 0, .022, 0, .30, .044, .30);
    for (const side of [-1, 1]) {
      const shift = side < 0 ? -.025 : .025;
      f.bar([side * .10, .13, .01 + shift], [side * .11, .91, shift], .043, .073, mannequinMaterial, 12);
      f.shape(box, dress ? walnut : ebony, side * .10, .087, .06 + shift, .095, .065, .225);
      if (!dress) f.bar([side * .10, .18, shift], [side * .115, .96, shift], .060, .095, fabricInk, 14);
    }
    torso(f, mannequinMaterial, [[.92, .18, .11], [1.15, .15, .09], [1.36, .235, .12], [1.45, .25, .105], [1.49, .10, .07]]);
    if (dress) {
      torso(f, fabricSage, [[.43, .38, .24], [.64, .34, .22], [.96, .29, .18], [1.12, .187, .116], [1.28, .225, .14], [1.42, .255, .12], [1.47, .105, .074]], .043);
      const belt = new THREE.TorusGeometry(.197, .012, 5, 36); belt.rotateX(Math.PI / 2); f.shape(belt, oak, 0, 1.115, 0, 1, 1, .63); belt.dispose();
      f.shape(box, brass, .04, 1.116, .125, .051, .035, .012);
    } else {
      torso(f, fabricIvory, [[.91, .195, .135], [1.12, .175, .12], [1.33, .235, .15], [1.44, .278, .13], [1.485, .093, .076]], .008);
      f.block(ivory, 0, 1.33, .148, .083, .23, .018);
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape(); shape.moveTo(side * .066, 1.46); shape.lineTo(side * .19, 1.38); shape.lineTo(side * .025, 1.17); shape.lineTo(side * .044, 1.34); shape.closePath();
        const lapel = new THREE.ExtrudeGeometry(shape, { depth: .012, bevelEnabled: false }); f.shape(lapel, fabricIvory, 0, 0, .149); lapel.dispose();
        f.block(oak, side * .116, 1.02, .143, .076, .008, .012);
      }
      for (let i = 0; i < 3; i++) f.shape(knob, brass, .025, 1.25 - i * .096, .153, .012, .012, .006);
    }
    f.bar([0, 1.44, 0], [0, 1.60, 0], .05, .043, mannequinMaterial, 12);
    f.shape(sphere, mannequinMaterial, 0, 1.71, .005, .089, .122, .092);
    for (const side of [-1, 1]) {
      const bend = side < 0 ? -.045 : .075, material = dress ? fabricSage : fabricIvory;
      f.bar([side * .245, 1.415, 0], [side * .31, 1.16, bend], .088, .067, material, 12);
      f.shape(sphere, material, side * .30, 1.17, bend, .065, .067, .062);
      f.bar([side * .31, 1.17, bend], [side * .31, .985, bend + .045], .063, .043, material, 12);
      f.shape(sphere, mannequinMaterial, side * .31, .934, bend + .050, .036, .063, .025);
    }
  }

  function hangingGarment(f: Frame, material: THREE.Material, long = false) {
    const top = 1.50, bottom = long ? .42 : .68;
    const outline = new THREE.Shape();
    outline.moveTo(-.055, top); outline.lineTo(-.205, top - .063); outline.lineTo(-.348, top - .28);
    outline.lineTo(-.254, top - .34); outline.lineTo(-.192, top - .213); outline.lineTo(-.207, bottom);
    outline.quadraticCurveTo(0, bottom - .026, .207, bottom); outline.lineTo(.192, top - .213);
    outline.lineTo(.254, top - .34); outline.lineTo(.348, top - .28); outline.lineTo(.205, top - .063); outline.lineTo(.055, top);
    outline.quadraticCurveTo(0, top - .061, -.055, top); outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: .039, bevelEnabled: true, bevelSize: .009, bevelThickness: .009, bevelSegments: 2, curveSegments: 5 });
    f.shape(geometry, material); geometry.dispose();
    f.pipe([[-.22, 1.445, .015], [0, 1.545, .015], [.22, 1.445, .015], [-.22, 1.445, .015]], .010, oak, 8);
    f.pipe([[0, 1.543, .015], [0, 1.610, .015], [.022, 1.64, .015], [.048, 1.625, .015]], .007, brass, 5);
    f.block(paperMaterial(), .052, 1.373, .054, .028, .064, .005);
  }
  // Shared ivory fabric doubles as matte paper garment tags, avoiding another material batch.
  function paperMaterial() { return fabricIvory; }

  function clothing(f: Frame) {
    f.label(2, -3.48, 2.34, .208, 3.46, .82);
    f.label(3, 3.17, 2.46, .208, 3.47, .75);
    for (let j = 0; j < 20; j++) f.block(oak, -5.28 + j * .54, 1.47, .149, .027, 2.73, .06);
    f.shape(box, plaster, -3.67, .062, 3.02, 1.43, .124, 1.25);
    f.shape(box, plaster, -.28, .10, 2.98, 1.46, .20, 1.37);
    const left = f.at(-3.67, 3.02, .12, .124), centre = f.at(-.28, 2.98, -.13, .20);
    mannequin(left, true); mannequin(centre, false);
    // Physical rack with visible hooks and staggered garments, rather than a painted clothes wall.
    const rack = f.at(3.30, 2.71, -.15);
    for (const side of [-1, 1]) {
      rack.bar([side * 1.14, .055, 0], [side * 1.14, 1.66, 0], .019, .019, brass);
      rack.bar([side * 1.14, .035, -.32], [side * 1.14, .035, .32], .023, .023, brass);
    }
    rack.bar([-1.14, 1.66, 0], [1.14, 1.66, 0], .019, .019, brass);
    const fabrics = [fabricIvory, fabricRust, fabricSage, fabricInk];
    for (let j = 0; j < 7; j++) hangingGarment(rack.at(-.87 + j * .29, 0, .98), fabrics[j % fabrics.length], j % 3 === 0);
    // Wall shelving with tidy, individually layered folded garments and accessories.
    for (let level = 0; level < 3; level++) {
      const y = .62 + level * .47;
      f.block(oak, 2.98, y, .53, 4.38, .062, .67);
      for (let stack = 0; stack < 4; stack++) for (let layer = 0; layer < 3; layer++) {
        f.shape(box, fabrics[(stack + level) % 4], 1.36 + stack * 1.06, y + .065 + layer * .040, .52, .64, .042, .40);
      }
    }
    for (const u of [.73, 5.24]) f.block(brass, u, 1.24, .24, .033, 1.58, .028);
    f.shape(box, oak, -2.12, .31, 1.11, 2.27, .62, .95);
    f.shape(box, plaster, -2.12, .65, 1.11, 2.40, .064, 1.02);
    for (let j = 0; j < 3; j++) for (let layer = 0; layer < 3; layer++) f.shape(box, fabrics[j], -2.86 + j * .75, .708 + layer * .048, 1.14, .56, .052, .51);
    f.shape(box, walnut, 4.60, .17, 3.63, .54, .34, .28);
    f.pipe([[4.42, .35, 3.63], [4.44, .58, 3.63], [4.72, .58, 3.63], [4.78, .35, 3.63]], .019, walnut, 10);
    f.label(7, 4.62, .19, 3.778, .35, .10);
  }

  // The keyboard is a complete 88-key sequence, A0–C8: 52 white and 36 black keys.
  function keyboard(f: Frame, y: number, z: number, width = 1.23) {
    const whiteCount = 52, step = width / whiteCount, isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
    let whiteIndex = 0;
    f.block(ebony, 0, y - .020, z, width + .028, .048, .213);
    for (let note = 21; note <= 108; note++) {
      if (isBlack(note)) {
        f.block(ebony, -width / 2 + whiteIndex * step, y + .033, z - .047, step * .61, .035, .114);
      } else {
        f.block(ivory, -width / 2 + (whiteIndex + .5) * step, y + .008, z, step - .0009, .019, .192); whiteIndex++;
      }
    }
  }

  function pianoOutline() {
    // Shape Y is negative world Z before the horizontal extrusion is rotated.
    const shape = new THREE.Shape(); shape.moveTo(-.76, -.66); shape.lineTo(.76, -.66); shape.lineTo(.76, -.28);
    shape.bezierCurveTo(.75, .10, .42, .36, .43, .76); shape.bezierCurveTo(.40, 1.17, .09, 1.53, -.31, 1.54);
    shape.bezierCurveTo(-.63, 1.54, -.76, 1.32, -.76, .96); shape.lineTo(-.76, -.66); shape.closePath(); return shape;
  }

  function horizontalShape(shape: THREE.Shape, depth: number, bevel = 0) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 18 });
    geometry.rotateX(-Math.PI / 2); return geometry;
  }

  function pianoBench(f: Frame, z: number, width = .69) {
    for (const side of [-1, 1]) for (const end of [-1, 1]) f.bar([side * (width / 2 - .075), .035, z + end * .18], [side * (width / 2 - .070), .435, z + end * .17], .022, .032, pianoBlack);
    f.shape(box, pianoBlack, 0, .417, z, width + .04, .075, .46);
    f.shape(box, leather, 0, .477, z, width + .055, .090, .468);
    for (const side of [-1, 1]) f.shape(knob, ebony, side * (width / 2 + .038), .43, z, .019, .039, .039);
    for (const u of [-.19, .19]) for (const v of [-.11, .11]) f.shape(knob, ebony, u, .522, z + v, .010, .004, .010);
  }

  function grandPiano(f: Frame) {
    const rimShape = pianoOutline();
    const hole = new THREE.Path(pianoOutline().getPoints(48).map(p => new THREE.Vector2(p.x * .927, p.y * .945)));
    rimShape.holes.push(hole);
    const rim = horizontalShape(rimShape, .195, .005); f.shape(rim, pianoBlack, 0, .703, 0); rim.dispose();
    const board = horizontalShape(pianoOutline(), .026); f.shape(board, oak, -.017, .827, -.012, .917, 1, .933); board.dispose();
    const lower = horizontalShape(pianoOutline(), .040); f.shape(lower, pianoBlack, 0, .699, 0); lower.dispose();
    f.shape(box, pianoBlack, 0, .713, .776, 1.49, .083, .43);
    keyboard(f, .756, .827);
    for (const side of [-1, 1]) f.shape(box, pianoBlack, side * .713, .81, .823, .062, .14, .31);
    f.block(pianoBlack, 0, .884, .652, 1.36, .17, .036);
    f.label(6, 0, .894, .675, .34, .078);
    // Golden plate braces, string courses and tuning pins remain visible below the raised lid.
    f.pipe([[-.67, .868, .45], [-.65, .876, -.72], [-.50, .883, -1.20]], .026, brass, 12);
    f.pipe([[.60, .870, .41], [.13, .882, -.15], [-.43, .883, -1.16]], .034, brass, 12);
    for (let i = 0; i < 36; i++) {
      const u = -.58 + i * .032;
      f.pipe([[u, .883, .44], [u * .30 - .33, .890, -1.08 - Math.sin(i * .06) * .12]], .0016, brass, 1);
      f.shape(cylinder, ctx.steel, u, .887, .463, .005, .025, .005);
    }
    const lid = horizontalShape(pianoOutline(), .042, .005);
    lid.translate(.76, 0, 0); lid.rotateZ(.43); lid.translate(-.76, .936, 0);
    f.shape(lid, pianoBlack); lid.dispose();
    f.bar([.57, .885, -.03], [.61, 1.553, -.03], .014, .012, walnut, 10);
    for (const z of [-1.09, -.29, .39]) f.bar([-.767, .933, z - .055], [-.767, .933, z + .055], .010, .010, brass, 8);
    for (const [u, v] of [[-.63, .46], [.63, .46], [-.47, -1.15]]) {
      f.bar([u, .083, v], [u, .718, v], .036, .057, pianoBlack, 12);
      f.shape(knob, brass, u, .048, v, .040, .040, .034);
    }
    for (const side of [-1, 1]) f.bar([side * .075, .18, .37], [side * .12, .681, .36], .015, .019, pianoBlack, 10);
    f.shape(box, walnut, 0, .158, .38, .29, .075, .14);
    for (let i = 0; i < 3; i++) f.shape(box, brass, -.073 + i * .073, .13, .479, .043, .025, .19);
    const musicDesk = new THREE.BoxGeometry(.54, .235, .018); musicDesk.rotateX(-.24); f.shape(musicDesk, pianoBlack, 0, 1.062, .392); musicDesk.dispose();
    f.block(brass, 0, .938, .419, .57, .018, .043);
    pianoBench(f, 1.47);
  }

  function uprightPiano(f: Frame) {
    f.shape(box, pianoBlack, 0, .73, 0, 1.47, 1.18, .49);
    f.shape(box, pianoBlack, 0, 1.33, 0, 1.54, .065, .55);
    f.block(walnut, 0, .399, .256, 1.30, .52, .017);
    f.block(pianoBlack, 0, .403, .27, 1.24, .45, .012);
    for (const side of [-1, 1]) f.block(brass, side * .63, .41, .279, .009, .45, .008);
    f.block(brass, 0, .623, .279, 1.26, .010, .009);
    f.shape(box, pianoBlack, 0, .727, .343, 1.50, .08, .315);
    keyboard(f, .768, .381);
    f.block(pianoBlack, 0, .899, .274, 1.37, .20, .030);
    f.label(6, 0, 1.052, .252, .37, .093);
    for (const side of [-1, 1]) {
      f.bar([side * .638, .059, .36], [side * .638, .745, .36], .037, .042, pianoBlack, 12);
      f.shape(knob, brass, side * .638, .032, .36, .033, .028, .031);
    }
    for (let i = 0; i < 3; i++) f.shape(box, brass, -.075 + i * .075, .097, .402, .042, .024, .19);
    f.block(pianoBlack, 0, 1.043, .301, .55, .19, .020);
    f.block(brass, 0, .942, .325, .60, .015, .056);
    pianoBench(f, .90, .62);
  }

  function pianoShop(f: Frame) {
    f.label(4, -3.30, 2.29, .218, 3.52, .79);
    f.label(5, 1.41, 2.37, .218, 2.84, .78);
    for (let i = 0; i < 24; i++) f.block(walnut, -5.33 + i * .455, 1.49, .161, .031, 2.80, .08);
    // Rugs define the displays at the same floor level as the attached podium.
    f.block(leather, -3.24, .017, 2.07, 3.33, .030, 3.76);
    f.block(leather, 1.38, .017, 2.74, 2.20, .030, 2.22);
    grandPiano(f.at(-3.25, 2.10, -.08, .033)); uprightPiano(f.at(1.37, 2.67, .02, .033));
    // Sheet music, a second music stand and small instrument-care display.
    f.shape(box, walnut, 4.35, .57, .54, 1.69, 1.14, .65);
    for (let shelf = 0; shelf < 3; shelf++) {
      f.block(oak, 4.35, .31 + shelf * .35, .88, 1.54, .032, .035);
      for (let book = 0; book < 6; book++) f.shape(box, book % 2 ? fabricIvory : fabricInk, 3.75 + book * .235, .45 + shelf * .34, .91, .205, .28, .043, (book % 3 - 1) * .025);
    }
    const stand = f.at(4.40, 2.80, -.12);
    stand.bar([0, .06, 0], [0, 1.15, 0], .014, .012, ctx.dark);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3; stand.bar([0, .19, 0], [Math.cos(a) * .25, .04, Math.sin(a) * .25], .012, .010, ctx.dark);
    }
    const desk = new THREE.BoxGeometry(.46, .31, .017); desk.rotateX(-.22); stand.shape(desk, ctx.dark, 0, 1.21, 0); desk.dispose();
    stand.block(fabricIvory, 0, 1.205, .04, .36, .25, .006);
    for (let i = 0; i < 8; i++) stand.block(ctx.dark, 0, 1.10 + i * .026, .046, .28, .002, .003);
  }

  const result = placements.map(placement => {
    const f = frame(placement.x, placement.z, placement.rotation);
    shell(f, placement.kind); if (placement.kind === 'clothing') clothing(f); else pianoShop(f);
    const sign = f.point(0, 3.15, DEPTH + .12);
    const navigation = f.point(0, 0, 10.40);
    const camera = f.point(-1.1, 1.515, 11.0);
    const target = f.point(0, 1.42, 2.60);
    return { ...placement, floorY: FLOOR, sign: { x: sign.x, y: sign.y, z: sign.z }, navigation: { x: navigation.x, z: navigation.z, yaw: placement.rotation }, camera: { x: camera.x, y: camera.y, z: camera.z }, target: { x: target.x, y: target.y, z: target.z }, footprint: { width: WIDTH + .24, depth: DEPTH + .16, height: SHOP_HEIGHT + FLOOR } };
  });
  if (panes.length) {
    const geometry = mergeGeometries(panes, false);
    if (!geometry) throw new Error('Unable to merge retail display glazing');
    const mesh = new THREE.Mesh(geometry, glass); mesh.name = 'PodiumRetailGlazing'; mesh.castShadow = false; mesh.receiveShadow = false;
    ctx.root.add(mesh); panes.forEach(geometry => geometry.dispose());
  } else glass.dispose();
  [box, cylinder, sphere, knob].forEach(geometry => geometry.dispose());
  return result;
}
