import * as THREE from 'three';
import type { DetailKit } from './details';

type Tower = { x:number; z:number; h:number; r:number; rot:number; name:string };
// Rounded floor plates with vertical facades; every occupied floor is truly horizontal.
export function buildArchitecture(k: DetailKit, towers: Tower[]) {
  const {add,block,disk,pipe,white,steel,dark,glass,grass,palm,shrub,obstacles}=k;
  const limestone = new THREE.MeshStandardMaterial({color:'#c6c1b2',roughness:.88});
  const spandrel = new THREE.MeshStandardMaterial({color:'#525e61',roughness:.42,metalness:.22});
  const bronze = new THREE.MeshStandardMaterial({color:'#6d6b61',roughness:.38,metalness:.65});
  const concrete = new THREE.MeshStandardMaterial({color:'#b2b0a8',roughness:.95});
  const lobbyGlass = new THREE.MeshPhysicalMaterial({color:'#aec0bf',roughness:.11,metalness:0,transparent:true,opacity:.32,depthWrite:false});
  const interior = new THREE.MeshStandardMaterial({color:'#777269',roughness:.9});
  const light = new THREE.MeshStandardMaterial({color:'#f0d7af',emissive:'#e3c18e',emissiveIntensity:.35});
  function outline(w:number,d:number,r:number) {
    const p: THREE.Vector2[]=[];
    for(const [cx,cz,a] of [[w-r,d-r,0],[-w+r,d-r,Math.PI/2],[-w+r,-d+r,Math.PI],[w-r,-d+r,Math.PI*1.5]])
      for(let i=0;i<=5;i++){const t=a+i*Math.PI/10;p.push(new THREE.Vector2(cx+Math.cos(t)*r,cz+Math.sin(t)*r));}
    return p;
  }
  function plate(x:number,y:number,z:number,w:number,d:number,r:number,h:number,m:THREE.Material) {
    const shape=new THREE.Shape(outline(w,d,r));
    const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:1});g.rotateX(-Math.PI/2);add(g,m,x,y,z);g.dispose();
  }
  function rail(x:number,y:number,z:number,w:number,d:number,r:number) {
    const pts=outline(w,d,r).map(p=>new THREE.Vector3(x+p.x,y,z+p.y));pts.push(pts[0].clone());pipe(pts,.035,bronze,64);
  }
  towers.forEach((t,index)=>{
    const {x,z,r,h}=t, podiumW=r+10,podiumD=(r+10)*.76;
    obstacles.push({x,z,rx:podiumW+1,rz:podiumD+1,shape:'box',height:h+5});
    // Recessed retail glazing with visible interior partitions, columns and lobby furniture.
    plate(x,.12,z,podiumW+1,podiumD+1,4,.32,limestone);
    block(interior,x,2.15,z,podiumW*2-1,3.5,podiumD*2-2);
    for(const side of [-1,1]) {
      block(limestone,x,2.1,z+side*(podiumD-2),podiumW*2-2,3.3,.2);
      block(lobbyGlass,x,2.1,z+side*podiumD,podiumW*2-5,3.45,.045);
      for(let a=-podiumW+3;a<podiumW-2;a+=2.1) {
        block(bronze,x+a,2.1,z+side*(podiumD+.04),.06,3.45,.12);
        if(Math.round(a)%3===0)block(interior,x+a,.8,z+side*(podiumD-1),1.2,.7,.7);
      }
      for(const dx of [-podiumW+2,-6,6,podiumW-2])block(limestone,x+dx,2.1,z+side*(podiumD+.1),.4,3.6,.4);
      block(light,x,3.65,z+side*(podiumD-.6),podiumW*1.6,.05,.15);
    }
    for(let level=1;level<3;level++) {
      const yy=level*3.8,ww=podiumW-level*.8,dd=podiumD-level*.65;
      plate(x,yy,z,ww+1,dd+1,4,.3,white);
      plate(x,yy+.3,z,ww,dd,4,3.45,glass);
      for(const side of [-1,1])for(let a=-ww+4;a<ww-3;a+=2)block(steel,x+a,yy+1.9,z+side*dd,.07,3.25,.12);
    }
    plate(x,11.45,z,podiumW-.5,podiumD-.5,4,.35,white);
    plate(x,11.81,z,podiumW-1,podiumD-1,4,.08,grass);
    rail(x,12.85,z,podiumW-.75,podiumD-.75,4);
    for(const side of [-1,1])for(const a of [-.75,0,.75]) {
      const px=x+a*(podiumW-3),pz=z+side*(podiumD-2.7);
      plate(px,11.9,pz,1.7,.9,.3,.55,concrete);shrub(px,pz,.85,12.45);
      if(a===0)palm(px,pz,3.8,12.45);
    }
    // Actual entry recess and supported rain canopy.
    block(limestone,x,4.15,z+podiumD+1.5,8.5,.24,4.8);
    for(const dx of [-3.8,3.8])block(bronze,x+dx,2.05,z+podiumD+3.2,.12,4,.12);
    for(const dx of [-1.5,0,1.5])block(bronze,x+dx,1.9,z+podiumD+.15,.08,3.4,.08);
    for(const dx of [-.17,.17])block(bronze,x+dx,1.6,z+podiumD+.23,.027,.65,.06);

    const residential=[1,3,5,7].includes(index), landmark=index===0;
    const floorHeight=residential?3.15:3.6, floors=Math.floor((h-12)/floorHeight);
    const bw=r*(landmark?1.26:1.32),bd=r*(residential?.91:.93),corner=landmark?Math.min(bw,bd)*.72:2.5;
    for(let floor=0;floor<floors;floor++) {
      const yy=12+floor*floorHeight;
      const setback=floor>floors*.72?1.4:floor>floors*.42&&residential?.55:0;
      const ww=bw-setback,dd=bd-setback*.65;
      const balcony=residential&&floor%3!==0?1.45:.2;
      plate(x,yy,z,ww+balcony,dd+balcony,corner,.22,residential?white:spandrel);
      plate(x,yy+.24,z,ww,dd,corner,floorHeight-.3,glass);
      // Insulated spandrel panels separate glazing from structural slab edges.
      plate(x,yy+floorHeight-.72,z,ww+.035,dd+.035,corner,.42,spandrel);
      const perimeter=outline(ww+.055,dd+.055,corner);
      for(let j=0;j<perimeter.length;j++) {
        const a=perimeter[j],b=perimeter[(j+1)%perimeter.length],length=a.distanceTo(b),n=Math.max(1,Math.ceil(length/1.65));
        for(let i=0;i<n;i++) {
          const p=a.clone().lerp(b,i/n);block(steel,x+p.x,yy+floorHeight*.5,z+p.y,.065,floorHeight-.24,.085);
        }
      }
      if(residential&&balcony>1) {
        rail(x,yy+1.15,z,ww+balcony-.12,dd+balcony-.12,corner);
        for(const side of [-1,1])for(let a=-ww+3;a<ww-2;a+=4.2) {
          block(white,x+a,yy+.68,z+side*(dd+.7),.12,1.12,1.4);
          if(floor%4===1) { block(limestone,x+a+1.15,yy+.45,z+side*(dd+.9),1.05,.42,.45);block(grass,x+a+1.15,yy+.75,z+side*(dd+.9),.98,.25,.4); }
        }
      }
      // Structural fins establish depth without turning the building into a solid shell.
      if(!residential)for(const side of [-1,1])for(const a of [-.78,.78])block(white,x+a*ww,yy+floorHeight/2,z+side*(dd+.18),.38,floorHeight,.55);
    }
    const roof=12+floors*floorHeight,ww=bw-1.4,dd=bd-.91;
    plate(x,roof,z,ww+.4,dd+.4,corner,.4,white);plate(x,roof+.4,z,ww-.35,dd-.35,corner,.1,concrete);
    rail(x,roof+1.35,z,ww,dd,corner);
    block(limestone,x,roof+1.8,z,6,3.1,5);
    for(const s of [-1,1]){
      block(steel,x+s*6,roof+.95,z-1,3.5,1.1,3);
      for(let n=0;n<10;n++)block(dark,x+s*6,roof+1.51,z-2.3+n*.27,3.1,.03,.045);
      for(let n=0;n<2;n++){disk(dark,x+s*6+(.5-n),roof+1.55,z,0.46,.05);}
      block(bronze,x+s*8,roof+1.65,z+3,.045,2.5,.045);
    }
    // One expressive landmark, with horizontal occupied floors behind a buildable white fin.
    if(landmark)for(const side of [-1,1]) {
      const pts=[];for(let j=0;j<=32;j++){const f=j/32;pts.push(new THREE.Vector3(x+side*(bw+Math.sin(f*Math.PI)*1.1),12+f*(roof-10),z+(f-.5)*bd*1.5));}
      pipe(pts,.6,white,48);
    }
  });
}
