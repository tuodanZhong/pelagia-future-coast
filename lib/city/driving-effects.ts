import * as THREE from 'three';
import {groundHeight} from './movement.ts';
/** Bounded tyre trails: two small instances per travelled segment, with no growing geometry. */
export class DrivingEffects {
  private mesh:THREE.InstancedMesh;
  private cursor=0;
  private previous:THREE.Vector3[]=[];
  private transform=new THREE.Object3D();
  constructor(scene:THREE.Scene){
    const geometry=new THREE.PlaneGeometry(.17,1);geometry.rotateX(-Math.PI/2);
    const material=new THREE.MeshStandardMaterial({color:'#161c1d',roughness:1,transparent:true,opacity:.30,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    this.mesh=new THREE.InstancedMesh(geometry,material,480);this.mesh.name='TyreSkidTrails';this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    const hidden=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<480;i++)this.mesh.setMatrixAt(i,hidden);scene.add(this.mesh);
  }
  update(position:THREE.Vector3|undefined,yaw=0,speed=0,lateralSpeed=0,drift=0){
    if(!position||Math.abs(speed)<3.5||Math.abs(lateralSpeed)<.7||drift<.15){this.previous=[];return;}
    const s=Math.sin(yaw),c=Math.cos(yaw);
    const points=[-1,1].map(side=>new THREE.Vector3(position.x+side*.88*c-1.6*s,0,position.z-side*.88*s-1.6*c));
    let changed=false;
    points.forEach((p,index)=>{
      const old=this.previous[index];if(!old){this.previous[index]=p;return;}
      const distance=p.distanceTo(old);if(distance<.22)return;
      if(distance<2.5){
        this.transform.position.copy(old).add(p).multiplyScalar(.5);this.transform.position.y=groundHeight(p.x,p.z)+.017;
        this.transform.rotation.set(0,Math.atan2(p.x-old.x,p.z-old.z),0);this.transform.scale.set(1,1,distance+.04);this.transform.updateMatrix();
        this.mesh.setMatrixAt(this.cursor++%480,this.transform.matrix);changed=true;
      }
      this.previous[index]=p;
    });
    if(changed)this.mesh.instanceMatrix.needsUpdate=true;
  }
}
