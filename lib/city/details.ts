import * as THREE from 'three';
import type { Obstacle } from './movement';
export type DetailKit = {
  root: THREE.Group; obstacles: Obstacle[];
  add:(g:THREE.BufferGeometry,m:THREE.Material,x?:number,y?:number,z?:number,sx?:number,sy?:number,sz?:number,ry?:number)=>void;
  block:(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,rot?:number)=>void;
  disk:(m:THREE.Material,x:number,y:number,z:number,r:number,h:number,ratio?:number)=>void;
  pipe:(p:THREE.Vector3[],r:number,m:THREE.Material,n?:number)=>void;
  palm:(x:number,z:number,h?:number,y?:number)=>void;tree:(x:number,z:number,s?:number,y?:number)=>void;shrub:(x:number,z:number,s?:number,y?:number)=>void;
  white:THREE.Material;steel:THREE.Material;dark:THREE.Material;glass:THREE.Material;grass:THREE.Material;light:THREE.Material;
};
export function enrichCity(k: DetailKit) {
  const {root,obstacles,add,block,disk,pipe,palm,tree,shrub,white,steel,dark,glass,grass,light}=k;
  const wood=new THREE.MeshStandardMaterial({color:'#88694c',roughness:.86});
  const stone=new THREE.MeshStandardMaterial({color:'#bcb8a9',roughness:.85});
  const cream=new THREE.MeshStandardMaterial({color:'#d9d4bb',roughness:.8});
  const rubber=new THREE.MeshStandardMaterial({color:'#252d2e',roughness:.94});
  const red=new THREE.MeshStandardMaterial({color:'#a14d39',roughness:.75});
  const glow=new THREE.MeshStandardMaterial({color:'#edc893',emissive:'#dda365',emissiveIntensity:.5});
  const cone=new THREE.ConeGeometry(1,1,12), sphere=new THREE.SphereGeometry(1,8,6), cyl=new THREE.CylinderGeometry(1,1,1,12), torus=new THREE.TorusGeometry(1,.09,5,24);
  function solidCircle(x:number,z:number,r:number){obstacles.push({x,z,rx:r,rz:r});}
  function label(text:string,x:number,y:number,z:number,w:number,angle=0,color='#e2e8e0') {
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#203640';ctx.fillRect(0,0,1024,192);ctx.font='500 72px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,512,99);
    const tx=new THREE.CanvasTexture(canvas);tx.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w*192/1024),new THREE.MeshStandardMaterial({map:tx,roughness:.6,emissive:'#8eabac',emissiveIntensity:.2}));m.position.set(x,y,z);m.rotation.y=angle;root.add(m);
  }
  function bench(x:number,z:number,angle=0) {
    const pt=(dx:number,dz:number)=>[x+Math.cos(angle)*dx+Math.sin(angle)*dz,z-Math.sin(angle)*dx+Math.cos(angle)*dz];
    for(let i=0;i<5;i++){const [px,pz]=pt(0,(i-2)*.14);block(wood,px,.58,pz,2.4,.085,.11,angle);}
    for(let i=0;i<3;i++){const [px,pz]=pt(0,-.35);block(wood,px,.82+i*.13,pz,2.4,.09,.07,angle);}
    for(const s of [-1,1]){const [px,pz]=pt(s*.87,0);block(dark,px,.3,pz,.09,.55,.6,angle);}
    obstacles.push({x,z,rx:angle===0?1.25:.45,rz:angle===0?.45:1.25,shape:'box'});
  }
  const skinMaterial=new THREE.MeshStandardMaterial({color:'#bb9477',roughness:.9});
  const hairMaterial=new THREE.MeshStandardMaterial({color:'#393833',roughness:.97});
  const headGeometry=new THREE.SphereGeometry(1,10,8);
  const hairGeometry=new THREE.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI*.55);
  function person(x:number,z:number,rotation:number,variant:number,s=1) {
    const v=Math.abs(variant)%3,outfit=[dark,cream,red][v];
    const p=(dx:number,y:number,dz:number)=>new THREE.Vector3(x+(Math.cos(rotation)*dx+Math.sin(rotation)*dz)*s,y*s,z+(-Math.sin(rotation)*dx+Math.cos(rotation)*dz)*s);
    function ellipsoid(g:THREE.BufferGeometry,m:THREE.Material,dx:number,y:number,dz:number,sx:number,sy:number,sz:number){const q=p(dx,y,dz);add(g,m,q.x,q.y,q.z,sx*s,sy*s,sz*s,rotation);}
    ellipsoid(headGeometry,skinMaterial,0,1.62,0,.10,.135,.105);
    ellipsoid(hairGeometry,hairMaterial,0,1.645,-.008,.105,.124,.107);
    ellipsoid(sphere,skinMaterial,0,1.60,.103,.024,.032,.024);
    for(const side of [-1,1])ellipsoid(sphere,hairMaterial,side*.037,1.645,.094,.010,.009,.009);
    ellipsoid(cyl,skinMaterial,0,1.46,0,.055,.12,.055);
    ellipsoid(sphere,outfit,0,1.25,0,.18,.27,.105);
    ellipsoid(sphere,outfit,0,1.05,0,.14,.13,.105);
    for(const side of [-1,1]) {
      const stride=(v===1?0.05:.14)*side;
      const hip=p(side*.075,1.0,0),knee=p(side*.09,.59,stride),foot=p(side*.095,.14,-stride);
      pipe([hip,knee,foot],.058*s,dark,4);
      ellipsoid(sphere,rubber,side*.095,.085,-stride+.045,.065,.065,.14);
      const shoulder=p(side*.15,1.41,0),elbow=p(side*.22,1.15,-stride),hand=p(side*.19,.95,stride);
      pipe([shoulder,elbow,hand],.044*s,outfit,4);
      ellipsoid(sphere,skinMaterial,side*.19,.92,stride,.040,.065,.035);
    }
    if(v===2){ellipsoid(sphere,wood,.24,.92,0,.10,.14,.07);pipe([p(.17,1.04,0),p(.26,1.17,0),p(.30,1.01,0)],.012,wood,5);}
  }
  function cafe(x:number,z:number) {
    for(let j=0;j<3;j++) {
      const cx=x+(j-1)*5.5;
      disk(wood,cx,.79,z,1,.10);add(cyl,steel,cx,.39,z,.06,.75,.06);
      add(cyl,steel,cx,1.7,z,.047,3.2,.047);add(cone,cream,cx,3.18,z,2.6,.5,2.6);
      for(let c=0;c<3;c++){const a=c*2.1;const px=cx+Math.cos(a)*1.5,pz=z+Math.sin(a)*1.5;disk(wood,px,.48,pz,.33,.075);add(cyl,steel,px,.24,pz,.035,.45,.035);}
      solidCircle(cx,z,2.1);
    }
  }
  // Finely divided curb stones, tactile corner strips, and drainage channels.
  for(const x of [-36.5,36.5,-60.5,60.5]) for(let z=-125;z<=125;z+=2) {
    if(Math.abs(Math.abs(z)-48)<13)continue;
    block(stone,x,.11,z,.28,.20,1.94);
    for(let t=0;t<3;t++)block(dark,x+Math.sign(x)*.30,.073,z+t*.1,.14,.02,.04);
  }
  for(const z of [-60.5,60.5,-119.5,119.5])for(let x=-127;x<=127;x+=2){if(Math.abs(Math.abs(x)-48)<13)continue;block(stone,x,.11,z,1.94,.2,.28);}
  for(const x of [-48,48])for(const z of [-48,48,132,-132]) {
    disk(dark,x+6,.081,z+4,.55,.018);
    for(let i=-4;i<5;i++)block(steel,x+6+i*.08,.095,z+4,.025,.01,.7);
    for(const side of [-1,1]) {
      const px=x+side*13,pz=z+side*12;
      add(cyl,dark,px,2.7,pz,.09,5.4,.09);block(dark,px,4.8,pz,.47,1.15,.32);
      for(let i=0;i<3;i++)add(sphere,i===0?red:i===2?grass:cream,px,5.13-i*.32,pz+.18,.13,.13,.04);
      block(stone,px,.08,pz+1,1.8,.04,1.2);
      for(let j=0;j<9;j++)for(let n=0;n<5;n++)disk(cream,px-.7+j*.17,.11,pz+.55+n*.18,.038,.025);
    }
  }
  // Covered bus shelters with timber seats, route signage, and rear glass.
  for(const x of [-32,32]) {
    const z=x<0?23:-70;
    block(white,x,3.1,z,4.2,.16,8);block(steel,x,3.22,z,4,.10,7.8);
    for(const dz of [-3.4,3.4])block(dark,x+1.6,1.6,z+dz,.10,3,.10);
    block(glass,x+1.65,1.65,z,.05,2.6,6.8);
    bench(x,z,Math.PI/2);label('BLUE BAY  /  01',x,2.78,z+4.02,3.6);
    obstacles.push({x:x+1.65,z,rx:.2,rz:3.8,shape:'box'});
    person(x-.8,z+2,0,1);person(x-.7,z-2,.4,0,.95);
  }
  // Architectural pavilions create a denser street wall beneath the towers.
  for(const [x,z,w,d] of [[0,-67,28,13],[-97,21,34,10],[98,21,33,10],[-99,-67,34,9],[117,-118,18,9]] as number[][]) {
    block(dark,x,2.3,z,w,4.5,d);block(glass,x,2.25,z+d/2+.03,w-.5,3.6,.09);
    block(white,x,.32,z,w+1,.5,d+1);block(white,x,4.5,z,w+2,.42,d+2);
    block(grass,x,4.75,z,w,.12,d);
    for(let a=-w/2+1;a<w/2;a+=2.8){block(steel,x+a,2.2,z+d/2+.12,.11,4,.18);block(glow,x+a,3.9,z+d/2-.3,1.2,.055,.12);}
    for(let a=-w/2+2;a<w/2;a+=5)shrub(x+a,z,1.2,4.8);
    obstacles.push({x,z,rx:w/2+1,rz:d/2+1,shape:'box'});
    label(x===0?'PELAGIA GALLERY':'TIDELINE  /  CAFE',x,4.14,z+d/2+.3,Math.min(w-3,14));
  }
  cafe(-97,32);cafe(96,32);
  // Layered planting occupies the generous tower forecourts while keeping paths open.
  for(const x of [-99,99])for(const z of [-119,117]) {
    block(white,x,.28,z,25,.4,10);block(grass,x,.51,z,24.4,.07,9.4);
    obstacles.push({x,z,rx:12.5,rz:5,shape:'box'});
    for(let j=0;j<4;j++)tree(x-8+j*5.3,z+(j%2?1.4:-1.4),1.05+(j%3)*.12,.55);
    for(let j=0;j<10;j++){shrub(x-10+j*2.2,z-3.2,.85,.56);shrub(x-10+j*2.2,z+3.2,.85,.56);}
  }
  for(const x of [-73,73]) {
    block(white,x,.27,-15,9,.4,24);block(grass,x,.5,-15,8.4,.05,23.4);
    obstacles.push({x,z:-15,rx:4.5,rz:12,shape:'box'});
    for(let j=0;j<3;j++)tree(x,-23+j*8,1.15,.55);
    for(let j=0;j<9;j++)shrub(x+(j%2?2.5:-2.5),-25+j*2.5,1,.5);
  }
  // Plaza seating, bollards, small planters, and recognisable pedestrian scale.
  for(const x of [-31,31])for(const z of [72,92,112]) {
    bench(x,z,Math.PI/2);disk(dark,x,.12,z+2.4,.32,.20);disk(steel,x,.57,z+2.4,.27,.75);solidCircle(x,z+2.4,.35);
  }
  for(let i=0;i<26;i++){const x=i%2?32:-32,z=-115+i*9;person(x+(i%3)*.55,z,(i%5)*.4,i,.9+(i%4)*.06);}
  for(const [x,z] of [[19,107],[21,97],[-18,113],[22,55],[-20,62],[-28,-71],[27,-93],[130,89],[-130,-32]])person(x,z,1,Math.round(x),1);
  for(const x of [-128,128])for(let z=-116;z<130;z+=18){shrub(x,z,1.5,.25);shrub(x,z+1.4,1.3,.25);}
  // Waterfront boardwalk: slats, bollards, mooring rings, stepped seawall.
  for(const side of [-1,1]) {
    for(let x=-129;x<=129;x+=.65)block(wood,x,.10,side*143,.60,.14,3.2);
    for(let x=-138;x<=138;x+=8){add(cyl,dark,x,.47,side*146,.14,.9,.14);add(sphere,steel,x,.95,side*146,.18,.10,.18);}
    block(stone,0,-.6,side*149,299,1.15,1.2);block(dark,0,-1.8,side*149.3,299,.28,.1);
    for(let t=-146;t<147;t+=3){block(dark,t,-.8,side*149.62,.025,1.2,.02);block(dark,side*149.62,-.8,t,.02,1.2,.025);}
  }
  for(let x=-118;x<=118;x+=24){bench(x,143);person(x+4,144,-1.5,Math.round(x+120));}
  // A side marina is visible from the public promenade; visitors remain on the island.
  block(wood,162,-.4,65,22,.6,56);block(white,151,-.2,65,3,.3,60);
  for(let z=40;z<=92;z+=6){add(cyl,dark,169,-1,z,.2,2,.2);block(white,161,-.02,z,19,.07,.055);}
  for(const z of [48,72,90]) {
    const hull=new THREE.Shape();hull.moveTo(-2,-6);hull.quadraticCurveTo(-3,0,0,7);hull.quadraticCurveTo(3,0,2,-6);hull.closePath();
    const g=new THREE.ExtrudeGeometry(hull,{depth:1.1,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.22,bevelThickness:.2});g.rotateX(Math.PI/2);add(g,white,178,-.6,z,1,1,1);g.dispose();
    block(wood,178,-.35,z,3.5,.2,7);block(glass,178,.5,z-1,2.7,1.5,3.2);block(white,178,1.35,z-1,3,.16,3.5);
    pipe([new THREE.Vector3(170,-.1,z+3),new THREE.Vector3(174,-.5,z+2),new THREE.Vector3(177,-.2,z+3)],.035,cream,8);
  }
  // Bicycles and racks.
  for(let i=0;i<6;i++) {
    const x=-124+i*1.2,z=121;
    const a=torus.clone();a.rotateY(Math.PI/2);add(a,rubber,x,.45,z-.7,.42,.42,.42);add(a,rubber,x,.45,z+.7,.42,.42,.42);a.dispose();
    pipe([new THREE.Vector3(x,.45,z-.7),new THREE.Vector3(x,1,z-.3),new THREE.Vector3(x,.45,z+.7),new THREE.Vector3(x,.5,z-.05),new THREE.Vector3(x,.45,z-.7)],.035,steel,8);
    block(dark,x,1.05,z-.3,.3,.09,.22);block(steel,x,1.2,z+.5,.55,.04,.05);
  }
  cone.dispose();sphere.dispose();cyl.dispose();torus.dispose();headGeometry.dispose();hairGeometry.dispose();
}
