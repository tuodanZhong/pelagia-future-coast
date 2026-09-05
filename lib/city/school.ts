import * as THREE from 'three';

/** Structural DetailKit subset; copy to city/lib/city without changing imports. */
export type SchoolContext = {
  root: THREE.Group;
  obstacles: {x:number;z:number;rx:number;rz:number;shape?:'ellipse'|'box';height?:number;yaw?:number}[];
  add:(g:THREE.BufferGeometry,m:THREE.Material,x?:number,y?:number,z?:number,sx?:number,sy?:number,sz?:number,ry?:number)=>void;
  block:(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,rot?:number)=>void;
  pipe:(points:THREE.Vector3[],radius:number,material:THREE.Material,segments?:number)=>void;
  shrub?:(x:number,z:number,scale?:number,y?:number)=>void;
  white:THREE.Material;steel:THREE.Material;dark:THREE.Material;glass:THREE.Material;grass:THREE.Material;light?:THREE.Material;
};

/** Metres, world space. cameraYaw uses camera forward (-sin(yaw),-cos(yaw)). */
export const SCHOOL = {
  id:'blue-bay-school', name:'蓝湾学校', subtitle:'BLUE BAY SCHOOL',
  center:{x:0,z:-81.7}, ground:.125, floors:3,
  bounds:{minX:-22.1,maxX:22.25,minZ:-87.8,maxZ:-75.6,maxY:12.65},
  building:{minX:-20.4,maxX:18.4,minZ:-87.5,maxZ:-81.9},
  gate:{x:22,z:-78.2,width:4,faces:'+X',clearFromZ:-80.2,clearToZ:-76.2},
  spawn:{x:23.5,z:-74.9}, cameraYaw:.96,
  courtyard:{x:0,z:-78.45,width:39,depth:4.3},
  busStop:{x:32,z:-70,existing:true,label:'蓝湾学校 / BLUE BAY SCHOOL',curbX:36.5,roadCenterX:43.8,vehicleStop:{x:43.8,z:-70,yaw:0},doorSide:'local-X',waiting:{x:30.6,z:-72.6},sign:{x:35.05,z:-75.0},pedestrianAccess:[{x:35.6,z:-75.65},{x:30.6,z:-75.65},{x:23.5,z:-75.65},{x:23.5,z:-78.2}]},
  accessWaypoints:[{x:30.6,z:-72.6},{x:23.5,z:-72.6},{x:23.5,z:-78.2},{x:20.5,z:-78.2},{x:0,z:-78.2}],
} as const;

