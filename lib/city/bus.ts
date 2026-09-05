import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original procedural asset. Metres, +Y up, +Z forward; driver-left is +X. */
export const BUS_METADATA = {
  name: 'Pelagia L10 · coastal electric city bus',
  body: { length: 10.4, width: 2.5, height: 3.15 },
  envelope: { length: 10.52, width: 3.13, height: 3.15 },
  wheelRadius: .49, wheelbase: 6.15, trackWidth: 2.15,
  axles: { frontZ: 3.05, rearZ: -3.1, centerY: .49 },
  floorY: .42, seatedPassengers: 24, doorsSide: '-X',
  driverEye: [ .72, 1.92, 4.1 ],
  steeringPivot: [ .73, 1.25, 4.19 ],
  cruisingSpeed: 3.8,
  origin: 'Geometric body center on road; not rear-axle origin',
  route: '01 滨海环线', branding: 'PELAGIA TRANSIT',
  license: 'Original procedural geometry and fictional branding; no external model or texture assets.',
} as const;

type MatKey = 'paint'|'teal'|'trim'|'glass'|'metal'|'rubber'|'seat'|'floor'|'amber'|'red'|'lamp'|'atlas';
type Materials = Record<MatKey, THREE.MeshStandardMaterial>;
type AtlasRegion = 'front'|'side'|'rear'|'brand'|'access'|'plate';
const ATLAS_RECTS: Record<AtlasRegion, [number,number,number,number]> = {
  front:[0,0,1024,176], side:[0,184,1024,128], rear:[1024,0,384,176],
  brand:[0,324,1536,192], access:[1552,324,128,128], plate:[1424,0,480,128],
};

function makeAtlas() {
  // A guarded fallback keeps server-side construction and numerical tests DOM-free.
  if(typeof document === 'undefined') {
    const t=new THREE.DataTexture(new Uint8Array([198,219,216,255]),1,1,THREE.RGBAFormat);
    t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;t.name='Transit atlas (Node fallback)';return t;
  }
  const c=document.createElement('canvas');c.width=2048;c.height=1024;
  const context=c.getContext('2d');
  if(!context)return new THREE.Texture();
  const g=context;
  g.fillStyle='#ecf0ed';g.fillRect(0,0,c.width,c.height);
  const font='"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  function panel(key:AtlasRegion,bg:string) {const [x,y,w,h]=ATLAS_RECTS[key];g.fillStyle=bg;g.fillRect(x,y,w,h);return{x,y,w,h};}
  function centered(text:string,x:number,y:number,size:number,color:string,weight=600) {g.fillStyle=color;g.font=`${weight} ${size}px ${font}`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,x,y);}
  let r=panel('front','#141c1a');
  centered('01',r.x+105,r.y+87,124,'#ebcc79',650);
  centered('滨海环线',r.x+602,r.y+74,87,'#ebcc79',600);
  centered('COASTAL CIRCULAR',r.x+607,r.y+140,27,'#ccb879',500);
  r=panel('side','#141c1a');centered('01  滨海环线',r.x+r.w/2,r.y+r.h/2,83,'#ebcc79');
  r=panel('rear','#141c1a');centered('01',r.x+r.w/2,r.y+r.h/2,134,'#ebcc79');
  // Subtle physical LED mask, painted once into the single atlas.
  for(const key of ['front','side','rear'] as AtlasRegion[]) {
    const [x,y,w,h]=ATLAS_RECTS[key];g.fillStyle='rgba(11,17,14,0.30)';
    for(let xx=x;xx<x+w;xx+=5)g.fillRect(xx,y,1,h);
    for(let yy=y;yy<y+h;yy+=5)g.fillRect(x,yy,w,1);
  }
  r=panel('brand','#ecf0ed');
  // Original Pelagia wave mark, not a third-party transport logo.
  g.strokeStyle='#174c50';g.lineWidth=10;g.lineCap='round';
  for(let i=0;i<3;i++){g.beginPath();g.moveTo(25,r.y+70+i*25);g.bezierCurveTo(75,r.y+35+i*25,105,r.y+105+i*25,162,r.y+60+i*25);g.stroke();}
  centered('PELAGIA TRANSIT',850,r.y+78,105,'#174c50',600);
  centered('海境公交  ·  ZERO EMISSION',852,r.y+155,39,'#4f696b',500);
  r=panel('access','#174c50');centered('♿',r.x+r.w/2,r.y+r.h/2,101,'#ffffff');
  r=panel('plate','#edf0dc');centered('PL · E0101',r.x+r.w/2,r.y+r.h/2,78,'#23362f');
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.name='Pelagia transit signs 2048×1024';return t;
}

