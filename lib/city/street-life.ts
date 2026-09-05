import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DetailKit } from './details';

export type StreetLifeSpot = {
  id: string;
  kind: 'coffee' | 'bakery' | 'produce' | 'flowers' | 'grocer';
  x: number;
  z: number;
  rotation: number;
  type: 'stall' | 'shop';
};

// The plaza stalls occupy the gaps between the existing long planting beds.
// Local +Z always faces the customer, independently of the street orientation.
export const STREET_LIFE_VENUES: readonly StreetLifeSpot[] = [
  { id: 'plaza-coffee', kind: 'coffee', x: 26, z: 100.3, rotation: -Math.PI / 2, type: 'stall' },
  { id: 'plaza-bakery', kind: 'bakery', x: -26, z: 100.3, rotation: Math.PI / 2, type: 'stall' },
  { id: 'plaza-fruit', kind: 'produce', x: 26, z: 79.5, rotation: -Math.PI / 2, type: 'stall' },
  { id: 'plaza-flowers', kind: 'flowers', x: -26, z: 79.5, rotation: Math.PI / 2, type: 'stall' },
  { id: 'north-bakery', kind: 'bakery', x: -27.6, z: -78.3, rotation: -Math.PI / 2, type: 'shop' },
  { id: 'north-grocer', kind: 'grocer', x: 27.6, z: -80, rotation: Math.PI / 2, type: 'shop' },
  { id: 'garden-florist', kind: 'flowers', x: -28, z: 9, rotation: -Math.PI / 2, type: 'shop' },
];

const GROUND = .125;
const labelTiles = [
  ['岸线咖啡', 'TIDELINE COFFEE', '手冲 · 浓缩 · 冷萃'],
  ['日光面包', 'THE DAILY LOAF', '每日烘焙 · 小批出炉'],
  ['今日鲜果', 'THE PRODUCE STAND', '当季采收 · 按份挑选'],
  ['花与日常', 'STEMS & THINGS', '鲜切花 · 香草 · 绿植'],
  ['街角烘焙', 'CORNER BAKERY', '面包 · 可颂 · 今日点心'],
  ['滨海杂货', 'COASTAL PROVISIONS', '果汁 · 日用品 · 当日鲜食'],
  ['花间小铺', 'THE GARDEN SHOP', '花束 · 陶器 · 季节植物'],
  ['COFFEE', 'ESPRESSO  18     LATTE  26', 'FILTER  28     COLD BREW  28'],
  ['FRESH TODAY', 'CITRUS  12     APPLES  16', '当季鲜果 · 今日直供'],
  ['BAKED TODAY', 'SOURDOUGH  32     CROISSANT  18', '上午出炉 · 售完为止'],
  ['FLOWER BAR', 'STEMS  12     BOUQUETS  68', '为日常留一枝花'],
  ['SMALL BATCH', 'ROASTED BY THE COAST', 'ORIGIN  /  SEASONAL SELECTION'],
  ['每日精选', 'BAKED · BREWED · GROWN', '从街角开始的一天'],
  ['ORDER HERE', '请在此点单', 'TAKEAWAY  /  PICK UP'],
  ['PELAGIA MARKET', 'A GOOD DAY BY THE WATER', 'LOCAL GOODS · EVERY DAY'],
  ['晨间读物', 'COASTAL JOURNAL', 'ART · CITY · CULTURE'],
];

function createSignMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'StreetLifeSigns', color: '#eee9dc', roughness: .82,
    emissive: '#ffffff', emissiveIntensity: .08, side: THREE.DoubleSide,
  });
  if (typeof document === 'undefined') return material;
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const context = canvas.getContext('2d');
  if (!context) return material;
  labelTiles.forEach(([title, subtitle, note], index) => {
    const x = (index % 4) * 512, y = Math.floor(index / 4) * 256;
    const dark = index >= 7 && index <= 11;
    context.fillStyle = dark ? '#303a37' : '#e4dfd0';
    context.fillRect(x, y, 512, 256);
    context.strokeStyle = dark ? '#849188' : '#949689';
    context.lineWidth = 2; context.strokeRect(x + 17, y + 17, 478, 222);
    context.fillStyle = dark ? '#ece7d8' : '#39443e';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `500 ${index === 14 ? 45 : 56}px Arial, sans-serif`;
    context.fillText(title, x + 256, y + 83, 456);
    context.font = '500 23px Arial, sans-serif';
    context.fillText(subtitle, x + 256, y + 155, 460);
    context.font = '400 22px Arial, sans-serif';
    context.fillText(note, x + 256, y + 202, 460);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  material.color.set('#ffffff'); material.map = texture;
  return material;
}

/** Adds fixed shopfronts and market furniture before the world's material batches flush. */
export function buildStreetLife(ctx: DetailKit) {
  const { add, block, obstacles, root, steel, dark } = ctx;
  const standard = (name: string, color: string, roughness = .8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
  const timber = standard('StreetLifeTimber', '#806b54', .86);
  const stone = standard('StreetLifeStone', '#b6b0a2', .91);
  const canvas = standard('StreetLifeCanvas', '#d1cbb9', .95);
  const sage = standard('StreetLifeSage', '#6b7967', .86);
  const paper = standard('StreetLifePaper', '#d8d0bc', .92);
  const ceramic = standard('StreetLifeCeramic', '#dbd9ce', .29);
  const terracotta = standard('StreetLifeTerracotta', '#987361', .89);
  const fruitRed = standard('StreetLifeRedProduce', '#934f40', .51);
  const fruitGold = standard('StreetLifeGoldenProduce', '#bea25c', .56);
  const leaves = standard('StreetLifeLeaves', '#4c6745', .87);
  const bread = standard('StreetLifeBread', '#b89866', .83);
  const warm = new THREE.MeshStandardMaterial({
    name: 'StreetLifeWarmLamps', color: '#ede0c6', emissive: '#edcfa6', emissiveIntensity: .34, roughness: .42,
  });
  const signs = createSignMaterial();
  const glazing = new THREE.MeshPhysicalMaterial({
    name: 'StreetLifeDisplayGlass', color: '#b0beb7', roughness: .13, metalness: .02,
    transparent: true, opacity: .19, depthWrite: false, side: THREE.DoubleSide,
  });
  canvas.side = THREE.DoubleSide; sage.side = THREE.DoubleSide;

  const rounded = new RoundedBoxGeometry(1, 1, 1, 1, .025);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const cone = new THREE.ConeGeometry(1, 1, 12);
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const petal = new THREE.IcosahedronGeometry(1, 0);
  const wheel = new THREE.TorusGeometry(1, .18, 5, 16);
  const cup = new THREE.LatheGeometry([
    new THREE.Vector2(.032, 0), new THREE.Vector2(.035, .006), new THREE.Vector2(.044, .095),
    new THREE.Vector2(.043, .1), new THREE.Vector2(.037, .1), new THREE.Vector2(.033, .01),
  ], 12);
  const bottle = new THREE.LatheGeometry([
    new THREE.Vector2(.043, 0), new THREE.Vector2(.046, .02), new THREE.Vector2(.046, .20),
    new THREE.Vector2(.020, .235), new THREE.Vector2(.019, .29), new THREE.Vector2(.021, .30),
  ], 10);
  const baguette = new THREE.CapsuleGeometry(.048, .36, 3, 8); baguette.rotateZ(Math.PI / 2);
  const croissant = new THREE.TorusGeometry(.095, .038, 5, 12, Math.PI * 1.36); croissant.rotateX(Math.PI / 2);
  const displayPanes: THREE.BufferGeometry[] = [];

  function frame(x: number, z: number, rotation = 0) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const point = (u: number, y: number, v: number) => new THREE.Vector3(x + c * u + s * v, GROUND + y, z - s * u + c * v);
    return {
      point,
      box(material: THREE.Material, u: number, y: number, v: number, w: number, h: number, d: number, turn = 0) {
        const p = point(u, y, v); block(material, p.x, p.y, p.z, w, h, d, rotation + turn);
      },
      shape(geometry: THREE.BufferGeometry, material: THREE.Material, u: number, y: number, v: number, sx = 1, sy = 1, sz = 1, turn = 0) {
        const p = point(u, y, v); add(geometry, material, p.x, p.y, p.z, sx, sy, sz, rotation + turn);
      },
      path(points: [number, number, number][], radius: number, material: THREE.Material, segments = 10) {
        ctx.pipe(points.map(([u, y, v]) => point(u, y, v)), radius, material, segments);
      },
      collider(u: number, v: number, w: number, d: number, height: number) {
        const p = point(u, 0, v);
        obstacles.push({ x: p.x, z: p.z, rx: Math.abs(c) * w / 2 + Math.abs(s) * d / 2, rz: Math.abs(s) * w / 2 + Math.abs(c) * d / 2, height, shape: 'box' });
      },
      label(tile: number, u: number, y: number, v: number, w: number, h: number) {
        const g = new THREE.PlaneGeometry(w, h);
        const uv = g.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile % 4 + uv.getX(i)) / 4, (3 - Math.floor(tile / 4) + uv.getY(i)) / 4);
        const p = point(u, y, v); add(g, signs, p.x, p.y, p.z, 1, 1, 1, rotation); g.dispose();
      },
      pane(u: number, y: number, v: number, w: number, h: number, turn = 0) {
        const p = point(u, y, v), matrix = new THREE.Matrix4().makeRotationY(rotation + turn); matrix.setPosition(p);
        displayPanes.push(new THREE.PlaneGeometry(w, h).applyMatrix4(matrix));
      },
    };
  }
  type Frame = ReturnType<typeof frame>;

  function mug(f: Frame, u: number, y: number, v: number, takeaway = false) {
    f.shape(cup, takeaway ? paper : ceramic, u, y, v);
    f.shape(cylinder, dark, u, y + .092, v, .036, .004, .036);
    if (takeaway) f.shape(cylinder, ceramic, u, y + .108, v, .046, .012, .046);
    else f.shape(wheel, ceramic, u + .047, y + .057, v, .027, .035, .018);
  }

  function plant(f: Frame, u: number, y: number, v: number, size = 1, flowers = false) {
    const pot = new THREE.CylinderGeometry(.16, .115, .27, 10);
    f.shape(pot, terracotta, u, y + .135 * size, v, size, size, size); pot.dispose();
    f.shape(cylinder, dark, u, y + .277 * size, v, .142 * size, .012, .142 * size);
    for (let j = 0; j < 5; j++) {
      const a = j * 2.399, dx = Math.cos(a) * .115 * size, dz = Math.sin(a) * .115 * size, height = (.45 + (j % 3) * .08) * size;
      f.path([[u, y + .27 * size, v], [u + dx * .7, y + height * .77, v + dz * .7], [u + dx, y + height, v + dz]], .006 * size, leaves, 4);
      f.shape(petal, leaves, u + dx, y + height * .79, v + dz, .09 * size, .023 * size, .041 * size, a);
      if (flowers) {
        for (let p = 0; p < 5; p++) {
          const angle = p * Math.PI * .4;
          f.shape(petal, j % 2 ? paper : fruitRed, u + dx + Math.cos(angle) * .045 * size, y + height, v + dz + Math.sin(angle) * .045 * size, .041 * size, .019 * size, .03 * size, angle);
        }
        f.shape(petal, fruitGold, u + dx, y + height + .009 * size, v + dz, .021 * size, .019 * size, .021 * size);
      }
    }
  }

  function crate(f: Frame, u: number, y: number, v: number, kind: 'fruit' | 'bread', variety = 0) {
    f.box(timber, u, y, v, .93, .07, .66);
    for (const side of [-1, 1]) {
      for (let j = 0; j < 2; j++) f.box(timber, u, y + .07 + j * .075, v + side * .33, .98, .045, .035);
      f.box(timber, u + side * .47, y + .10, v, .035, .21, .65);
    }
    if (kind === 'fruit') {
      for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) {
        const dx = u - .31 + a * .205, dz = v - .20 + b * .19;
        const mat = variety % 3 === 0 ? fruitRed : variety % 3 === 1 ? fruitGold : sage;
        f.shape(ball, mat, dx, y + .13 + ((a + b) % 3) * .012, dz, .091, .082 + (variety % 2) * .021, .084);
        f.shape(cylinder, timber, dx, y + .225, dz, .008, .026, .008);
      }
    } else {
      for (let j = 0; j < 4; j++) {
        if (variety % 2) f.shape(croissant, bread, u - .29 + (j % 2) * .39, y + .085, v - .16 + Math.floor(j / 2) * .29, 1, 1, 1, j * .12);
        else {
          const dz = v - .23 + j * .145;
          f.shape(baguette, bread, u, y + .09, dz, 1.55, 1, 1, .08);
          for (let score = 0; score < 3; score++) f.box(paper, u - .16 + score * .15, y + .137, dz, .02, .006, .072, -.35);
        }
      }
    }
  }

  function espressoMachine(f: Frame, u: number, y: number, v: number) {
    f.shape(rounded, steel, u, y + .22, v, .71, .44, .46);
    f.shape(rounded, dark, u, y + .25, v + .22, .67, .31, .025);
    f.box(steel, u, y + .045, v + .12, .83, .035, .66);
    for (let j = 0; j < 9; j++) f.box(dark, u - .32 + j * .08, y + .067, v + .28, .033, .012, .20);
    for (const side of [-1, 1]) {
      f.shape(cylinder, steel, u + side * .17, y + .25, v + .26, .065, .06, .065);
      f.box(dark, u + side * .17, y + .23, v + .34, .03, .035, .16);
      mug(f, u + side * .17, y + .071, v + .29);
    }
    f.path([[u + .32, y + .25, v + .21], [u + .42, y + .19, v + .33], [u + .42, y + .09, v + .33]], .009, steel, 6);
    for (let j = 0; j < 3; j++) f.box(warm, u - .18 + j * .18, y + .335, v + .241, .045, .025, .006);
    for (let j = 0; j < 3; j++) mug(f, u - .24 + j * .19, y + .44, v);
    // Coffee grinder: separate hopper, motor and portafilter fork.
    f.shape(rounded, dark, u - .65, y + .17, v, .25, .34, .28);
    f.shape(cone, ceramic, u - .65, y + .43, v, .135, .21, .135);
    f.shape(cylinder, dark, u - .65, y + .55, v, .137, .025, .137);
    f.box(steel, u - .65, y + .12, v + .17, .13, .02, .16);
  }

  function awning(f: Frame, width: number, depth: number, back: number, rearHeight: number, frontHeight: number) {
    for (let stripe = 0; stripe < 8; stripe++) {
      const left = -width / 2 + stripe * width / 8, right = left + width / 8;
      const positions: number[] = [], indices: number[] = [];
      for (let j = 0; j <= 5; j++) {
        const t = j / 5, y = rearHeight * (1 - t) + frontHeight * t - Math.sin(t * Math.PI) * .055;
        positions.push(left, y, back + t * depth, right, y, back + t * depth);
        if (j < 5) { const i = j * 2; indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      f.shape(geometry, stripe % 2 ? canvas : sage, 0, 0, 0); geometry.dispose();
      f.box(stripe % 2 ? canvas : sage, (left + right) / 2, frontHeight - .11, back + depth, width / 8 + .006, .23, .025);
    }
    f.path([[-width / 2, frontHeight, back + depth], [0, frontHeight - .025, back + depth], [width / 2, frontHeight, back + depth]], .024, steel, 12);
    for (const side of [-1, 1]) f.path([[side * (width / 2 - .12), rearHeight, back], [side * (width / 2 - .12), frontHeight, back + depth]], .024, steel, 5);
  }

  function menuBoard(f: Frame, tile: number, u: number, v: number) {
    f.box(timber, u, .76, v, .66, .96, .075);
    f.label(tile, u, .78, v + .041, .59, .86);
    for (const side of [-1, 1]) {
      f.path([[u + side * .29, .05, v + .27], [u + side * .29, 1.25, v], [u + side * .29, .05, v - .27]], .026, timber, 5);
    }
    f.collider(u, v, .70, .60, 1.3);
  }

  function stall(venue: StreetLifeSpot) {
    const f = frame(venue.x, venue.z, venue.rotation), tile = venue.kind === 'coffee' ? 0 : venue.kind === 'bakery' ? 1 : venue.kind === 'produce' ? 2 : 3;
    // A waist-height counter leaves a genuine clear working bay behind it.
    f.shape(rounded, stone, 0, .49, .39, 3.50, .89, .83);
    f.shape(rounded, timber, 0, .97, .39, 3.68, .10, .96);
    for (let n = 0; n < 18; n++) f.box(timber, -1.62 + n * .19, .49, .824, .115, .76, .025);
    f.box(dark, 0, .12, .84, 3.35, .035, .027);
    f.collider(0, .39, 3.68, .96, 1.08);
    for (const side of [-1, 1]) {
      for (const rear of [-1, 1]) {
        f.shape(cylinder, dark, side * 1.73, 1.34, rear * 1.03, .037, 2.68, .037);
        f.collider(side * 1.73, rear * 1.03, .12, .12, 2.7);
      }
      f.box(timber, side * 1.36, .44, -.64, .55, .83, .55);
      f.collider(side * 1.36, -.64, .57, .57, .95);
    }
    f.box(timber, 0, .17, -1.07, 3.40, .24, .12);
    f.collider(0, -1.07, 3.4, .15, .35);
    awning(f, 3.95, 2.58, -1.22, 2.75, 2.46);
    f.box(timber, 0, 2.17, 1.13, 2.87, .49, .065);
    f.label(tile, 0, 2.17, 1.168, 2.79, .44);
    f.box(warm, 0, 2.58, -.96, 2.50, .025, .045);
    // Cashless terminal, folded bags and service bell provide eye-level scale.
    f.shape(rounded, dark, 1.39, 1.07, .50, .15, .105, .22);
    f.box(sage, 1.39, 1.128, .50, .105, .009, .13);
    f.box(paper, 1.47, 1.20, -.52, .24, .41, .14);
    f.path([[1.41, 1.40, -.52], [1.47, 1.47, -.52], [1.53, 1.40, -.52]], .012, timber, 5);
    f.shape(ball, steel, -1.46, 1.055, .67, .062, .033, .062);
    f.shape(cylinder, steel, -1.46, 1.09, .67, .017, .025, .017);
    menuBoard(f, tile === 0 ? 7 : tile === 1 ? 9 : tile === 2 ? 8 : 10, 2.18, .60);
    if (venue.kind === 'coffee') {
      espressoMachine(f, -.1, 1.02, .15);
      for (let j = 0; j < 3; j++) mug(f, .66 + j * .18, 1.025, .58, true);
      for (let j = 0; j < 3; j++) {
        f.shape(bottle, j % 2 ? ceramic : sage, .95 + j * .18, 1.02, -.02);
        f.shape(cylinder, dark, .95 + j * .18, 1.33, -.02, .024, .055, .024);
      }
      f.label(11, 1.34, .50, .856, .61, .35);
    } else if (venue.kind === 'bakery') {
      for (let j = 0; j < 3; j++) crate(f, -1.10 + j * 1.04, 1.04, .38, 'bread', j);
      f.pane(0, 1.33, .89, 3.26, .49);
      f.box(steel, 0, 1.59, .89, 3.31, .026, .035);
      for (const side of [-1, 1]) f.box(steel, side * 1.65, 1.33, .89, .024, .53, .026);
    } else if (venue.kind === 'produce') {
      for (let j = 0; j < 3; j++) crate(f, -1.10 + j * 1.04, 1.035, .33, 'fruit', j);
      for (const side of [-1, 1]) crate(f, side * 1.36, .87, -.64, 'fruit', side + 2);
    } else {
      for (let j = 0; j < 5; j++) plant(f, -1.27 + j * .58, 1.02, .30, .91 + (j % 2) * .12, true);
      for (const side of [-1, 1]) plant(f, side * 1.36, .87, -.64, .9);
      f.box(paper, .85, 1.055, .60, .61, .025, .29);
    }
    const clerk = f.point(0, 0, -.66), customer = f.point(.25, 0, 1.68);
    return { id: venue.id, staff: { x: clerk.x, z: clerk.z, yaw: venue.rotation }, customer: { x: customer.x, z: customer.z, yaw: venue.rotation + Math.PI } };
  }

  function shop(venue: StreetLifeSpot) {
    const f = frame(venue.x, venue.z, venue.rotation), title = venue.kind === 'bakery' ? 4 : venue.kind === 'grocer' ? 5 : 6;
    const width = 7, depth = 4.8;
    f.shape(rounded, stone, 0, .09, 0, width + .24, .18, depth + .2);
    f.box(stone, 0, 1.77, -2.31, width, 3.48, .18);
    for (const side of [-1, 1]) f.box(stone, side * 3.42, 1.77, 0, .16, 3.48, depth);
    f.box(timber, 0, 3.43, 0, width + .28, .20, depth + .35);
    f.box(dark, 0, 3.57, 0, width + .34, .075, depth + .42);
    f.box(paper, 0, 1.7, -2.19, 6.60, 2.94, .025);
    f.box(timber, 0, .25, 2.28, 6.94, .30, .18);
    f.box(timber, 0, 3.15, 2.37, 7.10, .55, .19);
    f.label(title, 0, 3.15, 2.473, 4.76, .48);
    for (const u of [-3.34, -1.13, 1.13, 3.34]) f.box(dark, u, 1.75, 2.37, .060, 2.65, .09);
    f.box(dark, 0, .40, 2.37, 6.72, .055, .08);
    f.box(dark, 0, 2.99, 2.37, 6.72, .055, .08);
    f.pane(0, 1.69, 2.394, 6.66, 2.54);
    // These are window displays, with no misleading doorway or entry prompt.
    f.box(timber, 0, .79, 1.76, 6.54, .74, .73);
    f.box(stone, 0, 1.19, 1.76, 6.67, .08, .79);
    for (let level = 0; level < 3; level++) {
      f.box(timber, 0, .76 + level * .64, -.60, 5.9, .065, .60);
      for (const side of [-1, 1]) f.box(dark, side * 2.81, 1.39, -.73, .045, 2.15, .06);
    }
    f.box(warm, 0, 2.91, 1.95, 6.25, .035, .04);
    for (let j = 0; j < 3; j++) {
      const u = -2.23 + j * 2.23;
      f.shape(cylinder, dark, u, 2.91, 1.10, .013, .57, .013);
      f.shape(cone, ceramic, u, 2.58, 1.10, .19, .18, .19);
      f.shape(cylinder, warm, u, 2.487, 1.10, .16, .01, .16);
    }
    awning(f, 7.22, 1.39, 2.18, 3.02, 2.78);
    for (const side of [-1, 1]) f.path([[side * 3.24, 2.37, 2.43], [side * 3.24, 2.78, 3.46], [side * 3.24, 3.02, 2.20]], .023, dark, 5);
    f.collider(0, 0, width + .18, depth + .18, 3.7);
    if (venue.kind === 'bakery') {
      for (let j = 0; j < 5; j++) crate(f, -2.28 + j * 1.14, 1.25, 1.78, 'bread', j);
      for (let level = 0; level < 3; level++) for (let j = 0; j < 9; j++) f.shape(baguette, bread, -2.5 + j * .60, .84 + level * .64, -.56, 1.18, 1.2, 1.3, j * .03);
      f.label(9, 2.43, 2.30, -2.14, .96, 1.00);
    } else if (venue.kind === 'grocer') {
      for (let level = 0; level < 3; level++) for (let j = 0; j < 15; j++) {
        const material = j % 4 === 0 ? sage : j % 4 === 1 ? paper : j % 4 === 2 ? fruitRed : ceramic;
        const u = -2.60 + j * .37, y = .80 + level * .64;
        if (level % 2) f.shape(rounded, material, u, y + .17, -.58, .20, .33, .20);
        else f.shape(bottle, material, u, y, -.54, 1.05, 1.15, 1.05);
      }
      crate(f, -2.15, 1.24, 1.75, 'fruit', 0); crate(f, -.98, 1.24, 1.75, 'fruit', 1);
      for (let j = 0; j < 4; j++) { f.box(paper, .52 + j * .52, 1.25 + j * .012, 1.80, .42, .045, .48); }
      f.label(15, 1.37, 1.05, 2.17, 1.98, .22);
    } else {
      for (let j = 0; j < 7; j++) plant(f, -2.50 + j * .82, 1.24, 1.78, .95 + (j % 3) * .12, j % 2 === 0);
      for (let level = 0; level < 2; level++) for (let j = 0; j < 5; j++) plant(f, -2.35 + j * 1.18, .81 + level * .64, -.58, .78 + (j % 2) * .2);
      f.label(10, 2.49, 2.30, -2.14, .94, .99);
    }
    const customer = f.point(0, 0, 4.03);
    return { id: venue.id, customer: { x: customer.x, z: customer.z, yaw: venue.rotation + Math.PI } };
  }

  function chair(x: number, z: number, rotation: number) {
    const f = frame(x, z, rotation);
    for (const side of [-1, 1]) {
      f.path([[side * .24, .035, .26], [side * .22, .43, .23], [side * .22, .49, -.19], [side * .23, .94, -.28]], .017, dark, 8);
      f.path([[side * .25, .035, -.26], [side * .22, .45, -.19]], .017, dark, 4);
    }
    for (let j = 0; j < 5; j++) f.box(timber, 0, .47, -.18 + j * .089, .45, .04, .068);
    for (let j = 0; j < 3; j++) f.path([[-.24, .72 + j * .08, -.27], [0, .72 + j * .08, -.31], [.24, .72 + j * .08, -.27]], .031, timber, 7);
    const obstacle={ x, z, rx: .36, rz: .36, height: 1.05 };obstacles.push(obstacle);
    ctx.seats?.push({id:`terrace-${x.toFixed(2)}-${z}`,label:'咖啡椅',x,z,yaw:rotation,ground:GROUND,height:.49,obstacle});
  }

  function terrace(x: number, z: number, index: number) {
    const f = frame(x, z);
    f.shape(cylinder, dark, 0, .38, 0, .039, .74, .039);
    for (let leg = 0; leg < 3; leg++) {
      const a = leg * Math.PI * 2 / 3;
      f.path([[0, .19, 0], [Math.cos(a) * .31, .035, Math.sin(a) * .31]], .028, dark, 4);
    }
    f.shape(cylinder, timber, 0, .775, 0, .56, .057, .56);
    f.shape(cylinder, steel, 0, .742, 0, .55, .018, .55);
    for (const side of [-1, 1]) chair(x + side * 1.40, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    obstacles.push({ x, z, rx: .59, rz: .59, height: .86 });
    mug(f, -.21, .807, .08, index % 2 === 0); mug(f, .22, .807, -.10);
    f.shape(cylinder, ceramic, -.20, .81, -.19, .125, .014, .125);
    f.shape(croissant, bread, -.22, .85, -.19, .85, .85, .85, index * .3);
    f.box(paper, .17, .814, .20, .20, .009, .14, .2);
    f.shape(bottle, ceramic, .05, .81, .02, .5, .6, .5);
    f.path([[.05, .96, .02], [.07, 1.11, .01]], .006, leaves, 4);
    f.shape(ball, paper, .07, 1.12, .01, .05, .033, .05);
  }

  const stallSpots = STREET_LIFE_VENUES.filter(v => v.type === 'stall').map(stall);
  const shopSpots = STREET_LIFE_VENUES.filter(v => v.type === 'shop').map(shop);
  [[20.7, 105.4], [-20.7, 105.4], [20.7, 72.6], [-20.7, 72.6]].forEach(([x, z], i) => terrace(x, z, i));

  // Transparent display panes are batched separately to keep them out of shadow maps.
  if (displayPanes.length) {
    const geometry = mergeGeometries(displayPanes, false);
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, glazing);
      mesh.name = 'StreetLifeDisplayWindows'; mesh.castShadow = false; mesh.receiveShadow = false;
      root.add(mesh);
    } else glazing.dispose();
    displayPanes.forEach(g => g.dispose());
  } else glazing.dispose();
  [rounded, cylinder, cone, ball, petal, wheel, cup, bottle, baguette, croissant].forEach(g => g.dispose());
  return { venues: STREET_LIFE_VENUES, stallSpots, shopSpots };
}
