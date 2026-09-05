import * as THREE from 'three';

export type PoliceContext={
  root:THREE.Group;
  obstacles:{x:number;z:number;rx:number;rz:number;shape?:'ellipse'|'box';height?:number;yaw?:number}[];
  add:(g:THREE.BufferGeometry,m:THREE.Material,x?:number,y?:number,z?:number,sx?:number,sy?:number,sz?:number,ry?:number)=>void;
  block:(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry?:number)=>void;
  pipe:(points:THREE.Vector3[],r:number,m:THREE.Material,n?:number)=>void;
  shrub?:(x:number,z:number,s?:number,y?:number)=>void;
  white:THREE.Material;steel:THREE.Material;dark:THREE.Material;glass:THREE.Material;grass:THREE.Material;light?:THREE.Material;
};
export const POLICE_STATION={
  id:'pelagia-police',name:'海境警察局',subtitle:'PELAGIA POLICE',
  center:{x:-103,z:-65.7},ground:.125,overallHeight:9.57,
  building:{minX:-113,maxX:-93,minZ:-68.3,maxZ:-63.1,height:8.35},
  site:{minX:-114.1,maxX:-83.9,minZ:-70,maxZ:-60.95},
  replacement:{module:'details.ts',pavilion:{x:-99,z:-67,width:34,depth:9},obstacle:{x:-99,z:-67,rx:18,rz:5.5}},
  spawn:{x:-101.2,z:-61.32},cameraYaw:0,
  parking:[{x:-89,z:-65.4,yaw:0},{x:-85.8,z:-65.4,yaw:0}],
  dispatch:[{x:-87,z:-52.2,yaw:Math.PI/2},{x:-92,z:-52.2,yaw:Math.PI/2}],
  access:[{x:-101.2,z:-60.95},{x:-101.2,z:-61.32},{x:-101.2,z:-62.15}],
  driveway:[{x:-87.4,z:-65.4},{x:-87.4,z:-61},{x:-87.4,z:-54}],
} as const;