function materials(): Materials {
  const m=(name:string,color:string,roughness:number,metalness=0)=>{const a=new THREE.MeshStandardMaterial({color,roughness,metalness});a.name=name;return a;};
  const glass=m('Glass','#45696e',.2,.27);glass.transparent=true;glass.opacity=.39;glass.depthWrite=false;glass.side=THREE.DoubleSide;
  const atlas=m('BusSignage','#ffffff',.57,.04);atlas.map=makeAtlas();
  const amber=m('BusAmber','#d58b25',.33,.12);amber.emissive.set('#d89122');amber.emissiveIntensity=.17;
  const red=m('BusRearLights','#a82225',.29,.1);red.emissive.set('#ad171b');red.emissiveIntensity=.25;
  const lamp=m('BusHeadlights','#e8ece2',.2,.15);lamp.emissive.set('#edf4df');lamp.emissiveIntensity=.34;
  return {paint:m('BusPorcelain','#ecf0ed',.31,.29),teal:m('BusDeepTeal','#174c50',.34,.32),trim:m('BusTrim','#242b2d',.72,.09),glass,
    metal:m('BusMetal','#a7b2b1',.31,.76),rubber:m('BusRubber','#1c2022',.91,.0),seat:m('BusSeatFabric','#496e74',.91,.0),floor:m('BusFloor','#555d5a',.94,.01),amber,red,lamp,atlas};
}

