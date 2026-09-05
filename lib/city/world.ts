import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Obstacle } from './movement';
import { createVegetation } from './vegetation.ts';
import { enrichCity } from './details.ts';
import { buildArchitecture } from './architecture.ts';
import { buildStreetLife } from './street-life.ts';
import type { Seat } from './seating';
import { buildBuildingIdentities } from './identities.ts';
import { buildRetail } from './retail.ts';
import { buildPoliceStation } from './police-station.ts';
import { buildSchool } from './school.ts';
import { CITIZENS } from './population.ts';

export const TOWERS = [
  { x: 0, z: -16, h: 106, r: 12, rot: 0.2, name: '潮汐之塔' },
  { x: -98, z: 75, h: 61, r: 11.5, rot: -0.8, name: '白帆公馆' },
  { x: 98, z: 74, h: 79, r: 12, rot: 1.1, name: '海镜中心' },
  { x: -96, z: -88, h: 75, r: 10, rot: -0.4, name: '云庭' },
  { x: 83, z: -90, h: 94, r: 11, rot: 0.8, name: '远航中心' },
  { x: 99, z: -12, h: 57, r: 9, rot: 2.4, name: '蓝湾花园' },
  { x: -100, z: -12, h: 46, r: 9, rot: 0.4, name: '海岸研究所' },
  { x: -4, z: -106, h: 58, r: 8, rot: 2.0, name: '空中花园' },
];
function material(color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
export function buildWorld(scene: THREE.Scene, loadingManager?: THREE.LoadingManager) {
  const root = new THREE.Group(); scene.add(root);
  const obstacles: Obstacle[] = [];
  const seats:Seat[]=[];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const white = material('#d6d4cd', 0.78, 0.0), pavement = material('#dadbd8'), pale = material('#e1dfd4');
  const asphalt = material('#b6b6b6', 0.96), lines = material('#ececd9'), yellow = material('#d1c29a');
  const grass = material('#607d43'), leaf = material('#497342'), leafLight = material('#66844a');
  const bark = material('#7a7059'), steel = material('#858986', 0.4, 0.7), dark = material('#353e40', 0.6, 0.15);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#526369', roughness: 0.15, metalness: 0.12, envMapIntensity: 1.15, clearcoat: .25, clearcoatRoughness: .18, ior: 1.5 });
  const pool = new THREE.MeshStandardMaterial({ color: '#557c78', metalness: 0.12, roughness: 0.13 });
  const light = new THREE.MeshStandardMaterial({ color: '#deffff', emissive: '#7dc4e3', emissiveIntensity: 0.65 });
  const railGlass = new THREE.MeshPhysicalMaterial({color:'#bed5d5',metalness:.1,roughness:.12,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false});
  const interior = material('#3c4443',.86), warm = new THREE.MeshStandardMaterial({color:'#dacdb2',emissive:'#e4c295',emissiveIntensity:.22,roughness:.8});
  for(const m of [pavement,asphalt]) {
    m.roughness=1;
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.78);');};
    m.customProgramCacheKey=()=> 'dry-paving-v1';
  }
  if (typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader(loadingManager);
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
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat pane=fract(sin(dot(floor(vCityPosition*vec3(.60,.285,.60)),vec3(12.9898,78.233,37.71)))*43758.5453);diffuseColor.rgb*=.87+.13*pane;');
  };
  glass.customProgramCacheKey=()=> 'city-glazing-v3';
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
    block(pavement, x, 0.07, z === 0 ? 0 : Math.sign(z)*90, x === 0 ? 73 : 70, 0.11, z === 0 ? 73 : 60);

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
  buildArchitecture({root,obstacles,add,block,disk,pipe,palm,tree,shrub,white,steel,dark,glass,grass,light},TOWERS);
  buildBuildingIdentities({add},TOWERS);
  TOWERS.forEach(({x,z},index)=>{
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
  const spray=new THREE.MeshPhysicalMaterial({color:'#d9e5df',roughness:.2,transparent:true,opacity:.5,depthWrite:false});
  for (let k = 0; k < 20; k++) {
    const a = k * Math.PI / 10, x = Math.cos(a) * 12, z = fz + Math.sin(a) * 12;
    const p = Array.from({ length: 12 }, (_, j) => { const t = j / 11; return new THREE.Vector3(x * (1 - t * 0.22), 0.55 + Math.sin(t * Math.PI) * 3, fz + (z - fz) * (1 - t * 0.22)); });
    pipe(p, 0.033, spray, 12);
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
  enrichCity({root,obstacles,seats,add,block,disk,pipe,palm,tree,shrub,white,steel,dark,glass,grass,light});
  buildStreetLife({root,obstacles,seats,add,block,disk,pipe,palm,tree,shrub,white,steel,dark,glass,grass,light});
  buildRetail({root,obstacles,add,block,pipe,white,steel,dark});
  buildSchool({root,obstacles,add,block,pipe,shrub,white,steel,dark,glass,grass,light});
  buildPoliceStation({root,obstacles,add,block,pipe,shrub,white,steel,dark,glass,grass,light});
  for(const seat of seats)seat.occupied=CITIZENS.some(c=>c.seatId===seat.id);
  // Batch fixed architectural details into one draw call per material.
  for (const [m, geometries] of batches) {
    const g = mergeGeometries(geometries, false);
    if(!g)throw new Error("Unable to merge architectural geometry");
    if (g) { const mesh = new THREE.Mesh(g, m); mesh.castShadow = ![lines, yellow, pool, light, railGlass].includes(m as THREE.MeshStandardMaterial); mesh.receiveShadow = true; root.add(mesh); }
    geometries.forEach(g => g.dispose());
  }
  vegetation.flush();
  // Physically lit ocean: world-space wave normals reflect the same HDR sky and sun.
  const waterUniforms = { uTime: { value: 0 } };
  const water = new THREE.MeshPhysicalMaterial({color:'#42615f',roughness:.18,metalness:.08,ior:1.333,envMapIntensity:1.15});
  water.onBeforeCompile=shader=>{
    shader.uniforms.uTime=waterUniforms.uTime;
    shader.vertexShader='varying vec3 vWaterWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=`varying vec3 vWaterWorld; uniform float uTime;
      float seaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float seaNoise(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(seaHash(a),seaHash(a+vec2(1,0)),f.x),mix(seaHash(a+vec2(0,1)),seaHash(a+vec2(1)),f.x),f.y);}
      float waves(vec2 p){return seaNoise(p*vec2(.38,.81)+vec2(uTime*.15,-uTime*.08))*.55+seaNoise(p*vec2(.91,1.65)-vec2(uTime*.13,uTime*.05))*.22;}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec2 p=vWaterWorld.xz;
      float fade=1.-smoothstep(80.,950.,distance(vWaterWorld,cameraPosition));
      float nx=(waves(p+vec2(.16,0))-waves(p-vec2(.16,0)))*.9;
      float nz=(waves(p+vec2(0,.16))-waves(p-vec2(0,.16)))*.9;
      normal=normalize(mat3(viewMatrix)*normalize(vec3(nx*fade,1.,nz*fade)));
    `);
  };
  water.customProgramCacheKey=()=> 'coastal-pbr-water-v1';
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), water); sea.rotation.x = -Math.PI / 2; sea.position.y = -2; root.add(sea);
  box.dispose(); cylinder.dispose(); sphere.dispose();
  return { obstacles, seats, root, glass, update(time: number) {
    waterUniforms.uTime.value = time; sculpture.rotation.y = time * 0.065;
  } };
}