function signage(){
  const m=new THREE.MeshStandardMaterial({name:'PoliceSignage',color:'#d9e1e4',roughness:.69,metalness:.05});
  if(typeof document==='undefined')return m;
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;const ctx=canvas.getContext('2d');if(!ctx)return m;
  const rows=[['警  察','POLICE','海境社区 · PELAGIA DISTRICT'],['海 境 警 察 局','PELAGIA POLICE','COMMUNITY SAFETY · SERVICE'],['接待与服务','RECEPTION & ASSISTANCE','入口  /  ENTRANCE'],['警务车辆','POLICE VEHICLES','请保持通道畅通 · KEEP CLEAR']];
  rows.forEach(([a,b,c],i)=>{const y=i*256;ctx.fillStyle=i===2?'#d7dfe0':'#263f51';ctx.fillRect(0,y,1536,256);ctx.fillStyle=i===2?'#263f51':'#e8efed';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${i===0?105:84}px "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif`;ctx.fillText(a,768,y+75,1460);ctx.font='600 47px Arial, sans-serif';ctx.fillText(b,768,y+160,1450);ctx.font='400 30px "PingFang SC", Arial, sans-serif';ctx.fillText(c,768,y+222,1450);});
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m.map=t;m.color.set('#ffffff');return m;
}

/** Call during world construction before material batches flush. Remove the specified old pavilion first. */
export function buildPoliceStation(k:PoliceContext){
  const {white,steel,dark,glass,grass,add,block,pipe,obstacles}=k,start=obstacles.length,base=POLICE_STATION.ground;
  const make=(name:string,color:string,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({name,color,roughness,metalness});
  const stone=make('PoliceLimestone','#c2c5bd'),navy=make('PoliceBlueMetal','#2d4657',.43,.35),warm=make('PoliceInterior','#92978e'),paving=make('PoliceForecourt','#bfc7c5',.93),wood=make('PoliceTimber','#8d7a64'),signs=signage();
  const clear=new THREE.MeshStandardMaterial({name:'PoliceReceptionGlass',color:'#8faeaf',roughness:.16,metalness:.10,transparent:true,opacity:.33,depthWrite:false,side:THREE.DoubleSide});
  const blue=make('PoliceBlueLens','#396a99',.27,.19);blue.emissive.set('#477bc4');blue.emissiveIntensity=.28;
  const red=make('PoliceRedLens','#a84640',.33,.1);red.emissive.set('#9b3932');red.emissiveIntensity=.15;
  let pieces=0;const cylinder=new THREE.CylinderGeometry(1,1,1,12);
  function b(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,ry=0){block(m,x,base+y,z,w,h,d,ry);pieces++;}
  function shape(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,ry=0){add(g,m,x,base+y,z,sx,sy,sz,ry);pieces++;}
  function tube(points:[number,number,number][],r:number,m:THREE.Material,segments=8){pipe(points.map(([x,y,z])=>new THREE.Vector3(x,y+base,z)),r,m,segments);pieces++;}
  function obstacle(x:number,z:number,w:number,d:number,h:number){obstacles.push({x,z,rx:w/2,rz:d/2,height:h,shape:'box'});}
  function tile(index:number,x:number,y:number,z:number,w:number,h:number,ry=0){const g=new THREE.PlaneGeometry(w,h),uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setY(i,(3-index+uv.getY(i))/4);shape(g,signs,x,y,z,1,1,1,ry);g.dispose();}
  function slab(x:number,y:number,z:number,w:number,d:number,h:number,r:number,m:THREE.Material){
    const s=new THREE.Shape();s.moveTo(-w/2+r,-d/2);s.lineTo(w/2-r,-d/2);s.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);s.lineTo(w/2,d/2-r);s.quadraticCurveTo(w/2,d/2,w/2-r,d/2);s.lineTo(-w/2+r,d/2);s.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);s.lineTo(-w/2,-d/2+r);s.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
    const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false,curveSegments:4});g.rotateX(-Math.PI/2);shape(g,m,x,y,z);g.dispose();
  }
  // Fresh pavement ends before the existing curb, preserving the road and approach lane.
  b(paving,-99,.004,-65.45,30.1,.008,9.0);
  for(let x=-113.4;x<=-93;x+=1.25)b(stone,x,.012,-61.98,.016,.008,1.83);
  for(const z of [-62.75,-61.5])b(stone,-103,.012,z,20.5,.008,.016);
  // Two storeys, full structural floor plates, and a shallow transparent public reception.
  obstacle(-103,-65.7,20,5.2,8.48);
  slab(-103,-.18,-65.7,20.4,5.58,.20,.46,stone);
  slab(-103,3.89,-65.7,20.45,5.68,.23,.49,white);
  slab(-103,7.86,-65.7,20.55,5.75,.28,.53,white);
  b(stone,-103,4.0,-68.15,20,8,.3);
  for(const x of [-112.86,-93.14])b(white,x,4,-65.7,.28,8,5.2);
  b(warm,-103,.04,-65.7,19.4,.08,4.8);
  // Reception rear wall and upper-floor office interiors sit behind the glazing.
  b(warm,-103,1.83,-66.95,19.35,3.60,.17);
  b(warm,-103,5.86,-65.98,19.38,3.49,3.52);
  for(const x of [-109.4,-104.8,-100.2,-95.6]){
    for(const y of [1.98,5.94]){
      b(y<3?clear:glass,x,y,-63.07,4.31,2.78,.035);
      for(const dx of [-2.22,0,2.22])b(navy,x+dx,y,-63.016,.060,2.88,.09);
      for(const yy of [-1.43,1.43])b(navy,x,y+yy,-63.016,4.47,.064,.09);
      b(steel,x,y+.64,-62.964,4.41,.032,.028);
    }
    // Paired stone reveals and thin horizontal sun shades add facade depth.
    b(white,x-2.31,4.12,-63.03,.16,7.54,.23);
    for(const y of [3.47,7.42])for(let n=0;n<3;n++)b(white,x,y+n*.115,-62.86,4.48,.060,.56);
  }
  b(navy,-103,.43,-63.058,19.67,.51,.15);b(navy,-103,4.30,-63.00,19.98,.36,.13);
  for(const x of [-113.03,-92.97]){
    for(const y of [2.0,5.93])b(glass,x,y,-65.43,.05,2.71,3.50);
    for(const z of [-67.19,-65.42,-63.65])b(navy,x,4.05,z,.092,7.12,.06);
  }
  // Visible reception desk, visitor seats, wall display and quiet overhead light strips.
  b(navy,-101.1,.54,-65.91,5.95,1.08,.61);b(stone,-101.1,1.11,-65.90,6.08,.09,.75);
  for(const x of [-103.1,-100.4]){b(dark,x,1.38,-65.92,.42,.32,.06);b(steel,x,1.19,-65.93,.045,.14,.045);}
  for(const x of [-110.25,-108.45]){
    b(wood,x,.49,-65.29,1.37,.13,.57);b(wood,x,.86,-65.57,1.37,.69,.10);
    for(const dx of [-.53,.53])b(steel,x+dx,.24,-65.29,.043,.48,.50);
  }
  b(navy,-108.8,2.20,-66.84,3.37,1.06,.042);tile(1,-108.8,2.20,-66.812,3.13,.78);
  for(const x of [-109,-102,-96])if(k.light)b(k.light,x,3.73,-64.95,2.23,.025,.12);
  // Recessed glazed double entrance, durable metal handles, tactile approach and supported canopy.
  b(navy,-101.2,3.045,-62.989,2.57,.065,.10);b(clear,-101.2,1.48,-62.916,2.39,2.90,.026);
  for(const x of [-102.43,-101.2,-99.97])b(steel,x,1.5,-62.875,.063,3,.066);
  for(const x of [-101.35,-101.05])b(steel,x,1.35,-62.80,.026,.56,.047);
  slab(-101.2,3.47,-62.59,7.1,1.40,.20,.27,white);
  for(const x of [-104.5,-97.9]){
    b(steel,x,1.69,-62.08,.105,3.38,.105);obstacle(x,-62.08,.17,.17,3.7);
    b(stone,x,.095,-62.08,.26,.19,.26);
  }
  b(navy,-101.2,3.10,-61.876,6.87,.70,.075);tile(2,-101.2,3.10,-61.828,6.51,.60);
  // Primary roof-level police identity stays readable behind passing vehicles and pedestrians.
  b(navy,-105.65,8.25,-63.06,12.2,1.10,.16);tile(1,-105.65,8.25,-62.969,11.64,.91);
  b(navy,-92.843,6.05,-65.6,.10,1.90,3.78);tile(0,-92.784,6.05,-65.6,3.54,1.50,Math.PI/2);
  // Original shield emblem, made from metal geometry rather than a copied official crest.
  const shield=new THREE.Shape();shield.moveTo(-.43,.46);shield.lineTo(.43,.46);shield.lineTo(.41,-.09);shield.quadraticCurveTo(.33,-.44,0,-.63);shield.quadraticCurveTo(-.33,-.44,-.41,-.09);shield.closePath();
  const shieldGeo=new THREE.ExtrudeGeometry(shield,{depth:.045,bevelEnabled:true,bevelSize:.012,bevelThickness:.01,bevelSegments:1});shape(shieldGeo,steel,-96,3.01,-63.0);shieldGeo.dispose();
  for(let i=0;i<3;i++)tube([[-96.27,2.98+i*.115,-62.933],[-96.09,3.055+i*.115,-62.933],[-95.92,2.958+i*.115,-62.933],[-95.74,3.03+i*.115,-62.933]],.019,navy,10);
  // Rooftop HVAC, louver fins and antenna are placed below the nearby tower canopy envelope.
  slab(-106.9,8.13,-66.03,6.0,2.84,.83,.16,stone);
  for(let i=0;i<16;i++)b(dark,-109.55+i*.35,8.986,-66.0,.12,.024,2.33);
  for(const x of [-102.1,-99.4]){b(steel,x,8.30,-66.22,1.84,.31,1.61);shape(cylinder,dark,x,8.49,-66.22,.54,.05,.54);}
  b(navy,-95.2,8.38,-66.87,.07,.92,.07);b(steel,-95.2,9.14,-66.87,.028,.61,.028);
  // Compact emergency beacon above the entrance; no point lights or neon spill.
  b(dark,-101.2,3.72,-62.34,.72,.08,.25);b(blue,-101.4,3.807,-62.34,.29,.12,.22);b(red,-101.0,3.807,-62.34,.29,.12,.22);
  // Two fictional civic flags on metal poles. They remain static lightweight cloth meshes.
  for(const [x,height] of [[-112.9,7.1],[-110.75,6.55]]){
    shape(cylinder,steel,x,height/2,-61.72,.034,height,.034);obstacle(x,-61.72,.14,.14,height+.2);
    slab(x,.012,-61.72,.52,.52,.15,.06,stone);
    const g=new THREE.PlaneGeometry(1.47,.91,8,3),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){const u=p.getX(i)+.735;p.setZ(i,Math.sin(u*5)*.065*(u/1.47));}
    g.computeVertexNormals();shape(g,navy,x+.78,height-.73,-61.72);g.dispose();
    // Twin inset bars distinguish the fictional municipal flag from a national flag.
    b(steel,x+.73,height-.55,-61.63,.88,.030,.017);b(steel,x+.85,height-.76,-61.63,.96,.030,.017);
  }
  // Bollards are spaced around the visitor approach, never across its central opening.
  for(const x of [-108.1,-106.2,-96.1,-94.2]){
    shape(cylinder,dark,x,.45,-61.30,.080,.90,.080);shape(cylinder,steel,x,.71,-61.30,.084,.085,.084);obstacle(x,-61.30,.18,.18,1);
  }
  for(let i=0;i<8;i++)for(let j=0;j<4;j++)shape(cylinder,stone,-101.6+i*.115,.023,-61.78+j*.135,.015,.019,.015);
  // Planting and a compact visitor bench sit outside the straight entry route.
  slab(-111.95,.025,-62.39,1.91,.77,.38,.13,stone);b(grass,-111.95,.433,-62.39,1.70,.035,.57);obstacle(-111.95,-62.39,1.95,.81,.55);
  if(k.shrub)for(const x of [-112.5,-111.95,-111.4])k.shrub(x,-62.39,.5,base+.45);
  for(let i=0;i<4;i++)b(wood,-107.6,.475,-62.65+i*.12,2.8,.075,.09);
  for(const x of [-108.6,-106.6])b(steel,x,.24,-62.48,.055,.47,.52);obstacle(-107.6,-62.48,2.9,.58,.62);
  // East-side police parking is outside the main building and the existing planter at x=-78.
  b(navy,-87.5,.012,-65.45,6.62,.014,7.55);
  for(const x of [-90.6,-87.4,-84.2])b(white,x,.024,-65.25,.08,.014,6.65);
  b(white,-87.4,.024,-68.56,6.45,.014,.08);
  for(const x of [-89,-85.8]){
    b(stone,x,.09,-68.25,1.50,.16,.16);obstacle(x,-68.25,1.55,.18,.2);
    const g=new THREE.PlaneGeometry(1.15,.73);g.rotateX(-Math.PI/2);shape(g,white,x,.023,-65.45);g.dispose();
    // A metal EV charging post at the rear is clear of the vehicle's 4.9m footprint.
    b(navy,x,.65,-69.31,.28,1.30,.23);b(dark,x,.99,-69.17,.17,.24,.028);obstacle(x,-69.31,.34,.3,1.5);
    tube([[x+.12,.92,-69.29],[x+.31,.63,-69.21],[x+.25,.44,-69.19],[x+.12,.65,-69.27]],.014,dark,12);
  }
  b(steel,-91.52,1.30,-68.87,.055,2.60,.055);obstacle(-91.52,-68.87,.10,.10,2.7);
  b(navy,-91.52,2.20,-68.84,1.04,.77,.06);tile(3,-91.52,2.20,-68.799,.94,.63);
  cylinder.dispose();
  return {metadata:POLICE_STATION,obstacles:obstacles.slice(start),pieces,materials:[stone,navy,warm,paving,wood,signs,clear,blue,red]};
}
