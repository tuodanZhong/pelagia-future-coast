import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createVegetation(root: THREE.Group) {
  let seed = 41731;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bark = new THREE.MeshStandardMaterial({color:'#756650',roughness:.97});
  const foliage = new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.86,side:THREE.DoubleSide});
  const palmLeaf = new THREE.MeshStandardMaterial({color:'#516937',roughness:.78,side:THREE.DoubleSide});
  const stemGeo = new THREE.CylinderGeometry(.62,1,1,7), stems: THREE.Matrix4[] = [], leaves: THREE.Matrix4[] = [], fronds: THREE.Matrix4[] = [], leafColors: THREE.Color[] = [];
  const d = new THREE.Object3D(), up = new THREE.Vector3(0,1,0);
  function stem(a: THREE.Vector3,b: THREE.Vector3,r:number) {
    d.position.copy(a).add(b).multiplyScalar(.5);d.quaternion.setFromUnitVectors(up,b.clone().sub(a).normalize());d.scale.set(r,a.distanceTo(b),r);d.updateMatrix();stems.push(d.matrix.clone());
  }
  // Individual curved leaves, not opaque blobs: three-dimensional crown silhouettes.
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0, -.45,.08,.48, 0,.18,.62, .45,.08,.48, 0,0,1.15],3));
  leafGeo.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);leafGeo.computeVertexNormals();
  function addLeaf(p:THREE.Vector3,size:number) {
    d.position.copy(p);d.rotation.set(random()*Math.PI,random()*6.28,random()*6.28);d.scale.set(size,size,size);d.updateMatrix();leaves.push(d.matrix.clone());
    const c=new THREE.Color().setHSL(.22+random()*.07,.32+random()*.25,.20+random()*.17);leafColors.push(c);
  }
  const frondParts:THREE.BufferGeometry[]=[];
  const curve=new THREE.CatmullRomCurve3(Array.from({length:13},(_,i)=>{const t=i/12;return new THREE.Vector3(t*4.2,Math.sin(t*Math.PI)*.55-t*t*1.3,0)}));
  frondParts.push(new THREE.TubeGeometry(curve,16,.022,4,false));
  for(let i=1;i<=20;i++) {
    const t=i/22,p=curve.getPoint(t),len=Math.sin(t*Math.PI)*.82+.06;
    for(const side of [-1,1]) {
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute([p.x-.08,p.y,0,p.x+.08,p.y+.015,0,p.x+.26,p.y-.15,len*side,p.x+.40,p.y-.33,len*side*.84],3));
      g.setIndex([0,1,2,1,3,2]);g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));frondParts.push(g);
    }
  }
  const frondGeo=mergeGeometries(frondParts)!;frondParts.forEach(g=>g.dispose());
  function palm(x:number,z:number,height=7,baseY=.2) {
    const leanX=(random()-.5)*.7,leanZ=(random()-.5)*.7;
    for(let i=0;i<6;i++) {
      const t=i/6,t2=(i+1)/6;
      stem(new THREE.Vector3(x+leanX*t*t,baseY+height*t,z+leanZ*t*t),new THREE.Vector3(x+leanX*t2*t2,baseY+height*t2,z+leanZ*t2*t2),.16*(1-.28*t));
    }
    for(let k=0;k<11;k++) {
      d.position.set(x+leanX,baseY+height,z+leanZ);d.rotation.set((random()-.5)*.2,k*6.28/11+random()*.3,(k%3)*.22-.12);d.scale.setScalar(.72+height*.035+random()*.15);d.updateMatrix();fronds.push(d.matrix.clone());
    }
  }
  function tree(x:number,z:number,s=1,baseY=.2) {
    const center=new THREE.Vector3(x,baseY+3.4*s,z);
    stem(new THREE.Vector3(x,baseY,z),center,.20*s);
    for(let branch=0;branch<8;branch++) {
      const a=branch*2.399,rad=(1.2+random()*.8)*s;
      const b=new THREE.Vector3(x+Math.cos(a)*rad,baseY+(3.8+random()*1.4)*s,z+Math.sin(a)*rad);
      stem(center.clone().add(new THREE.Vector3(0,-s*.7,0)),b,.075*s);
      for(let twig=0;twig<3;twig++) {
        const tip=b.clone().add(new THREE.Vector3((random()-.5)*s,random()*.7*s,(random()-.5)*s));stem(b,tip,.025*s);
        for(let j=0;j<30;j++) {
          const u=random()*6.28,v=Math.acos(2*random()-1),r=Math.cbrt(random())*1.0*s;
          addLeaf(tip.clone().add(new THREE.Vector3(Math.cos(u)*Math.sin(v)*r,Math.cos(v)*r*.8,Math.sin(u)*Math.sin(v)*r)),(.20+random()*.17)*s);
        }
      }
    }
  }
  function shrub(x:number,z:number,s=1,y=.5) {
    for(let i=0;i<120;i++){const a=random()*6.28,r=Math.sqrt(random())*.6*s;addLeaf(new THREE.Vector3(x+Math.cos(a)*r,y+random()*.65*s,z+Math.sin(a)*r),.17+random()*.13);}
  }
  function flush() {
    for(const [geo,mat,matrices,colours] of [[stemGeo,bark,stems,null],[leafGeo,foliage,leaves,leafColors],[frondGeo,palmLeaf,fronds,null]] as const) {
      const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);
      matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);if(colours)mesh.setColorAt(i,colours[i]);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);
    }
  }
  return {palm,tree,shrub,flush};
}