function signage() {
  const material=new THREE.MeshStandardMaterial({name:'SchoolSignage',color:'#dce4df',roughness:.86});
  if(typeof document==='undefined')return material;
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=768;
  const ctx=canvas.getContext('2d');if(!ctx)return material;
  const rows=[['蓝 湾 学 校','BLUE BAY SCHOOL','向海而学 · 向新而行'],['校园入口','SCHOOL ENTRANCE','访客请登记'],['阅 读 · 运 动 · 探 索','LEARN  •  PLAY  •  DISCOVER','蓝湾社区校园']];
  rows.forEach(([title,sub,note],i)=>{
    const y=i*256;ctx.fillStyle=i===1?'#d8e0d9':'#335958';ctx.fillRect(0,y,1536,256);
    ctx.fillStyle=i===1?'#335958':'#edf0e8';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='600 93px "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif';ctx.fillText(title,768,y+82,1410);
    ctx.font='500 37px Arial, sans-serif';ctx.fillText(sub,768,y+159,1380);
    ctx.font='400 30px "PingFang SC", Arial, sans-serif';ctx.fillText(note,768,y+217,1380);
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  material.map=texture;material.color.set('#ffffff');return material;
}

/** Call once before buildWorld's material batches and vegetation flush. No DOM is required. */
export function buildSchool(ctx:SchoolContext) {
  const {add,block,pipe,obstacles,white,steel,dark,glass,grass}=ctx;
  const ground=SCHOOL.ground,startObstacle=obstacles.length;
  const mat=(name:string,color:string,roughness=.85,metalness=0)=>new THREE.MeshStandardMaterial({name,color,roughness,metalness});
  const stone=mat('SchoolLimestone','#c6c5b8');
  const chalk=mat('SchoolChalkRender','#e5e6de');
  const teal=mat('SchoolTealMetal','#456461',.5,.22);
  const timber=mat('SchoolTimber','#a38b6a');
  const paving=mat('SchoolCourtPaving','#bec6bb',.98);
  const court=mat('SchoolActivityRubber','#77998b',.97);
  const amber=mat('SchoolPlayOchre','#d3b879',.94);
  const frame=mat('SchoolWindowFrame','#80918a',.4,.5);
  const indoor=mat('SchoolClassroom','#8c9994');
  const signs=signage();
  const cylinder=new THREE.CylinderGeometry(1,1,1,10),leaf=new THREE.IcosahedronGeometry(1,1);
  let pieces=0;
  function b(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,turn=0){block(m,x,ground+y,z,w,h,d,turn);pieces++;}
  function collider(x:number,z:number,w:number,d:number,height:number){obstacles.push({x,z,rx:w/2,rz:d/2,shape:'box',height});}
  function tube(points:[number,number,number][],r:number,m:THREE.Material,segments=8){pipe(points.map(([x,y,z])=>new THREE.Vector3(x,ground+y,z)),r,m,segments);pieces++;}
  function shape(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,ry=0){add(g,m,x,ground+y,z,sx,sy,sz,ry);pieces++;}
  function plate(x:number,y:number,z:number,w:number,d:number,h:number,r:number,m:THREE.Material){
    const path=new THREE.Shape(),left=-w/2,right=w/2,back=-d/2,front=d/2;
    path.moveTo(left+r,back);path.lineTo(right-r,back);path.quadraticCurveTo(right,back,right,back+r);path.lineTo(right,front-r);path.quadraticCurveTo(right,front,right-r,front);path.lineTo(left+r,front);path.quadraticCurveTo(left,front,left,front-r);path.lineTo(left,back+r);path.quadraticCurveTo(left,back,left+r,back);
    const g=new THREE.ExtrudeGeometry(path,{depth:h,bevelEnabled:false,curveSegments:4});g.rotateX(-Math.PI/2);shape(g,m,x,y,z);g.dispose();
  }
  function label(tile:number,x:number,y:number,z:number,w:number,h:number,ry=0){const g=new THREE.PlaneGeometry(w,h),uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setY(i,(2-tile+uv.getY(i))/3);shape(g,signs,x,y,z,1,1,1,ry);g.dispose();}
  function rail(x0:number,x1:number,y:number,z:number){
    b(steel,(x0+x1)/2,y+.99,z,x1-x0,.06,.06);b(steel,(x0+x1)/2,y+.14,z,x1-x0,.04,.04);
    for(let x=x0;x<=x1+.01;x+=1.25)b(frame,x,y+.56,z,.035,.91,.035);
    for(let x=x0+.13;x<x1;x+=.26)b(frame,x,y+.56,z,.022,.81,.025);
  }
  function planter(x:number,z:number,w:number,d:number){
    plate(x,.035,z,w,d,.42,.12,stone);b(grass,x,.468,z,w-.19,.05,d-.19);collider(x,z,w,d,.67);
    for(let x0=x-w/2+.38;x0<x+w/2-.18;x0+=.65){
      if(ctx.shrub)ctx.shrub(x0,z,.60,ground+.47);
      else shape(leaf,grass,x0,.68,z,.45,.26,.32,x0*.7);
    }
  }
  // The court overlays the existing pavement by 6mm; movement.groundHeight stays valid.
  b(paving,0,.004,-81.7,43.8,.009,12.0);
  for(let x=-21.5;x<22;x+=1.5)b(stone,x,.012,-78.55,.013,.006,5.75);
  for(const z of[-80.1,-78.6,-77.1])b(stone,0,.013,z,42.5,.006,.014);
  // Three real horizontal floor plates, recessed classroom windows and outdoor galleries.
  collider(-1,-84.7,38.8,5.6,11.9);
  b(indoor,-1,5.45,-84.8,38.4,10.85,5.1);
  b(chalk,-1,5.6,-87.34,38.8,11.2,.24);
  for(const x of[-20.25,18.25])b(chalk,x,5.6,-84.7,.30,11.2,5.6);
  for(let floor=0;floor<3;floor++){
    const y=floor*3.6;
    plate(-1,floor===0?-.19:y,-83.91,40.0,7.46,.20,.68,white);
    // Each band has glass recessed 0.15m behind aluminum mullions and masonry reveals.
    for(let bay=0;bay<6;bay++){
      const x=-17.15+bay*6.45;
      b(chalk,x,y+1.75,-81.97,6.38,3.30,.20);
      b(glass,x,y+1.82,-81.838,5.64,2.22,.028);
      for(const dz of[-.045,.025]){
        for(const dx of[-2.85,2.85])b(frame,x+dx,y+1.83,-81.80+dz,.073,2.30,.085);
        for(const yy of[.67,2.99])b(frame,x,y+yy,-81.80+dz,5.76,.073,.085);
      }
      for(const dx of[-1.42,0,1.42])b(frame,x+dx,y+1.83,-81.752,.054,2.24,.075);
      b(frame,x,y+2.62,-81.745,5.7,.042,.072);
      b(white,x,y+.52,-81.66,5.95,.12,.38);
      // Clerestory shade blades give eye-level facade depth without transparent full walls.
      for(const yy of[3.00,3.12,3.24])b(white,x,y+yy,-81.49,5.94,.065,.67);
      // Side return dividers and floor-level signage identify individual classrooms.
      b(white,x-3.14,y+1.75,-81.55,.18,3.3,.95);
      b(teal,x+2.74,y+1.25,-81.66,.25,.34,.07);
    }
    if(floor>0){rail(-20.0,18.0,y+.2,-80.31);b(teal,17.92,y+.82,-80.29,.9,.97,.04);}
    // Narrow roof-level rib rhythm and continuous troughs along the sheltered corridor.
    b(dark,-1,y+3.43,-81.00,38.0,.04,.045);
    if(ctx.light)b(ctx.light,-1,y+3.42,-81.04,36.6,.024,.024);
  }
  // Structural columns remain individual colliders so the ground-floor gallery is walkable.
  for(const x of[-20, -13.55,-7.1,-.65,5.8,12.25,18]){
    b(white,x,5.52,-80.56,.22,11.04,.30);collider(x,-80.56,.24,.32,11.2);
    b(stone,x,.12,-80.56,.34,.24,.42);
  }
  plate(-1,10.8,-83.92,40.1,7.52,.29,.74,white);
  plate(-1,11.1,-84.5,38.7,5.9,.07,.47,stone);
  for(const z of[-87.40,-81.57])b(white,-1,11.43,z,38.5,.63,.14);
  for(const x of[-20.15,18.15])b(white,x,11.43,-84.5,.14,.63,5.9);
  // Recessed rooftop plant rooms with louvers, ducts and compact solar panels.
  b(stone,-15.4,11.47,-85.34,5.0,.64,2.8);
  for(let j=0;j<14;j++)b(dark,-17.6+j*.34,11.84,-85.34,.12,.025,2.37);
  for(const x of[-6.2,-1.3,3.6,8.5]){b(frame,x,11.37,-84.7,4.0,.12,2.25);b(teal,x,11.45,-84.7,3.9,.035,2.16);for(let j=0;j<8;j++)b(steel,x-1.72+j*.49,11.48,-84.7,.017,.012,2.16);}
  // Glazed, visibly closed entrance doors; school court and gallery remain fully explorable.
  b(teal,11.85,1.5,-81.665,3.30,2.82,.08);b(glass,11.85,1.48,-81.596,3.04,2.62,.028);
  for(const x of[10.25,11.85,13.45])b(frame,x,1.49,-81.56,.067,2.86,.10);
  for(const x of[11.67,12.03])b(steel,x,1.30,-81.48,.035,.58,.055);
  b(white,11.9,3.50,-80.92,5.15,.16,1.97);b(teal,11.9,2.96,-79.94,5.0,.86,.10);
  label(0,11.9,2.95,-79.882,4.76,.79);
  b(teal,18.432,8.16,-84.65,.11,1.52,4.83);label(0,18.495,8.16,-84.65,4.65,1.10,Math.PI/2);
  label(2,-12.8,1.55,-81.66,5.30,.89);
  // A high school-name plaque stays legible beyond the existing low gallery pavilion.
  b(teal,-7.8,11.54,-80.28,11.25,1.15,.18);label(0,-7.8,11.54,-80.176,10.8,1.80);
  // Perimeter open-bar fencing with a genuinely unobstructed 4m-wide eastern gate.
  function fenceX(a:number,bx:number,z:number){
    b(stone,(a+bx)/2,.11,z,bx-a,.22,.16);b(teal,(a+bx)/2,1.42,z,bx-a,.05,.065);
    for(let x=a;x<=bx+.01;x+=.29)b(teal,x,.85,z,.03,1.13,.035);
    for(let x=a;x<=bx+.01;x+=2.1)b(teal,x,.88,z,.075,1.57,.075);
    collider((a+bx)/2,z,bx-a,.19,1.65);
  }
  function fenceZ(x:number,a:number,bz:number){
    b(stone,x,.11,(a+bz)/2,.16,.22,bz-a);b(teal,x,1.42,(a+bz)/2,.065,.05,bz-a);
    for(let z=a;z<=bz+.01;z+=.29)b(teal,x,.85,z,.035,1.13,.03);
    for(let z=a;z<=bz+.01;z+=2.1)b(teal,x,.88,z,.075,1.57,.075);
    collider(x,(a+bz)/2,.19,bz-a,1.65);
  }
  fenceX(-22,22,-75.70);fenceZ(-21.9,-87.6,-75.7);fenceZ(21.9,-87.6,-80.4);fenceZ(21.9,-76.0,-75.7);
  fenceX(-21.9,-20.6,-87.6);fenceX(18.6,21.9,-87.6);
  for(const z of[-80.4,-76.0]){b(white,21.9,1.45,z,.35,2.90,.35);collider(21.9,z,.37,.37,3);}
  b(white,21.9,3.0,-78.2,.50,.20,4.65);b(teal,22.16,2.72,-78.2,.05,.43,3.65);
  label(0,22.194,2.70,-78.2,3.38,.57,Math.PI/2);
  // Gate leaves are retracted along the perimeter, with their hinges visible.
  for(const z of[-81.25,-85.3])b(steel,21.97,.94,z,.13,1.5,1.75);
  // A compact activity yard is honestly scaled; it is not a squeezed regulation basketball court.
  plate(-10,.015,-78.20,12.6,3.54,.012,.22,court);
  const flatLine=(x:number,z:number,w:number,d:number,m:THREE.Material=chalk)=>b(m,x,.038,z,w,.009,d);
  flatLine(-10,-79.91,12.3,.04);flatLine(-10,-76.49,12.3,.04);flatLine(-16.14,-78.2,.04,3.46);flatLine(-3.86,-78.2,.04,3.46);
  // Two hopping grids and short balance trails, all flat and traversable.
  for(let n=0;n<8;n++){
    const x=-15.30+n*1.36,z=-78.2+(n%3===1?.48:0);
    flatLine(x,z,.91,.77,n%2?amber:stone);
    for(const side of[-1,1]){flatLine(x+side*.445,z,.035,.79);flatLine(x,z+side*.375,.93,.035);}
    const g=new THREE.TorusGeometry(.13,.02,4,12);g.rotateX(-Math.PI/2);shape(g,chalk,x,.048,z);g.dispose();
  }
  for(let i=0;i<12;i++)shape(cylinder,i%2?teal:amber,-2.3+i*.65,.021,-78.2+Math.sin(i*.6)*.65,.17,.012,.17);
  // Timber seat edges, planted pocket and cycle parking leave a 1.9m circulation ribbon.
  for(const x of[-18.9,7.5]){
    b(stone,x,.19,-76.72,3.1,.36,.42);for(let j=0;j<3;j++)b(timber,x,.415,-76.9+j*.13,3.13,.075,.10);
    collider(x,-76.72,3.18,.51,.5);
  }
  planter(1.3,-76.61,4.0,.84);planter(20.25,-85.50,1.05,2.5);
  // Two sculptural small trees, separate from the existing palm rows.
  for(const[x,z]of [[-19.4,-78.45],[5.6,-76.67]]){
    shape(cylinder,timber,x,1.37,z,.045,2.74,.045);collider(x,z,.17,.17,3.5);
    for(let j=0;j<7;j++){const a=j*2.4;shape(leaf,grass,x+Math.cos(a)*.38,2.66+Math.sin(j*1.3)*.3,z+Math.sin(a)*.35,.6,.51,.54,a);}
  }
  // U-loop bicycle racks and two parked bikes along the building's eastern return.
  for(let i=0;i<4;i++){
    const x=19.8,z=-82.4-i*.78;
    tube([[x-.35,.05,z],[x-.35,.68,z],[x,.82,z],[x+.35,.68,z],[x+.35,.05,z]],.025,steel,8);
  }
  collider(19.8,-83.6,1.08,3.32,1.12);
  // Enhance the existing shelter with a road-facing stop flag; do not duplicate its roof/bench.
  // It sits clear of the existing palm at (34,-72) and lamp at (35,-72).
  b(steel,35.05,1.77,-75.0,.070,3.54,.070);collider(35.05,-75.0,.12,.12,3.7);
  b(teal,35.05,3.14,-75.0,.15,.82,1.72);label(0,35.134,3.14,-75.0,1.60,.73,Math.PI/2);
  b(white,35.05,2.14,-75.0,.10,.94,.72);label(1,35.106,2.15,-75.0,.68,.90,Math.PI/2);
  // Flush tactile waiting pads add no step or obstruction to the original sidewalk.
  for(let i=0;i<6;i++)for(let j=0;j<5;j++)shape(cylinder,amber,35.75+i*.095,.015,-72.4+j*.12,.016,.020,.016);
  cylinder.dispose();leaf.dispose();
  return {metadata:SCHOOL,obstacles:obstacles.slice(startObstacle),pieces,materials:[stone,chalk,teal,timber,paving,court,amber,frame,indoor,signs]};
}
