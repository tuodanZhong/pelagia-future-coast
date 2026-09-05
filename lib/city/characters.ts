import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { groundHeight, isWalkable, type Obstacle } from './movement';
import { CITIZENS, PERSON_MODELS, type CitizenSpec, type PersonModel } from './population';
import type { JumpFrame } from './jump';

type Actor={root:THREE.Group;mixer:THREE.AnimationMixer;actions:Record<string,THREE.AnimationAction>;action:string;yaw:number};
type Citizen=Actor&{spec:CitizenSpec;model:PersonModel;distance:number;direction:number;turnPause:number};
export class Characters {
  player?:Actor;
  citizens:Citizen[]=[];
  private disposed=false;
  private lastNpcUpdate=0;
  private jumpClip?:THREE.AnimationClip;
  constructor(private scene:THREE.Scene,manager:THREE.LoadingManager,private obstacles:Obstacle[],onError:()=>void) {
    new THREE.FileLoader(manager).setResponseType('json').load('/assets/jump-clip.json',data=>{
      if(this.disposed)return;
      this.jumpClip=THREE.AnimationClip.parse(data as unknown as THREE.AnimationClipJSON);
      if(this.player)this.player.actions.jump=this.player.mixer.clipAction(this.jumpClip);
    },undefined,onError);
    PERSON_MODELS.forEach(modelSpec=>new GLTFLoader(manager).load('/assets/'+modelSpec.file,gltf=>{
      if(this.disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
      gltf.scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(gltf.scene),scale=modelSpec.height/(bounds.max.y-bounds.min.y);
      const build=(index:number,wardrobe?:string):Actor=>{
        const model=clone(gltf.scene) as THREE.Group;model.scale.multiplyScalar(scale);model.position.y=-bounds.min.y*scale;
        const root=new THREE.Group();root.name=index<0?'Player':`${modelSpec.id} ${index}`;root.add(model);this.scene.add(root);
        model.traverse(o=>{
          if(!(o instanceof THREE.Mesh))return;
          o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
          const mats=Array.isArray(o.material)?o.material:[o.material];
          const cloned=mats.map(original=>{
            const m=original.clone() as THREE.MeshStandardMaterial;m.metalness=0;m.roughness=.88;
            if(wardrobe&&/body/i.test(m.name))m.color.multiply(new THREE.Color(wardrobe));
            if(m.transparent){m.alphaTest=.06;m.depthWrite=false;m.side=THREE.DoubleSide;}
            return m;
          });o.material=Array.isArray(o.material)?cloned:cloned[0];
        });
        const mixer=new THREE.AnimationMixer(model),actions:Record<string,THREE.AnimationAction>={};
        for(const clip of gltf.animations)actions[clip.name.toLowerCase()]=mixer.clipAction(clip);
        if(index<0&&this.jumpClip)actions.jump=mixer.clipAction(this.jumpClip);
        const actor={root,mixer,actions,action:'',yaw:0};this.setAction(actor,'idle');mixer.update(.3+(Math.max(0,index)*.19)%2);return actor;
      };
      if(modelSpec.id==='player')this.player=build(-1);
      CITIZENS.forEach((spec,index)=>{
        if(spec.model!==modelSpec.id)return;
        const actor=build(index,spec.wardrobe);
        actor.root.position.set(spec.x,groundHeight(spec.x,spec.z),spec.z);
        actor.yaw=spec.yaw??(index%2?0:Math.PI);actor.root.rotation.y=actor.yaw;
        this.citizens.push({...actor,spec,model:modelSpec,distance:spec.offset??0,direction:1,turnPause:0});
      });
    },undefined,onError));
  }
  private setAction(actor:Actor,name:string) {
    if(actor.action===name)return;
    const next=actor.actions[name]??actor.actions.idle;if(!next)return;
    const old=actor.actions[actor.action],fade=name==='jump'?.075:.18;
    next.reset().fadeIn(fade).play();old?.fadeOut(fade);actor.action=name;
  }
  updatePlayer(position:THREE.Vector3,yaw:number,speed:number,visible:boolean,dt:number,jump:JumpFrame) {
    const actor=this.player;if(!actor)return;
    actor.root.position.copy(position);actor.root.visible=visible;
    const diff=THREE.MathUtils.euclideanModulo(yaw-actor.yaw+Math.PI,Math.PI*2)-Math.PI;
    actor.yaw+=diff*(1-Math.exp(-dt*12));actor.root.rotation.y=actor.yaw;
    this.setAction(actor,jump.phase!=='grounded'?'jump':speed>3?'run':speed>.05?'walk':'idle');
    if(actor.actions.jump&&jump.phase!=='grounded') {
      // Physics owns world height; a phase-synchronised bone clip owns crouch, arms and knees.
      actor.actions.jump.paused=true;actor.actions.jump.time=Math.min(jump.time,actor.actions.jump.getClip().duration-.0001);
    }
    if(actor.actions.walk)actor.actions.walk.timeScale=Math.max(.7,Math.min(1.5,speed/1.4));
    if(actor.actions.run)actor.actions.run.timeScale=Math.max(.8,Math.min(1.5,speed/3.1));
    actor.mixer.update(dt);
  }
  update(time:number,player:THREE.Vector3,aerial:boolean) {
    if(time-this.lastNpcUpdate<1/30)return;
    const step=Math.min(time-this.lastNpcUpdate,.08);this.lastNpcUpdate=time;
    this.citizens.forEach(actor=>{
      const {spec,model}=actor;
      const near=Math.hypot(actor.root.position.x-player.x,actor.root.position.z-player.z)<78;
      actor.root.visible=aerial||near;if(!near||aerial)return;
      actor.turnPause=Math.max(0,actor.turnPause-step);
      const moving=spec.pace>0&&actor.turnPause===0;
      if(moving) {
        const dz=actor.direction*step*spec.pace;
        if(Math.abs(actor.distance+dz)>spec.route||!isWalkable(spec.x,spec.z+actor.distance+dz,this.obstacles,.30)) {actor.direction*=-1;actor.turnPause=.45;}
        else actor.distance+=dz;
        actor.root.position.set(spec.x,groundHeight(spec.x,spec.z+actor.distance),spec.z+actor.distance);
        const yaw=actor.direction>0?0:Math.PI;
        const diff=THREE.MathUtils.euclideanModulo(yaw-actor.yaw+Math.PI,Math.PI*2)-Math.PI;
        actor.yaw+=diff*(1-Math.exp(-step*5));actor.root.rotation.y=actor.yaw;
      }
      this.setAction(actor,moving?'walk':'idle');
      if(actor.actions.walk)actor.actions.walk.timeScale=spec.pace/model.gaitSpeed;
      actor.mixer.update(step);
    });
  }
  dispose(){this.disposed=true;this.player?.mixer.stopAllAction();this.citizens.forEach(a=>a.mixer.stopAllAction());}
}
