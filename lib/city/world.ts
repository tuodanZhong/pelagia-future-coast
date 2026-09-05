import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Obstacle } from './movement';
import { createVegetation } from './vegetation.ts';
import { enrichCity } from './details.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const TOWERS = [
  { x: 0, z: -16, h: 128, r: 12, rot: 0.2, name: '潮汐之塔' },
  { x: -98, z: 75, h: 80, r: 11.5, rot: -0.8, name: '白帆公馆' },
  { x: 98, z: 74, h: 95, r: 12, rot: 1.1, name: '海镜中心' },
  { x: -96, z: -88, h: 103, r: 10, rot: -0.4, name: '云庭' },
  { x: 83, z: -90, h: 118, r: 11, rot: 0.8, name: '远航中心' },
  { x: 99, z: -12, h: 82, r: 9, rot: 2.4, name: '蓝湾花园' },
  { x: -100, z: -12, h: 53, r: 9, rot: 0.4, name: '海岸研究所' },
  { x: -4, z: -106, h: 67, r: 8, rot: 2.0, name: '空中花园' },
];
function material(color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
export function buildWorld(scene: THREE.Scene) {
  const root = new THREE.Group(); scene.add(root);
  const obstacles: Obstacle[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const white = material('#e6e5de', 0.35, 0.08), pavement = material('#dadbd8'), pale = material('#e1dfd4');
  const asphalt = material('#b6b6b6', 0.96), lines = material('#ececd9'), yellow = material('#d1c29a');
  const grass = material('#607d43'), leaf = material('#497342'), leafLight = material('#66844a');
  const bark = material('#7a7059'), steel = material('#92aab5', 0.35, 0.6), dark = material('#254151', 0.42, 0.5);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#365d77', roughness: 0.17, metalness: 0.56, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: .12, ior: 1.5 });
  const pool = new THREE.MeshStandardMaterial({ color: '#50aec1', metalness: 0.35, roughness: 0.17 });
  const light = new THREE.MeshStandardMaterial({ color: '#deffff', emissive: '#7dc4e3', emissiveIntensity: 0.65 });
  const railGlass = new THREE.MeshPhysicalMaterial({color:'#bed5d5',metalness:.1,roughness:.12,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false});
  const interior = material('#3c4443',.86), warm = new THREE.MeshStandardMaterial({color:'#dacdb2',emissive:'#e4c295',emissiveIntensity:.22,roughness:.8});
  if (typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader();
    for(const [m,name,normal] of [[pavement,'concrete_pavement',.24],[asphalt,'asphalt_02',.19]] as const) {
      const configure=(t:THREE.Texture)=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;};
      m.map=configure(loader.load('/assets/'+name+'_diff_1k.jpg'));m.map.colorSpace=THREE.SRGBColorSpace;
      m.normalMap=configure(loader.load('/assets/'+name+'_nor_gl_1k.jpg'));m.normalScale.set(normal,normal);
      m.roughnessMap=configure(loader.load('/assets/'+name+'_rough_1k.jpg'));
    }
  }
  // Realistic facade variation is subtle; reflections provide the large-scale structure.
  glass.onBeforeCompile = shader => {
    shader.vertexShader='varying vec3 vCityPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvCityPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader='varying vec3 vCityPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat pane=fract(sin(dot(floor(vCityPosition*vec3(.34,.29,.34)),vec3(12.9898,78.233,37.71)))*43758.5453);diffuseColor.rgb*=.85+.19*pane;');
  };
  glass.customProgramCacheKey=()=> 'city-glazing-v2';
  const dummy = new THREE.Object3D();
  function add(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    const clone = g.clone().applyMatrix4(dummy.matrix);
    if(!clone.index)clone.setIndex(Array.from({length:clone.attributes.position.count},(_,i)=>i));
    // Normalise geometry attributes to permit material batching.
    if(m === pavement || m === asphalt) {
      const positions=clone.attributes.position,normals=clone.attributes.normal,uv=[];const scale=m===asphalt?3:1.8;
      for(let i=0;i<positions.count;i++){const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i));uv.push((ny>.5?positions.getX(i):nx>.5?positions.getZ(i):positions.getX(i))/scale,(ny>.5?positions.getZ(i):positions.getY(i))/scale);}
      clone.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    } else if(!clone.attributes.uv) clone.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(clone.attributes.position.count*2),2));
    const list = batches.get(m) ?? []; list.push(clone); batches.set(m, list);
  }
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 48), sphere = new THREE.IcosahedronGeometry(1, 2);
  function block(m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rot = 0) { add(box, m, x, y, z, w, h, d, rot); }
  function disk(m: THREE.Material, x: number, y: number, z: number, r: number, h: number, ratio = 1) { add(cylinder, m, x, y, z, r, h, r * ratio); }
  function pipe(points: THREE.Vector3[], radius: number, m: THREE.Material, segments = 32) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false); add(g, m); g.dispose();
  }
  function ring(x: number, y: number, z: number, r: number, tube: number, m: THREE.Material, ratio = 1) {
    const g = new THREE.TorusGeometry(r, tube, 6, 64); g.rotateX(Math.PI / 2); add(g, m, x, y, z, 1, 1, ratio); g.dispose();
  }
  // Island, waterfront promenade, and a continuous walkable ground plane.
  block(pavement, 0, -1.25, 0, 300, 2.5, 300);
  block(pale, 0, -0.13, 0, 294, 0.22, 294);
  block(asphalt, 0, 0.015, 0, 280, 0.05, 280);
  const xs = [-96, 0, 96], zs = [-96, 0, 96];
  for (const x of xs) for (const z of zs) {
    block(pavement, x, 0.07, z, x === 0 ? 73 : 70, 0.11, z === 0 ? 73 : 70);

  }
  for (const x of [-48, 48]) {
    for (let z = -135; z <= 135; z += 10) {
      if ([-132, -48, 48, 132].some(a => Math.abs(z - a) < 10)) continue;
      block(yellow, x, 0.06, z, 0.12, 0.025, 5);
      for (const dx of [-6, 6]) block(lines, x + dx, 0.06, z, 0.16, 0.025, 3.5);
    }
  }
  for (const z of [-132, -48, 48, 132]) {
    for (let x = -130; x < 135; x += 10) {
      if ([-48, 48].some(a => Math.abs(x - a) < 12)) continue;
      block(yellow, x, 0.06, z, 5, 0.025, 0.12);
    }
    for (const x of [-48, 48]) {
      for (let t = -8; t <= 8; t += 2.2) {
        for (const side of [-1, 1]) {
          block(lines, x + t, 0.07, z + side * 12, 1.1, 0.02, 4);
          block(lines, x + side * 12, 0.07, z + t, 4, 0.02, 1.1);
        }
      }
    }
  }
  const vegetation = createVegetation(root);
  const {palm,tree,shrub}=vegetation;
  for (let t = -126; t <= 126; t += 18) {
    for (const side of [-1, 1]) {
      palm(side * 141, t, 6.8 + Math.sin(t) * 0.7);
      palm(t, side * 141, 7.4);
      palm(side * 34, t, 7);
      palm(side * 63, t, 6.5);
    }
  }
  // Glass towers: a sloping oval crown inside two continuous twisting porcelain sails.
  TOWERS.forEach((tower, index) => {
    const { x, z, h, r, rot } = tower;
    const podiumR = r + 12, podiumY = 12.1;
    obstacles.push({x,z,rx:podiumR+1.0,rz:podiumR*.83+1.0});
    // Three inhabited levels with setbacks, shadow gaps, columns, and roof gardens.
    disk(white,x,.35,z,podiumR+1,.55,.83);
    for(let level=0;level<3;level++) {
      const rr=podiumR-level*.85,yy=.75+level*3.8,shift=level*.55;
      disk(interior,x+shift,yy+1.8,z-level*.3,rr-.4,3.5,.83);
      disk(glass,x+shift,yy+1.8,z-level*.3,rr,3.45,.83);
      disk(white,x+shift,yy+3.57,z-level*.3,rr+1.05,.35,.83);
      ring(x+shift,yy+3.38,z-level*.3,rr+.4,.075,dark,.83);
      for(let k=0;k<44;k++) {
        const a=k/44*Math.PI*2,px=x+shift+Math.cos(a)*(rr+.04),pz=z-level*.3+Math.sin(a)*(rr+.04)*.83;
        block(steel,px,yy+1.8,pz,.095,3.42,.095);
        if(k%4===0)block(white,px,yy+1.8,pz,.27,3.5,.27);
        if(k%3===1){block(warm,x+shift+Math.cos(a)*(rr-.18),yy+3.05,z-level*.3+Math.sin(a)*(rr-.18)*.83,.45,.10,.45);}
      }
      ring(x+shift,yy+3.72,z-level*.3,rr+.5,.07,steel,.83);
    }
    disk(grass,x+1.1,12.18,z-.6,podiumR-2,.15,.83);
    for(let k=0;k<14;k++){const a=k*Math.PI/7;shrub(x+Math.cos(a)*(podiumR-3),z+Math.sin(a)*(podiumR-3)*.83,1,12.25);if(k%2===0)palm(x+Math.cos(a)*(podiumR-3),z+Math.sin(a)*(podiumR-3)*.83,4.4,12.25);}
    // Visible recess, portal and door hardware give the street facade human scale.
    const front=z+podiumR*.83;
    block(interior,x,2.15,front+.12,6.4,4,.35);block(white,x,4.15,front+1.3,8.5,.28,4.6);
    block(glass,x,1.9,front+.35,4.6,3.6,.06);
    for(const dx of [-3.3,-2.25,0,2.25,3.3])block(steel,x+dx,2,front+.44,.09,3.8,.09);
    for(const dx of [-.2,.2])block(steel,x+dx,1.65,front+.53,.045,.62,.06);
    for(const dx of [-3.2,3.2])block(white,x+dx,1.95,front+2.1,.17,3.9,.17);
    disk(pale,x,.20,front+2,4.5,.12,.45);
    function point(t: number, a: number, shell = 0) {
      const ang = a + rot + t * 0.38;
      const taper = 0.84 + Math.sin(t * Math.PI) * (0.19 + index % 3 * .035) - t * 0.08;
      const radius = r * taper + shell;
      const crown = h + Math.cos(a) * r * (index % 3 === 0 ? 2.2 : 1.6);
      return new THREE.Vector3(x + Math.cos(ang) * radius + Math.sin(t * Math.PI) * r * 0.11, podiumY + t * (crown - podiumY), z + Math.sin(ang) * radius * 0.73);
    }
    function surface(shell: boolean, side = 0) {
      const positions: number[] = [], indices: number[] = [];
      const rows = 56, cols = shell ? 14 : 64;
      for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        for (let i = 0; i <= cols; i++) {
          let a = i / cols * Math.PI * 2;
          if (shell) {
            const width = 0.48 + 0.76 * Math.pow(Math.abs(Math.cos(t * Math.PI)), 1.6);
            a = side * Math.PI + t * (1.5 + (index % 2) * .18) + (i / cols - 0.5) * width;
          }
          const p = point(t, a, shell ? 0.32 : 0); positions.push(p.x, p.y, p.z);
          
          if (j < rows && i < cols) { const n = j * (cols + 1) + i; indices.push(n, n + cols + 1, n + 1, n + 1, n + cols + 1, n + cols + 2); }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
      add(g, shell ? white : glass); g.dispose();
      if(shell) {
        // Closed return faces give the porcelain sail a readable 40 cm edge.
        for(const edge of [-.5,.5]){
          const edgePoints=[];
          for(let j=0;j<=rows;j++){const t=j/rows,width=.48+.76*Math.pow(Math.abs(Math.cos(t*Math.PI)),1.6),a=side*Math.PI+t*(1.5+(index%2)*.18)+edge*width;edgePoints.push(point(t,a,.34));}
          pipe(edgePoints,.21,white,64);
        }
        for(let j=5;j<rows;j+=4){const t=j/rows,width=.48+.76*Math.pow(Math.abs(Math.cos(t*Math.PI)),1.6);const seam=Array.from({length:13},(_,i)=>point(t,side*Math.PI+t*(1.5+(index%2)*.18)+(i/12-.5)*width,.335));pipe(seam,.013,steel,12);}
      }
    }
    surface(false); surface(true); surface(true, 1);
    // Fine horizontal floors and vertical mullions anchor the architecture's scale.
    for (let y = 0.02; y < 0.99; y += 3.25 / h) {
      const pts = Array.from({ length: 65 }, (_, k) => point(y, k * Math.PI / 32, 0.055)); pipe(pts, 0.055, steel, 64);
    }
    for (let k = 0; k < 24; k++) {
      const pts = Array.from({ length: 25 }, (_, j) => point(j / 24, k * Math.PI / 12, 0.075)); pipe(pts, k % 3 === 0 ? 0.10 : 0.047, steel, 30);
    }
    const crownPoints = Array.from({ length: 65 }, (_, k) => point(1, k * Math.PI / 32, 0.1)); pipe(crownPoints, 0.34, white, 64);
    pipe(Array.from({length:65},(_,k)=>point(.982,k*Math.PI/32,-.5)),.16,steel,64);
    const gardenHeight = h - r * 1.6;
    disk(grass, x, gardenHeight, z, r * 0.56, 0.25, 0.73);
    for (let k = 0; k < 4; k++) palm(x + Math.sin(k * 2) * r * 0.36, z + Math.cos(k * 2) * r * 0.3, 3.4, gardenHeight);
    // Rectangular garden courts and reflecting pools near each tower.
    const gx = x + (x < 0 ? -24 : 24);
    block(white, gx, 0.32, z + 10, 8, 0.5, 26);
    block(grass, gx, 0.59, z + 10, 7.3, 0.05, 25.2);
    obstacles.push({x: gx, z: z + 10, rx: 4, rz: 13, shape: 'box'});
    for (let k = 0; k < 4; k++) {tree(gx, z + k * 6, 0.85);shrub(gx-2,z+k*6,1.1,.6);shrub(gx+2,z+k*6+2,1.1,.6);}
    if (index < 3) {
      block(white, x, 0.35, z + 28, 30, 0.55, 7);
      block(pool, x, 0.64, z + 28, 28.8, 0.035, 5.8);
      obstacles.push({ x, z: z + 28, rx: 15.5, rz: 4, shape: 'box' });
    }
  });
  // Sweeping sky bridges with an actual deck, glass balustrades, and white rails.
  const bridges = [
    [[-96, 37, -88], [-64, 36, -83], [-36, 48, -53], [0, 48, -16]],
    [[0, 45, -16], [40, 34, -2], [70, 34, 4], [99, 43, -12]],
    [[-4, 43, -106], [30, 45, -113], [55, 52, -103], [83, 47, -90]],
    [[-100, 29, -12], [-106, 26, 27], [-98, 26, 75]],
  ];
  for (const points of bridges) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])));
    const railA: THREE.Vector3[] = [], railB: THREE.Vector3[] = [], ps: number[] = [], ix: number[] = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, p = curve.getPoint(t), tangent = curve.getTangent(t), normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const side of [-1, 1]) { const a = p.clone().addScaledVector(normal, side * 2.1); ps.push(a.x, a.y, a.z); (side < 0 ? railA : railB).push(a.clone().add(new THREE.Vector3(0, 1.2, 0))); }
      if (i < 80) { const n = i * 2; ix.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
      if (i % 4 === 0) for (const side of [-1, 1]) { const a = p.clone().addScaledVector(normal, side * 2.1); block(steel, a.x, a.y + 0.6, a.z, 0.09, 1.2, 0.09); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); g.setIndex(ix); g.computeVertexNormals();
    for(const rail of [railA,railB]) {
      const p:number[]=[],idx:number[]=[];
      rail.forEach((v,i)=>{p.push(v.x,v.y-.12,v.z,v.x,v.y-1.15,v.z);if(i<rail.length-1){const n=i*2;idx.push(n,n+1,n+2,n+1,n+3,n+2);}});
      const glassPanel=new THREE.BufferGeometry();glassPanel.setAttribute('position',new THREE.Float32BufferAttribute(p,3));glassPanel.setIndex(idx);glassPanel.computeVertexNormals();add(glassPanel,railGlass);glassPanel.dispose();
    }
    const bridgeWhite = white.clone(); bridgeWhite.side = THREE.DoubleSide; add(g, bridgeWhite); g.dispose();
    for (const rail of [railA, railB]) { pipe(rail, 0.13, white, 80); pipe(rail.map(p => p.clone().add(new THREE.Vector3(0, -1.35, 0))), 0.42, white, 80); pipe(rail.map(p => p.clone().add(new THREE.Vector3(0, -0.58, 0))), 0.1, glass, 80); }
  }
  // Civic plaza with a kinetic armillary sculpture and water jets.
  const fx = 0, fz = 88;
  disk(white, fx, 0.25, fz, 20, 0.3); disk(pale, fx, 0.44, fz, 18.4, 0.1); disk(pool, fx, 0.52, fz, 15.9, 0.12);
  ring(fx, 0.5, fz, 16.3, 0.35, white); ring(fx, 0.5, fz, 19.6, 0.18, steel);
  disk(white, fx, 0.95, fz, 5, 1); disk(dark, fx, 1.5, fz, 3, 0.2);
  obstacles.push({ x: fx, z: fz, rx: 20.2, rz: 20.2 });
  const sculpture = new THREE.Group(); sculpture.position.set(fx, 8.4, fz); root.add(sculpture);
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(5, 0.13, 8, 80), i === 1 ? white : steel); mesh.rotation.set(i * 1.1, i * 0.8, 0.5); sculpture.add(mesh);
  }
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(3.8, 2), new THREE.MeshStandardMaterial({ color: '#72bfd5', roughness: 0.2, metalness: 0.6, wireframe: true })); sculpture.add(globe);
  for (let k = 0; k < 20; k++) {
    const a = k * Math.PI / 10, x = Math.cos(a) * 12, z = fz + Math.sin(a) * 12;
    const p = Array.from({ length: 12 }, (_, j) => { const t = j / 11; return new THREE.Vector3(x * (1 - t * 0.22), 0.55 + Math.sin(t * Math.PI) * 3, fz + (z - fz) * (1 - t * 0.22)); });
    pipe(p, 0.045, light, 12);
  }
  for (const x of [-26, 26]) for (const z of [69, 90, 111]) {
    obstacles.push({ x, z, rx: 2.7, rz: 6.5, shape: 'box' });
    block(white, x, 0.3, z, 5.4, 0.5, 13); block(grass, x, 0.59, z, 5, 0.05, 12.6); palm(x, z, 7.2);
  }
  for (const x of [-78, 78]) for (const z of [-115, -65, 15, 112]) {
    block(white, x, .27, z, 10, .4, 9);
    block(grass, x, .49, z, 9.4, .04, 8.4);
    obstacles.push({x,z,rx:5,rz:4.5,shape:'box'});
    for (let k=0;k<3;k++) tree(x + Math.sin(k*2.3)*2.4,z + Math.cos(k*2.3)*2.1,.9+k*.12);
  }
  // Street furniture provides legible scale at eye level.
  for (let t = -120; t <= 120; t += 24) for (const x of [-61, -35, 35, 61]) {
    block(steel, x, 3.4, t, 0.12, 6.8, 0.12); block(white, x + 0.6, 6.8, t, 1.5, 0.12, 0.48); block(light, x + 0.6, 6.71, t, 1.2, 0.025, 0.35);
  }
  for (let t = -146; t < 146; t += 7) for (const side of [-1, 1]) {
    block(steel, t, 0.55, side * 147, 0.08, 1.1, 0.08); block(steel, side * 147, 0.55, t, 0.08, 1.1, 0.08);
  }
  for (const side of [-1, 1]) { block(steel, 0, 1.12, side * 147, 294, 0.09, 0.09); block(steel, side * 147, 1.12, 0, 0.09, 0.09, 294); }
  enrichCity({root,obstacles,add,block,disk,pipe,palm,tree,shrub,white,steel,dark,glass,grass,light});
  // Efficient repeating street traffic. Vehicles travel on lanes, pedestrians keep sidewalks.
  const cars: { mesh: THREE.Group; lane: number; offset: number; axis: boolean; direction: number }[] = [];
  const carPaint = [white, material('#8fbbc4', 0.3, 0.55), dark];
  for (let i = 0; i < 18; i++) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.88,.64,4.45,3,.24), carPaint[i % 3]); body.position.y = 0.6; mesh.add(body);
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.63,.75,2.55,3,.33), glass); top.position.set(0, 1.18, -0.2); mesh.add(top);
    for (const x of [-0.92, 0.92]) for (const z of [-1.25, 1.25]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.18, 10), dark); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.37, z); mesh.add(wheel); }
    const axis = i < 10, direction = i % 2 ? 1 : -1, lane = axis ? (i < 5 ? -48 : 48) + direction * 4.2 : (i < 14 ? 132 : -48) + direction * 4.2;
    const chassis=new THREE.Mesh(new RoundedBoxGeometry(1.86,.16,4.16,2,.09),dark);chassis.position.y=.27;mesh.add(chassis);
    const lampGeo=new THREE.BoxGeometry(1.38,.07,.06);
    for(const end of [-1,1]) {const lamp=new THREE.Mesh(lampGeo, end===1?light:new THREE.MeshStandardMaterial({color:'#a63627',emissive:'#7c201b',emissiveIntensity:.5}));lamp.position.set(0,.72,end*2.21);mesh.add(lamp);}
    const partBatches=new Map<THREE.Material,THREE.BufferGeometry[]>();
    for(const child of [...mesh.children]) {
      if(!(child instanceof THREE.Mesh))continue;child.updateMatrix();
      const g=child.geometry.clone().applyMatrix4(child.matrix);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
      const mat=child.material as THREE.Material;const list=partBatches.get(mat)??[];list.push(g);partBatches.set(mat,list);
      child.geometry.dispose();mesh.remove(child);
    }
    for(const [mat,gs]of partBatches){const merged=mergeGeometries(gs)!;const part=new THREE.Mesh(merged,mat);part.castShadow=true;part.receiveShadow=true;mesh.add(part);gs.forEach(g=>g.dispose());}
    root.add(mesh); cars.push({ mesh, lane, offset: i * 31.7, axis, direction });
  }
  // Batch fixed architectural details into one draw call per material.
  for (const [m, geometries] of batches) {
    const g = mergeGeometries(geometries, false);
    if(!g)throw new Error("Unable to merge architectural geometry");
    if (g) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = ![lines, yellow, pool, light, railGlass].includes(m as THREE.MeshStandardMaterial); mesh.receiveShadow = true; root.add(mesh); }
    geometries.forEach(g => g.dispose());
  }
  vegetation.flush();
  // Animated, world-space ocean shading avoids large texture downloads.
  const waterUniforms = { uTime: { value: 0 } };
  const water = new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: `varying vec3 vWorld; void main(){ vec4 p=modelMatrix*vec4(position,1.); vWorld=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`, fragmentShader: `
    varying vec3 vWorld; uniform float uTime;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
    void main(){
      vec2 p=vWorld.xz; float t=uTime*.16;
      float w=noise(p*vec2(.38,.72)+vec2(t,-t))*.55 + noise(p*.87-vec2(t*.7,t))*.3 + noise(p*1.8+vec2(t))* .15;
      vec3 c=mix(vec3(.065,.23,.32),vec3(.15,.36,.44),w);
      c+=pow(max(0.,(w-.48)*1.9),5.)*.17;
      float d=length(cameraPosition.xz-p);
      c=mix(c,vec3(.62,.69,.71),smoothstep(500.,9500.,d));
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
` });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), water); sea.rotation.x = -Math.PI / 2; sea.position.y = -2; root.add(sea);
  box.dispose(); cylinder.dispose(); sphere.dispose();
  return { obstacles, root, update(time: number) {
    waterUniforms.uTime.value = time; sculpture.rotation.y = time * 0.065;
    cars.forEach(({ mesh, lane, offset, axis, direction }) => { const t = ((time * 5 * direction + offset + 10000) % 270) - 135; mesh.position.set(axis ? lane : t, 0.06, axis ? t : lane); mesh.rotation.y = axis ? (direction > 0 ? 0 : Math.PI) : (direction > 0 ? Math.PI / 2 : -Math.PI / 2); });
  } };
}
