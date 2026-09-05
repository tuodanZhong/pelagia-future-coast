import * as THREE from 'three';
import { WantedController, planPoliceRoute, drivePoliceInput, type OffenseKind, type PoliceRoute } from './police-logic.ts';
import type { Traffic, Vehicle } from './traffic';

function markings(){
  if(typeof document==='undefined')return new THREE.MeshStandardMaterial({color:'#233b50',roughness:.5});
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#233b50';ctx.fillRect(0,0,512,256);ctx.fillStyle='#eff0e8';ctx.font='bold 71px Arial';ctx.textAlign='center';ctx.fillText('POLICE',256,107);ctx.font='600 54px "PingFang SC",sans-serif';ctx.fillText('警  察',256,184);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:texture,roughness:.5,metalness:.1});
}
export class PoliceDispatch{
  readonly wanted=new WantedController();
  private units:{car:Vehicle;root:THREE.Group;red:THREE.MeshStandardMaterial;blue:THREE.MeshStandardMaterial;route?:PoliceRoute;nextPlan:number;last:{x:number;z:number};stuck:number;backUntil:number;launchAfter:number;departed:boolean}[]=[];
  private traffic:Traffic;
  constructor(scene:THREE.Scene,traffic:Traffic){
    this.traffic=traffic;
    const decal=markings(),dark=new THREE.MeshStandardMaterial({color:'#243a4d',roughness:.45,metalness:.22}),metal=new THREE.MeshStandardMaterial({color:'#a0acae',roughness:.3,metalness:.7});
    for(const car of traffic.cars.filter(c=>c.police)){
      const root=new THREE.Group();root.name='警车标识与警灯';root.matrixAutoUpdate=false;scene.add(root);
      const red=new THREE.MeshStandardMaterial({color:'#a73032',emissive:'#ff2525',roughness:.24}),blue=new THREE.MeshStandardMaterial({color:'#244c92',emissive:'#2f70ff',roughness:.24});
      const block=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
      block(dark,0,1.96,.0,1.55,.06,.40);block(metal,0,1.99,0,1.45,.035,.33);block(red,.43,2.08,0,.60,.16,.30);block(blue,-.43,2.08,0,.60,.16,.30);
      for(const side of [-1,1]){const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.62,.54),decal);sign.position.set(side*1.067,.98,-.13);sign.rotation.y=side*Math.PI/2;root.add(sign);}
      block(dark,0,.71,2.45,1.65,.07,.13);for(const x of [-.63,.63])block(metal,x,.82,2.45,.06,.42,.06);
      const hood=new THREE.Mesh(new THREE.PlaneGeometry(1.22,.55),decal);hood.rotation.x=-Math.PI/2;hood.position.set(0,1.175,1.55);root.add(hood);
      const mast=block(dark,-.79,2.19,-1.5,.023,.53,.023);mast.rotation.z=.08;
      this.units.push({car,root,red,blue,nextPlan:0,last:{x:car.position.x,z:car.position.z},stuck:0,backUntil:0,launchAfter:0,departed:false});
    }
  }
  offense(kind:OffenseKind,time:number,key?:string){const inactive=this.wanted.state.level===0,accepted=this.wanted.offense(kind,time,key);if(accepted&&inactive)this.units.forEach((u,i)=>{u.launchAfter=time+i*2.5;u.nextPlan=0;});return accepted;}
  get positions(){return this.units.map(u=>({id:u.car.id,x:u.car.position.x,z:u.car.position.z,yaw:u.car.yaw}));}
  update(dt:number,time:number,player:{x:number;z:number;speed:number;vehicle:boolean}){
    const poses=this.units.filter(u=>u.car!==this.traffic.controlled).map(({car})=>({id:car.id,x:car.position.x,z:car.position.z,yaw:car.yaw,speed:car.speed}));
    const state=this.wanted.update(dt,time,player,poses);
    for(const u of this.units){
      const {car}=u,pose={id:car.id,x:car.position.x,z:car.position.z,yaw:car.yaw,speed:car.speed};
      const chasing=state.level>0&&car!==this.traffic.controlled&&time>=u.launchAfter;
      if(chasing&&dt>0){
        const homeX=car.id.endsWith('0')?-89:-85.8,departing=!u.departed&&car.position.z < -54&&Math.abs(car.position.x-homeX)<4;
        if(!departing)u.departed=true;
        if(!u.route||time>=u.nextPlan||(!departing&&u.route.goal.z===-52.5)){
          const env=this.traffic.environment(car);env.obstacles=env.obstacles.filter(o=>!this.traffic.externalObstacles.has(o));
          u.route=planPoliceRoute(pose,departing?{x:homeX,z:-52.5}:state.lastKnown,env);u.nextPlan=time+2.5+(car.id.endsWith('1')?.3:0);
        }
        const input=drivePoliceInput(pose,u.route,{maxSpeed:8+state.level*2,stopDistance:departing?.3:player.vehicle?5.9:2.9});
        const before={x:car.position.x,z:car.position.z},goalDistance=Math.hypot(car.position.x-u.route.goal.x,car.position.z-u.route.goal.z);
        
        if(u.stuck>2.8){u.backUntil=time+1.1;u.stuck=0;u.nextPlan=time+1.2;}
        this.traffic.drivePolice(car,dt,time<u.backUntil?{throttle:-.65,steer:.65,brake:0}:input);
        const moved=Math.hypot(car.position.x-before.x,car.position.z-before.z);u.stuck=moved<dt*.12&&goalDistance>8?u.stuck+dt:0;
      }else if(car!==this.traffic.controlled&&dt>0)this.traffic.drivePolice(car,dt,{throttle:0,steer:0,brake:1});
      u.last={x:car.position.x,z:car.position.z};u.root.matrix.copy(car.matrix);u.root.matrixWorldNeedsUpdate=true;
      const flash=Math.floor(time*7)%2===0;u.red.emissiveIntensity=chasing&&flash?3:.04;u.blue.emissiveIntensity=chasing&&!flash?3:.04;
    }
    return state;
  }
}