/** Build once, then pass directly to Traffic.batchTemplate(root, buses). */
export function createCityBus(): THREE.Group {
  const root=new THREE.Group();root.name='PelagiaCityBus';root.userData={...BUS_METADATA};
  const body=new THREE.Group();body.name='Body';root.add(body);
  const mats=materials();
  // Every material is merged per rigid part. Only wheel / steering groups need animation.
  const buckets=new Map<THREE.Group,Map<MatKey,THREE.BufferGeometry[]>>();
  function add(g:THREE.BufferGeometry,mat:MatKey,position:THREE.Vector3|[number,number,number]=[0,0,0],rotation:[number,number,number]=[0,0,0],part=body){
    const p=Array.isArray(position)?new THREE.Vector3(...position):position;
    g.applyMatrix4(new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1)));
    let b=buckets.get(part);if(!b){b=new Map();buckets.set(part,b);}let list=b.get(mat);if(!list){list=[];b.set(mat,list);}list.push(g);
  }
  const box=(mat:MatKey,size:[number,number,number],p:[number,number,number],r:[number,number,number]=[0,0,0],part=body,bevel=0)=>add(bevel?new RoundedBoxGeometry(...size,1,Math.min(bevel,...size.map(v=>v/2))):new THREE.BoxGeometry(...size),mat,p,r,part);
  function tube(mat:MatKey,a:[number,number,number],b:[number,number,number],radius:number,part=body,segments=8){
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const geo=new THREE.CylinderGeometry(radius,radius,d.length(),segments);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));add(geo,mat,av.add(bv).multiplyScalar(.5),[0,0,0],part);
  }
  function sign(key:AtlasRegion,width:number,height:number,p:[number,number,number],rotation:[number,number,number]=[0,0,0]){
    const g=new THREE.PlaneGeometry(width,height);const uv=g.getAttribute('uv');const [x,y,w,h]=ATLAS_RECTS[key];
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x+uv.getX(i)*w)/2048,1-(y+(1-uv.getY(i))*h)/1024);
    add(g,'atlas',p,rotation);
  }
  function profileExtrusion(points:[number,number][],depth:number,mat:MatKey,x:number) {
    // profile uses (-z,y); +90° Y turns extrusion depth into world +X.
    const s=new THREE.Shape(points.map(([z,y])=>new THREE.Vector2(-z,y)));
    const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,steps:1});add(g,mat,[x,0,0],[0,Math.PI/2,0]);
  }

  // Chassis, low-floor deck, passenger saloon ceiling and the inset rounded roof.
  box('trim',[1.94,.17,9.64],[0,.295,0],[0,0,0],body,.06);
  box('floor',[2.31,.1,9.87],[0,.37,0],[0,0,0],body,.04);
  box('paint',[2.48,.19,9.79],[0,2.77,-.045],[0,0,0],body,.085);
  box('paint',[2.39,.24,9.66],[0,2.905,-.045],[0,0,0],body,.11);
  box('teal',[2.49,.075,9.85],[0,2.665,-.03],[0,0,0],body,.032);
  // Roof electric bus HVAC equipment: a low cowl, ribs, and discrete service seams.
  box('paint',[1.63,.16,3.08],[0,3.07,-1.26],[0,0,0],body,.075);
  box('trim',[1.31,.023,1.09],[0,3.128,-1.44]);
  for(let i=0;i<15;i++)box('metal',[1.24,.007,.026],[0,3.144,-1.93+i*.071]);
  box('metal',[.66,.018,.61],[0,3.03,2.11],[0,0,0],body,.04);
  // Flush roof edge rails visually break up the silhouette without rooftop clutter.
  for(const side of [-1,1])tube('metal',[side*1.06,3.015,-4.16],[side*1.06,3.015,3.62],.016);

  // Wheel wells are actual concave openings in the body profile, not black discs.
  const sideProfile:[number,number][]=[[-4.99,.32]];
  for(const z of [-3.1,3.05]){
    sideProfile.push([z-.615,.32],[z-.615,.49]);
    for(let i=1;i<=18;i++){const a=Math.PI-i*Math.PI/18;sideProfile.push([z+Math.cos(a)*.615,.49+Math.sin(a)*.615]);}
    sideProfile.push([z+.615,.32]);
  }
  sideProfile.push([4.99,.32],[4.99,1.40],[-4.99,1.40]);
  for(const side of [-1,1]){
    if(side===1)profileExtrusion(sideProfile,.075,'paint',1.17);
    else for(const [a,b] of [[-4.99,-1.35],[.23,3.735],[4.825,4.99]]) {
      const points:[number,number][]=[[a,.32]];
      for(const z of [-3.1,3.05])if(z-.615>a&&z+.615<b){
        points.push([z-.615,.32],[z-.615,.49]);
        for(let i=1;i<=18;i++){const angle=Math.PI-i*Math.PI/18;points.push([z+Math.cos(angle)*.615,.49+Math.sin(angle)*.615]);}
        points.push([z+.615,.32]);
      }
      points.push([b,.32],[b,1.4],[a,1.4]);profileExtrusion(points,.075,'paint',-1.245);
    }
    // Blue-green belt and lower skirt separate the glass from the sculpted body.
    if(side===1)box('teal',[.024,.23,9.91],[side*1.251,1.295,0]);
    else for(const [a,b] of [[-4.99,-1.35],[.23,3.735],[4.825,4.99]])box('teal',[.024,.23,b-a],[side*1.251,1.295,(a+b)/2]);
    const skirts=side===1?[[-4.40,1.13],[-.025,4.89],[4.4,1.12]]:[[-4.40,1.13],[-1.882,1.064],[1.3,2.14],[4.91,.16]];
    for(const [z,len] of skirts)box('teal',[.026,.135,len],[side*1.249,.425,z]);
    // Raised rubber and metal lips describe the arched fenders at street distance.
    for(const z of [-3.1,3.05]){
      for(let i=0;i<20;i++){
        const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
        tube('trim',[side*1.249,.49+Math.sin(a)*.618,z+Math.cos(a)*.618],[side*1.249,.49+Math.sin(b)*.618,z+Math.cos(b)*.618],.024);
      }
      box('trim',[.23,.48,.043],[side*1.11,.31,z-.52]);
      // Interior wheel housings. The bus floor is low between the axles.
      box('floor',[.37,.58,1.26],[side*.974,.78,z],[0,0,0],body,.09);
    }
    // Continuous window rails and slim B/C pillars; individual glass bays leave doors clear.
    box('trim',[.037,.064,9.79],[side*1.236,1.437,-.035]);
    box('trim',[.037,.077,9.68],[side*1.221,2.621,-.063]);
    const spans: [number,number][] = side===1
      ? [[-4.80,-3.67],[-3.61,-2.2],[-2.14,-.71],[-.65,.79],[.85,2.26],[2.32,3.48],[3.54,4.76]]
      : [[-4.8,-3.67],[-3.61,-2.18],[-2.12,-1.36],[.23,1.49],[1.55,2.70],[2.76,3.69]];
    for(const [a,b] of spans){
      const z=(a+b)/2,len=b-a;
      box('trim',[.03,1.163,len],[side*1.239,2.031,z],[0,0,0],body,.025);
      box('glass',[.015,1.072,len-.073],[side*1.260,2.035,z],[0,0,0],body,.025);
      // Black gasket edges are a frame, not an opaque backing behind the glazing.
      const last=buckets.get(body)!.get('trim')!;last.pop()!.dispose();
      box('trim',[.038,.045,len],[side*1.259,1.48,z]);
      box('trim',[.038,.045,len],[side*1.259,2.590,z]);
      for(const zz of [a+.018,b-.018])box('trim',[.038,1.15,.036],[side*1.259,2.035,zz]);
      box('trim',[.044,.022,len-.04],[side*1.27,2.34,z]);
      for(const zz of [a+.032,b-.032])box('metal',[.015,.015,.03],[side*1.289,2.355,zz]);
    }
    for(const z of [-4.91,-3.64,-2.17,.82,2.29,3.51,4.84])box('paint',[.10,1.24,.052],[side*1.195,2.02,z]);
    // Small side repeaters, luggage-panel seams and a recessed charge/service panel.
    for(const z of [-4.25,-1.62,1.83,4.59])box('amber',[.023,.060,.125],[side*1.271,.812,z],[0,0,0],body,.014);
    for(const z of [-4.43,-1.6,.52,1.84,4.4])box('trim',[.013,.29,.009],[side*1.254,.83,z]);
    box('trim',[.017,.34,.58],[side*1.267,.98,-4.35],[0,0,0],body,.024);
    box('paint',[.022,.31,.54],[side*1.278,.98,-4.35],[0,0,0],body,.019);
    box('metal',[.024,.030,.105],[side*1.295,1.056,-4.47]);
    // Bus markings are shallow decals on the body, with readable bilingual typography.
    sign('brand',side===1?2.83:2.1,side===1?.354:.263,[side*1.275,.962,side===1?-.1:1.45],[0,side*Math.PI/2,0]);
  }

  // Two glazed passenger doors on the curb side (-X). Thin dark outlines and split leaves.
  const doors=[{z:4.28,width:1.04},{z:-.57,width:1.45}];
  for(const {z,width} of doors){
    // Recessed sill and actual three-dimensional visible low entrance treads.
    box('trim',[.09,2.235,width+.105],[-1.246,1.585,z]);
    // Remove the opaque door backing; frame is assembled around clear glass.
    buckets.get(body)!.get('trim')!.pop()!.dispose();
    for(const zz of [z-width/2-.028,z+width/2+.028])box('trim',[.071,2.19,.048],[-1.270,1.574,zz]);
    box('trim',[.071,.08,width+.1],[-1.27,2.655,z]);
    for(let leaf=0;leaf<2;leaf++){
      const zz=z+(leaf-.5)*width/2;
      box('glass',[.022,1.94,width/2-.046],[-1.29,1.60,zz],[0,0,0],body,.022);
      box('trim',[.043,2.16,.034],[-1.301,1.57,z]);
      box('teal',[.036,.205,width/2-.04],[-1.306,.59,zz]);
      box('trim',[.045,.055,width/2-.04],[-1.304,1.365,zz]);
      tube('metal',[-1.326,1.20,zz-.07],[-1.326,1.49,zz-.07],.014);
    }
    for(let i=0;i<2;i++)box('floor',[.31,.045,width-.13],[-1.14+i*.29,.305+i*.07,z]);
    box('metal',[.039,.036,width-.17],[-1.309,.43,z]);
    sign('access',.21,.21,[-1.333,1.23,z+width/2+.14],[0,-Math.PI/2,0]);
    box('amber',[.025,.033,width-.16],[-1.324,2.676,z]);
  }
  // Side destination board occupies a top glazing panel, not a floating billboard.
  box('trim',[.026,.27,1.63],[-1.278,2.434,1.49]);
  sign('side',1.57,.208,[-1.296,2.434,1.49],[0,-Math.PI/2,0]);

  // Sculpted front fascia. Cross-section shrinks at the corners and under the bumper.
  const section=(y:number,half:number,z:number)=>[[-half+.18,y,z],[-half,y,z-.18],[-half,y,4.63],[half,y,4.63],[half,y,z-.18],[half-.18,y,z]] as [number,number,number][];
  function loft(sections:[number,number,number][][],mat:MatKey){
    const positions:number[]=[];
    for(let k=1;k<sections.length;k++)for(let i=0;i<sections[k].length;i++){
      const j=(i+1)%sections[k].length,a=sections[k-1][i],b=sections[k-1][j],c=sections[k][j],d=sections[k][i];positions.push(...a,...d,...b,...b,...d,...c);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();add(g,mat);
  }
  loft([section(.32,1.13,5.07),section(.59,1.246,5.20),section(1.27,1.246,5.16),section(1.43,1.18,5.11)],'paint');
  box('teal',[2.12,.26,.043],[0,.724,5.181],[0,0,0],body,.055);
  box('trim',[2.075,.105,.068],[0,.37,5.104],[0,0,0],body,.039);
  box('trim',[.84,.099,.026],[0,.592,5.213],[0,0,0],body,.025);
  for(let i=0;i<12;i++)box('metal',[.032,.04,.028],[-.367+i*.067,.593,5.231]);
  sign('plate',.57,.152,[0,.901,5.198]);
  // Front windshield is a sloping, clear two-piece glazed surface with a narrow central mullion.
  const windshieldPitch=-.168;
  box('glass',[2.273,1.235,.018],[0,2.047,5.015],[windshieldPitch,0,0],body,.061);
  for(const x of [-1.149,0,1.149])box('trim',[x===0?.025:.072,1.313,.045],[x,2.037,5.015],[windshieldPitch,0,0],body,.018);
  for(const [y,z] of [[1.418,5.115],[2.683,4.907]])box('trim',[2.28,.069,.045],[0,y,z],[windshieldPitch,0,0],body,.025);
  // Upper destination box integrated into the front roof brow.
  box('paint',[2.29,.31,.22],[0,2.823,4.958],[0,0,0],body,.09);
  box('trim',[1.915,.239,.025],[0,2.819,5.082],[0,0,0],body,.047);
  sign('front',1.826,.222,[0,2.82,5.098]);
  // Flush lamps, projector recesses, LED outlines, washers and twin windshield wipers.
  for(const side of [-1,1]){
    box('trim',[.405,.208,.077],[side*.884,.995,5.167],[0,side*.055,0],body,.046);
    box('lamp',[.289,.069,.028],[side*.879,1.045,5.212],[0,side*.055,0],body,.028);
    box('lamp',[.089,.061,.030],[side*.99,.962,5.214],[0,side*.055,0],body,.025);
    box('amber',[.208,.036,.031],[side*.839,.925,5.217],[0,side*.055,0],body,.013);
    tube('trim',[side*.54,1.436,5.15],[side*.68,1.98,5.066],.016);
    tube('trim',[side*.72,1.72,5.118],[side*.72,2.23,5.031],.018);
    box('trim',[.053,.027,.022],[side*.64,1.365,5.15],[0,0,0],body,.007);
    // Full-width body stays 2.5m; mirrors extend to 3.09m, as recorded in metadata.
    tube('trim',[side*1.13,2.676,4.785],[side*1.445,2.665,4.955],.030);
    tube('trim',[side*1.445,2.665,4.955],[side*1.46,2.247,5.012],.025);
    box('trim',[.168,.385,.126],[side*1.46,2.218,5.020],[0,side*.13,0],body,.055);
    box('metal',[.125,.329,.013],[side*1.46,2.218,4.950],[0,side*.13,0],body,.037);
  }

  // Rear engine / inverter service cover, tall rear glazing, lamps and cooling louvers.
  box('paint',[2.47,1.14,.18],[0,.89,-5.11],[0,0,0],body,.075);
  box('trim',[2.335,1.20,.05],[0,2.035,-4.986],[0,0,0],body,.035);
  buckets.get(body)!.get('trim')!.pop()!.dispose();
  box('glass',[2.265,1.115,.027],[0,2.035,-5.003],[0,0,0],body,.054);
  for(const x of [-1.178,1.178])box('paint',[.13,1.21,.132],[x,2.03,-4.991],[0,0,0],body,.05);
  for(const y of [1.432,2.63])box('trim',[2.37,.064,.06],[0,y,-5.019]);
  box('teal',[2.36,.2,.032],[0,1.319,-5.219],[0,0,0],body,.025);
  box('trim',[2.13,.09,.065],[0,.366,-5.207],[0,0,0],body,.033);
  box('trim',[1.20,.395,.025],[0,.875,-5.207],[0,0,0],body,.035);
  for(let i=0;i<9;i++)box('paint',[1.10,.020,.029],[0,.704+i*.039,-5.231]);
  sign('rear',.408,.189,[0,2.496,-5.044],[0,Math.PI,0]);
  sign('plate',.55,.146,[0,.497,-5.245],[0,Math.PI,0]);
  for(const side of [-1,1]){
    box('trim',[.154,.626,.055],[side*1.017,.918,-5.213],[0,0,0],body,.045);
    box('red',[.101,.344,.026],[side*1.017,1.042,-5.251],[0,0,0],body,.036);
    box('amber',[.101,.072,.026],[side*1.017,.801,-5.251],[0,0,0],body,.017);
    box('lamp',[.101,.067,.026],[side*1.017,.701,-5.251],[0,0,0],body,.017);
  }

  // 24 individual upholstered seats, clear center aisle, support frames and grab poles.
  // Mid/front door standing areas on -X deliberately remain clear.
  let seatCount=0;
  const seats: [number,number][]=[];
  for(const z of [-4.28,-3.44,-2.60,-1.76,-.92,-.08,.76,1.60,2.44])seats.push([.81,z]);
  for(const z of [-4.28,-3.44,-2.60,1.05,1.89,2.73])seats.push([-.81,z]);
  for(const z of [-4.28,-3.44,-2.60,-1.76,-.92,-.08,.76,1.60,2.44])seats.push([.36,z]);
  for(const [x,z] of seats){
    const raised=Math.abs(z+3.1)<.68||Math.abs(z-3.05)<.68;
    const seatY=raised?1.20:.96;
    box('seat',[.404,.11,.398],[x,seatY,z],[0,0,0],body,.048);
    box('seat',[.405,.505,.10],[x,seatY+.257,z-.177],[-.10,0,0],body,.052);
    box('trim',[.415,.39,.037],[x,seatY+.247,z-.24],[-.10,0,0],body,.017);
    for(const dx of [-.14,.14])tube('metal',[x+dx,.425,z-.09],[x+dx,seatY-.05,z-.09],.018);
    tube('metal',[x-.152,seatY+.507,z-.211],[x+.152,seatY+.507,z-.211],.018);
    seatCount++;
  }
  for(const z of [-3.95,-1.57,.43,2.51]){
    for(const x of [-.405,.105])tube('metal',[x,.425,z],[x,2.555,z],.022);
    tube('metal',[-.405,2.555,z],[.105,2.555,z],.022);
  }
  for(const x of [-.4,.1]){
    tube('metal',[x,2.55,-4.4],[x,2.55,3.24],.024);
    for(const z of [-3.61,-2.86,-1.91,-.71,.39,1.54,2.49]){
      tube('trim',[x,2.55,z],[x,2.32,z],.015);
      const handle=new THREE.TorusGeometry(.065,.012,5,10);add(handle,'trim',[x,2.252,z],[0,Math.PI/2,0]);
    }
  }
  // Rear inward-facing perch, lit saloon strips, overhead conduit and stop buttons.
  for(const side of [-1,1]){
    box('lamp',[.045,.018,7.8],[side*.775,2.662,-.32]);
    box('trim',[.092,.065,8.6],[side*1.114,2.586,-.18],[0,0,0],body,.02);
  }
  for(const x of [-.405,.105])for(const z of [-1.57,.43,2.51])box('red',[.044,.054,.027],[x+(x<0?.023:-.023),1.28,z],[0,0,0],body,.01);
  // Driver console and a separately animated steering wheel with the same traffic convention.
  box('trim',[1.40,.27,.54],[.452,1.102,4.405],[-.12,0,0],body,.085);
  box('teal',[.52,.028,.239],[.714,1.241,4.333],[-.23,0,0],body,.035);
  box('lamp',[.262,.012,.071],[.714,1.263,4.343],[-.23,0,0],body,.013);
  box('seat',[.45,.135,.462],[.73,.927,3.63],[0,0,0],body,.06);
  box('seat',[.45,.674,.129],[.73,1.30,3.403],[-.085,0,0],body,.06);
  tube('metal',[.73,.425,3.615],[.73,.88,3.615],.055);
  tube('trim',[.73,.86,4.44],[.73,1.25,4.19],.042);
  const steering=new THREE.Group();steering.name='SteeringWheel';steering.position.set(...BUS_METADATA.steeringPivot);steering.rotation.x=.64;root.add(steering);
  add(new THREE.TorusGeometry(.208,.021,7,28),'trim',[0,0,0],[0,0,0],steering);
  for(const angle of [Math.PI/2,Math.PI*7/6,Math.PI*11/6])tube('trim',[0,0,0],[Math.cos(angle)*.193,Math.sin(angle)*.193,0],.018,steering);
  box('trim',[.115,.10,.057],[0,0,0],[0,0,0],steering,.021);
  // Ticket validator alongside the front door, and driver screen / partition stanchion.
  tube('metal',[-.43,.425,3.555],[-.43,2.51,3.555],.025);
  box('teal',[.16,.245,.125],[-.43,1.361,3.555],[0,.28,0],body,.041);
  box('lamp',[.10,.071,.017],[-.43,1.398,3.625],[0,.28,0],body,.012);
  box('glass',[.027,.968,.58],[.079,1.785,3.516]);

  // Independent wheel pivots. The cylinder axis is baked into geometry; node basis stays XYZ.
  for(const [name,x,z] of [
    ['WheelFrontLeft',1.075,3.05],['WheelFrontRight',-1.075,3.05],
    ['WheelRearLeft',1.075,-3.1],['WheelRearRight',-1.075,-3.1],
  ] as [string,number,number][]){
    const wheel=new THREE.Group();wheel.name=name;wheel.position.set(x,.49,z);root.add(wheel);
    const outward=Math.sign(x),rear=name.includes('Rear'),width=rear?.334:.285;
    add(new THREE.CylinderGeometry(.465,.465,width,32,1),'rubber',[0,0,0],[0,0,Math.PI/2],wheel);
    for(const t of [-1,1])add(new THREE.TorusGeometry(.423,.067,7,32),'rubber',[t*(width/2-.043),0,0],[0,Math.PI/2,0],wheel);
    const face=outward*(width/2+.009);
    add(new THREE.CylinderGeometry(.286,.286,.035,28),'metal',[face,0,0],[0,0,Math.PI/2],wheel);
    add(new THREE.TorusGeometry(.256,.021,6,28),'metal',[face+outward*.02,0,0],[0,Math.PI/2,0],wheel);
    add(new THREE.CylinderGeometry(.129,.129,.06,16),'metal',[face+outward*.025,0,0],[0,0,Math.PI/2],wheel);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,rr=.206;
      add(new THREE.CylinderGeometry(.036,.036,.005,8),'trim',[face+outward*.023,Math.cos(a)*rr,Math.sin(a)*rr],[0,0,Math.PI/2],wheel);
      add(new THREE.CylinderGeometry(.014,.014,.027,6),'metal',[face+outward*.061,Math.cos(a)*.097,Math.sin(a)*.097],[0,0,Math.PI/2],wheel);
    }
    // Shallow tread blocks read as rubber rather than shiny smooth toy wheels.
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16;
      box('rubber',[width*.65,.015,.037],[0,Math.cos(a)*.477,Math.sin(a)*.477],[a,0,0],wheel);
    }
  }

  let triangles=0;
  for(const [part,groups] of buckets){
    for(const [mat,geometries] of groups){
      const normalized=geometries.map(g=>{
        const n=g.index?g.toNonIndexed():g;
        if(n!==g)g.dispose();
        for(const key of Object.keys(n.attributes))if(!['position','normal','uv'].includes(key))n.deleteAttribute(key);
        if(!n.attributes.uv)n.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count*2),2));
        return n;
      });
      const merged=mergeGeometries(normalized,false);normalized.forEach(g=>g.dispose());
      if(!merged)throw new Error(`Bus geometry merge failed: ${part.name}/${mat}`);
      merged.computeBoundingBox();merged.computeBoundingSphere();
      const mesh=new THREE.Mesh(merged,mats[mat]);mesh.name=`${part.name}_${mat}`;mesh.castShadow=mat!=='glass';mesh.receiveShadow=true;part.add(mesh);triangles+=merged.attributes.position.count/3;
    }
  }
  root.userData.seatedPassengers=seatCount;
  root.userData.geometryTriangles=triangles;
  root.updateMatrixWorld(true);
  return root;
}

/** Dispose a standalone template/preview. Traffic.batchTemplate already disposes its input geometries/materials. */
export function disposeCityBus(root:THREE.Object3D) {
  const mats=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){mats.add(m);const t=(m as THREE.MeshStandardMaterial).map;if(t)textures.add(t);}}});
  for(const m of mats)m.dispose();for(const t of textures)t.dispose();root.removeFromParent();
}
