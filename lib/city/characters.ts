import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { isWalkable, type Obstacle } from './movement';

type Actor={root:THREE.Group;mixer:THREE.AnimationMixer;actions:Record<string,THREE.AnimationAction>;action:string;yaw:number};
type Citizen=Actor&{x:number;z:number;phase:number;distance:number;direction:number;moving:boolean};
export class Characters {
  player?:Actor;
  citizens:Citizen[]=[];
  private disposed=false;
  private lastNpcUpdate=0;

  constructor(private scene:THREE.Scene,manager:THREE.LoadingManager,private obstacles:Obstacle[],onError:()=>void) {
    ['/assets/pelagia-citizen.glb','/assets/pelagia-citizen-female.glb'].forEach((url,gender)=>new GLTFLoader(manager).load(url,gltf=>{
      if(this.disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
      // A single real human asset is instanced with independent skeletons and animation state.
      gltf.scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(gltf.scene),height=bounds.max.y-bounds.min.y;
      const build=(index:number):Actor=>{
        const model=clone(gltf.scene) as THREE.Group;model.scale.multiplyScalar((gender===0?1.78:1.68)/height);
        model.position.y=-bounds.min.y*(gender===0?1.78:1.68)/height;
        const root=new THREE.Group();root.name=index<0?'Player':'Citizen '+index;root.add(model);this.scene.add(root);
        model.traverse(o=>{
          if(!(o instanceof THREE.Mesh))return;
          o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
          const mats=Array.isArray(o.material)?o.material:[o.material];
          const cloned=mats.map(original=>{
            const m=original.clone() as THREE.MeshStandardMaterial;
            m.metalness=0;m.roughness=.88;
            // Preserve skin albedo and all photographic clothing detail.
            if(/body/i.test(m.name)&&index>=0)m.color.multiply(new THREE.Color(['#b3c2c7','#bba991','#99aaa4','#d3d0c5'][index%4]));
            if(m.transparent){m.alphaTest=.06;m.depthWrite=false;m.side=THREE.DoubleSide;}
            return m;
          });
          o.material=Array.isArray(o.material)?cloned:cloned[0];
        });
        const mixer=new THREE.AnimationMixer(model),actions:Record<string,THREE.AnimationAction>={};
        for(const clip of gltf.animations){const a=mixer.clipAction(clip);actions[clip.name.toLowerCase()]=a;}
        const actor={root,mixer,actions,action:'',yaw:0};this.setAction(actor,'idle');mixer.update(.3+(Math.max(0,index)*.19)%2);return actor;
      };
      if(gender===0)this.player=build(-1);
      const positions=[[20,112],[-21,113],[32,81],[-32,97],[32,26],[-32,43],[32,-18],[-32,-20],[32,-91],[-32,-100],[130,87],[-130,47],[80,143],[-80,143]];
      positions.forEach(([x,z],i)=>{
        if((i+1)%2!==gender||!isWalkable(x,z,obstacles,.28))return;
        const actor=build(i);actor.root.position.set(x,.14,z);actor.root.scale.setScalar(.96+(i%3)*.035);
        const citizen={...actor,x,z,phase:i*.83,distance:0,direction:i%2?1:-1,moving:i>1&&i<12};
        citizen.root.rotation.y=i%2?0:Math.PI;citizen.yaw=citizen.root.rotation.y;
        this.citizens.push(citizen);
      });
    },undefined,onError));
  }
  private setAction(actor:Actor,name:string) {
    if(actor.action===name)return;
    const next=actor.actions[name]??actor.actions.idle;if(!next)return;
    const old=actor.actions[actor.action];next.reset().fadeIn(.22).play();old?.fadeOut(.22);actor.action=name;
  }
  updatePlayer(position:THREE.Vector3,yaw:number,speed:number,visible:boolean,dt:number,airborne:boolean) {
    const actor=this.player;if(!actor)return;
    actor.root.position.set(position.x,position.y,position.z);actor.root.visible=visible;
    const diff=THREE.MathUtils.euclideanModulo(yaw-actor.yaw+Math.PI,Math.PI*2)-Math.PI;
    actor.yaw+=diff*(1-Math.exp(-dt*12));actor.root.rotation.y=actor.yaw;
    this.setAction(actor,airborne?'idle':speed>3?'run':speed>.05?'walk':'idle');
    if(actor.actions.walk)actor.actions.walk.timeScale=Math.max(.7,Math.min(1.5,speed/1.4));
    if(actor.actions.run)actor.actions.run.timeScale=Math.max(.8,Math.min(1.5,speed/4.5));
    actor.mixer.update(dt);
  }
  update(time:number,player:THREE.Vector3,aerial:boolean) {
    // Far-away animation skeletons sleep; nearby pedestrians update at 30 Hz.
    if(time-this.lastNpcUpdate<1/30)return;
    const step=Math.min(time-this.lastNpcUpdate,.08);this.lastNpcUpdate=time;
    this.citizens.forEach(actor=>{
      const near=Math.hypot(actor.root.position.x-player.x,actor.root.position.z-player.z)<65;
      actor.root.visible=aerial||near;
      if(!near||aerial)return;
      if(actor.moving) {
        const dz=actor.direction*step*1.1;
        if(Math.abs(actor.distance+dz)>7||!isWalkable(actor.x,actor.z+actor.distance+dz,this.obstacles,.33))actor.direction*=-1;
        else actor.distance+=dz;
        actor.root.position.z=actor.z+actor.distance;
        actor.root.rotation.y=actor.direction>0?0:Math.PI;
      }
      this.setAction(actor,actor.moving?'walk':'idle');actor.mixer.update(step);
    });
  }
  dispose(){this.disposed=true;this.player?.mixer.stopAllAction();this.citizens.forEach(a=>a.mixer.stopAllAction());}
}
