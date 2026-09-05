import * as THREE from 'three';
import { poseRider } from './cycling-driver';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { groundHeight, isWalkable, moveWithCollisions, type Obstacle } from './movement';
import { CITIZENS, PERSON_MODELS, type CitizenSpec, type PersonModel } from './population';
import type { JumpFrame, JumpKind } from './jump';
import type { SeatFrame, Seat } from './seating';
import { punchTarget, type AttackFrame } from './combat';
import { applyVehicleImpact, createImpactState, impactPositionFree, impactPoseTime, stepImpact, sweepVehicleImpact, type ImpactEnvironment, type ImpactState } from './impact';
import type { VehiclePose } from './traffic';

type Actor={root:THREE.Group;mixer:THREE.AnimationMixer;actions:Record<string,THREE.AnimationAction>;action:string;yaw:number};
type Citizen=Actor&{spec:CitizenSpec;model:PersonModel;distance:number;direction:number;turnPause:number;hitTime:number;fearUntil:number;disturbed:boolean;escapeYaw:number;impact?:ImpactState;seatReleased?:boolean;impactSeatObstacle?:Obstacle};
type GroundingModel={pivot:[number,number,number];samples:Record<string,{time:number;rootOffsetY:number}[]>};
export class Characters {
  player?:Actor;
  citizens:Citizen[]=[];
  private disposed=false;
  private lastNpcUpdate=0;
  private leftJump=false;
  private grounding:Record<string,GroundingModel>={};
  private jumpClips:Record<string,THREE.AnimationClip>={};
  constructor(private scene:THREE.Scene,manager:THREE.LoadingManager,private obstacles:Obstacle[],onError:()=>void,private seats:Seat[]=[]) {
    new THREE.FileLoader(manager).setResponseType('json').load('/assets/impact-grounding.json',data=>{if(!this.disposed)this.grounding=(data as unknown as {models:Record<string,GroundingModel>}).models;},undefined,onError);
    for(const [name,file] of [['cycling','cycling.json'],['cycling_rest','cycling-rest.json'],['feed_seagulls','feed-seagulls.json'],['captain','captain.json'],['jump_idle','jump-idle.json'],['jump_walk','jump-walk.json'],['jump_walk_left','jump-walk-left.json'],['jump_run','jump-run.json'],['sitDown','sit-down.json'],['seated','seated-idle.json'],['standUp','stand-up.json'],['driving_rover','driving-idle.json'],['driving_concept','driving-concept.json'],['punch','punch.json'],['impact_air','impact-air.json'],['impact_ground','impact-ground.json'],['impact_recover','impact-recover.json']])new THREE.FileLoader(manager).setResponseType('json').load('/assets/'+file,data=>{
      if(this.disposed)return;
      this.jumpClips[name]=THREE.AnimationClip.parse(data as unknown as THREE.AnimationClipJSON);
      if(this.player)this.player.actions[name]=this.player.mixer.clipAction(this.jumpClips[name]);
      if(name.startsWith('impact_'))for(const actor of this.citizens)actor.actions[name]=actor.mixer.clipAction(this.jumpClips[name]);
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
        for(const [name,clip] of Object.entries(this.jumpClips))if(index<0||name.startsWith('impact_'))actions[name]=mixer.clipAction(clip);
        const actor={root,mixer,actions,action:'',yaw:0};this.setAction(actor,'idle');mixer.update(.3+(Math.max(0,index)*.19)%2);return actor;
      };
      if(modelSpec.id==='player')this.player=build(-1);
      CITIZENS.forEach((spec,index)=>{
        if(spec.model!==modelSpec.id)return;
        const actor=build(index,spec.wardrobe);
        actor.root.position.set(spec.x,groundHeight(spec.x,spec.z),spec.z);
        actor.yaw=spec.yaw??(index%2?0:Math.PI);actor.root.rotation.y=actor.yaw;
        this.citizens.push({...actor,spec,model:modelSpec,distance:spec.offset??0,direction:1,turnPause:0,hitTime:-100,fearUntil:0,disturbed:false,escapeYaw:0});
      });
      if(modelSpec.seatedFile)new THREE.FileLoader(manager).setResponseType('json').load('/assets/'+modelSpec.seatedFile,data=>{
        if(this.disposed)return;
        const clip=THREE.AnimationClip.parse(data as unknown as THREE.AnimationClipJSON);
        this.citizens.filter(a=>a.model.id===modelSpec.id&&a.spec.seatId).forEach(actor=>{
          actor.actions.seated=actor.mixer.clipAction(clip);this.setAction(actor,'seated');actor.mixer.update(.1);
        });
      },undefined,onError);
    },undefined,onError));
  }
  private setAction(actor:Actor,name:string) {
    if(!actor.actions[name])name='idle';
    if(actor.action===name)return;
    const next=actor.actions[name]??actor.actions.idle;if(!next)return;
    const old=actor.actions[actor.action],fade=name.startsWith('jump')?.06:.18;
    if(name.startsWith('impact_')||actor.action.startsWith('impact_')||name.startsWith('cycling')||actor.action.startsWith('cycling')||name==='captain'||actor.action==='captain'){
      actor.mixer.stopAllAction();next.reset().setEffectiveWeight(1).play();
    }else if(name.startsWith('driving')||actor.action.startsWith('driving')||['sitDown','seated','standUp'].includes(name)||['sitDown','seated','standUp'].includes(actor.action)){
      old?.stop();next.reset().setEffectiveWeight(1).play();
    }else{
      next.reset();
      if(actor.action.startsWith('jump')&&(name==='walk'||name==='run'))next.time=next.getClip().duration*(name==='run'?.80:actor.action==='jump_walk_left'?.07:.57);
      next.fadeIn(fade).play();old?.fadeOut(fade);
    }
    actor.action=name;
  }
  prepareJump(kind:JumpKind){
    this.leftJump=false;if(kind!=='walk'||!this.player)return;
    const left=this.player.root.getObjectByName('Bip01_L_Foot'),right=this.player.root.getObjectByName('Bip01_R_Foot');
    if(left&&right){const l=left.getWorldPosition(new THREE.Vector3()),r=right.getWorldPosition(new THREE.Vector3());this.leftJump=l.y<r.y;}
  }
  updatePlayer(position:THREE.Vector3,yaw:number,speed:number,visible:boolean,dt:number,jump:JumpFrame,seat:SeatFrame,attack:AttackFrame={active:false,time:0,contact:false},feedTime?:number) {
    const actor=this.player;if(!actor)return;
    actor.root.position.copy(position);actor.root.visible=visible;
    const diff=THREE.MathUtils.euclideanModulo(yaw-actor.yaw+Math.PI,Math.PI*2)-Math.PI;
    actor.yaw+=diff*(1-Math.exp(-dt*12));actor.root.rotation.set(0,actor.yaw,0);actor.root.scale.setScalar(1);
    const jumpName='jump_'+jump.kind+(jump.kind==='walk'&&this.leftJump?'_left':''),seatPose=['sitDown','seated','standUp'].includes(seat.phase);
    this.setAction(actor,feedTime!==undefined?'feed_seagulls':attack.active?'punch':seatPose?seat.phase:jump.phase!=='grounded'?jumpName:speed>2.3?'run':speed>.05?'walk':'idle');
    if(feedTime!==undefined&&actor.actions.feed_seagulls){actor.actions.feed_seagulls.paused=true;actor.actions.feed_seagulls.time=Math.min(feedTime,.7999);}
    if(attack.active&&actor.actions.punch){actor.actions.punch.paused=true;actor.actions.punch.time=Math.min(attack.time,actor.actions.punch.getClip().duration-.0001);}
    if(seatPose&&seat.phase!=='seated'&&actor.actions[seat.phase]){
      const action=actor.actions[seat.phase];action.paused=true;action.time=Math.min(seat.time,action.getClip().duration-.0001);
    }
    if(actor.actions[jumpName]&&jump.phase!=='grounded') {
      // Physics owns world height; a phase-synchronised bone clip owns crouch, arms and knees.
      actor.actions[jumpName].paused=true;actor.actions[jumpName].time=Math.min(jump.time,actor.actions[jumpName].getClip().duration-.0001);
    }
    if(actor.actions.walk)actor.actions.walk.timeScale=Math.max(.7,Math.min(1.7,speed/1.34));
    if(actor.actions.run)actor.actions.run.timeScale=Math.max(.8,Math.min(1.75,speed/2.94));
    actor.mixer.update(dt);
  }
  driverEye(model:string){return model==='concept'?new THREE.Vector3(-.015785,.928885,.225431):new THREE.Vector3(.412368,1.534724,.290663);}
  updateDriver(matrix:THREE.Matrix4,yaw:number,model:string,visible:boolean,dt:number){
    const actor=this.player;if(!actor)return;
    const anchor=model==='concept'?new THREE.Vector3(.0007,.10,.40):new THREE.Vector3(.42244,.533,.24);
    actor.root.position.copy(anchor.applyMatrix4(matrix));actor.root.rotation.set(0,yaw,0);actor.yaw=yaw;actor.root.visible=visible;
    this.setAction(actor,'driving_'+model);actor.mixer.update(dt);
  }
  updateRider(matrix:THREE.Matrix4,yaw:number,crank:number,steer:number,speed:number,visible:boolean,dt:number){
    if(this.player)poseRider(this.player,matrix,yaw,crank,steer,speed,visible,dt);
  }
  updateCaptain(matrix:THREE.Matrix4,yaw:number,visible:boolean,dt:number){
    const actor=this.player;if(!actor)return;
    matrix.decompose(actor.root.position,actor.root.quaternion,actor.root.scale);actor.root.position.copy(new THREE.Vector3(0,1.4,-2.1).applyMatrix4(matrix));actor.yaw=yaw;actor.root.visible=visible;this.setAction(actor,'captain');actor.mixer.update(dt);
  }
  strike(origin:THREE.Vector3,yaw:number,time:number){
    const targets=this.citizens.filter(a=>!a.impact||['none','pushed'].includes(a.impact.phase)).map(actor=>({x:actor.root.position.x,z:actor.root.position.z,actor,seatObstacle:actor.seatReleased?undefined:this.seats.find(s=>s.id===actor.spec.seatId)?.obstacle}));
    const selected=punchTarget(origin,yaw,targets,this.obstacles);if(!selected)return false;
    const actor=selected.actor;actor.hitTime=time;actor.fearUntil=time+7;actor.escapeYaw=Math.atan2(actor.root.position.x-origin.x,actor.root.position.z-origin.z);actor.disturbed=true;
    for(const witness of this.citizens)if(witness!==actor&&(!witness.spec.seatId||witness.seatReleased)&&witness.root.position.distanceTo(actor.root.position)<4){witness.fearUntil=time+4;witness.escapeYaw=Math.atan2(witness.root.position.x-origin.x,witness.root.position.z-origin.z);witness.disturbed=true;}
    return true;
  }
  /** Resolve the whole swept traffic path before visibility/animation throttling. */
  updateVehicleImpacts(previous:VehiclePose[],current:VehiclePose[],dt:number,time:number,obstacles:Obstacle[],stopVehicle:(pose:VehiclePose)=>void){
    const hits=new Map<string,number>(),before=new Map(previous.map(p=>[p.id,p]));
    const environment=(actor:Citizen):ImpactEnvironment=>({obstacles,vehicles:current,ignoreObstacles:actor.impactSeatObstacle?[actor.impactSeatObstacle]:undefined});
    for(const actor of this.citizens){
      if(!actor.impact||actor.impact.phase==='none'){
        const cooldown=actor.impact?.cooldown??0;
        actor.impact={...createImpactState({x:actor.root.position.x,z:actor.root.position.z,radius:actor.model.height<1.4?.26:.34}),cooldown,yaw:actor.yaw};
      }
      if(actor.spec.seatId&&!actor.seatReleased)actor.impactSeatObstacle=this.seats.find(s=>s.id===actor.spec.seatId)?.obstacle;
    }
    for(let index=0;index<current.length;index++){
      const vehicle=current[index],old=before.get(vehicle.id);if(!old)continue;
      const contacts=[];let blocked=false;
      for(const actor of this.citizens){
        const state=actor.impact!;
        const contact=sweepVehicleImpact(old,vehicle,{...state,elevation:state.height,height:actor.model.height},dt);if(!contact)continue;
        const result=applyVehicleImpact(state,contact,vehicle,environment(actor));
        if(result.blocked){blocked=true;break;}
        contacts.push({actor,result});
      }
      // If nobody can move clear, roll back this car before committing any of its contacts.
      if(blocked){current[index]=old;stopVehicle(old);continue;}
      for(const {actor,result} of contacts){
        actor.impact=result.state;actor.disturbed=true;
        if(result.applied){
          hits.set(vehicle.id,(hits.get(vehicle.id)??0)+1);actor.fearUntil=time+7;actor.hitTime=-100;
          actor.escapeYaw=result.state.yaw+Math.PI;
          if(actor.spec.seatId&&!actor.seatReleased){
            const seat=this.seats.find(s=>s.id===actor.spec.seatId);if(seat)seat.occupied=false;
            actor.seatReleased=true;
          }
        }
      }
    }
    for(const actor of this.citizens){
      const old=actor.impact!,env=environment(actor);
      actor.impact=stepImpact(old,dt,env);
      if(old.phase!=='none'||actor.impact.phase!=='none')this.poseImpact(actor);
      if(actor.seatReleased&&actor.impactSeatObstacle&&impactPositionFree(actor.impact,{obstacles:[actor.impactSeatObstacle]},actor.impact.radius))actor.impactSeatObstacle=undefined;
    }
    return hits;
  }
  private poseImpact(actor:Citizen){
    const state=actor.impact!,{phase}=state;
    actor.yaw=state.yaw;
    if(phase==='none'||phase==='pushed'){
      actor.root.rotation.set(0,state.yaw,0);actor.root.position.set(state.x,groundHeight(state.x,state.z),state.z);
      this.setAction(actor,'idle');actor.mixer.update(0);
      if(phase==='pushed'){actor.escapeYaw=state.yaw+Math.PI;this.recoil(actor,state.time);}
      return;
    }
    const poseTime=impactPoseTime(state);
    const name=phase==='airborne'?'impact_air':phase==='down'?'impact_ground':'impact_recover';
    this.setAction(actor,name);
    const action=actor.actions[name];if(action){action.paused=true;action.time=Math.min(poseTime,action.getClip().duration-.00001);}
    actor.mixer.update(0);
    const model=this.grounding[actor.model.id],samples=model?.samples[phase];
    let offset=0;
    if(samples?.length){
      const index=samples.findIndex(p=>p.time>=poseTime);
      if(index===0)offset=samples[0].rootOffsetY;
      else if(index<0)offset=samples[samples.length-1].rootOffsetY;
      else{const a=samples[index-1],b=samples[index],t=(poseTime-a.time)/(b.time-a.time);offset=THREE.MathUtils.lerp(a.rootOffsetY,b.rootOffsetY,t);}
    }
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),state.yaw);
    const tilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-state.tilt);
    const pivot=new THREE.Vector3(...(model?.pivot??[0,actor.model.height*.48,0]));
    const compensation=pivot.clone().sub(pivot.clone().applyQuaternion(tilt)).applyQuaternion(yaw);
    actor.root.quaternion.copy(yaw).multiply(tilt);
    actor.root.position.set(state.x,groundHeight(state.x,state.z)+state.height+offset+.007,state.z).add(compensation);
  }
  private recoil(actor:Citizen,age:number){
    if(age<0||age>.44)return;
    const weight=age<.08?THREE.MathUtils.smoothstep(age,0,.08):1-THREE.MathUtils.smoothstep(age,.08,.44);
    const axis=new THREE.Vector3(Math.cos(actor.escapeYaw),0,-Math.sin(actor.escapeYaw));
    for(const [name,angle] of [['Bip01_Spine1',.09],['Bip01_Spine2',.07]] as const){
      const bone=actor.root.getObjectByName(name);if(!bone?.parent)continue;
      bone.parent.updateWorldMatrix(true,false);
      const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(parent),angle*weight));
    }
  }
  update(time:number,player:THREE.Vector3,aerial:boolean) {
    if(time-this.lastNpcUpdate<1/30)return;
    const step=Math.min(time-this.lastNpcUpdate,.08);this.lastNpcUpdate=time;
    this.citizens.forEach(actor=>{
      const {spec,model}=actor;
      const near=Math.hypot(actor.root.position.x-player.x,actor.root.position.z-player.z)<78;
      actor.root.visible=aerial||near;if(actor.impact&&actor.impact.phase!=='none')return;
      if(!near||aerial)return;
      const hitAge=time-actor.hitTime;
      if(spec.seatId&&!actor.seatReleased){this.setAction(actor,'seated');actor.mixer.update(step);this.recoil(actor,hitAge);return;}
      if(actor.disturbed){
        let moving=false;
        if(hitAge<.42){
          this.setAction(actor,'idle');
          const travel=step*.75,p=moveWithCollisions(actor.root.position.x,actor.root.position.z,Math.sin(actor.escapeYaw)*travel,Math.cos(actor.escapeYaw)*travel,this.obstacles);actor.root.position.set(p.x,groundHeight(p.x,p.z),p.z);
        }else if(time<actor.fearUntil){
          const preferred=Math.atan2(actor.root.position.x-player.x,actor.root.position.z-player.z);
          for(const offset of [0,.6,-.6,1.2,-1.2,1.9,-1.9,Math.PI]){
            const angle=preferred+offset,dx=Math.sin(angle)*step*2.8,dz=Math.cos(angle)*step*2.8;
            if(!isWalkable(actor.root.position.x+Math.sin(angle)*.7,actor.root.position.z+Math.cos(angle)*.7,this.obstacles,.30))continue;
            const p=moveWithCollisions(actor.root.position.x,actor.root.position.z,dx,dz,this.obstacles);moving=Math.hypot(p.x-actor.root.position.x,p.z-actor.root.position.z)>.005;actor.root.position.set(p.x,groundHeight(p.x,p.z),p.z);actor.escapeYaw=angle;break;
          }
          const diff=THREE.MathUtils.euclideanModulo(actor.escapeYaw-actor.yaw+Math.PI,Math.PI*2)-Math.PI;actor.yaw+=diff*(1-Math.exp(-step*9));actor.root.rotation.y=actor.yaw;
          this.setAction(actor,moving?'run':'idle');if(actor.actions.run)actor.actions.run.timeScale=1;
        }else this.setAction(actor,'idle');
        actor.mixer.update(step);this.recoil(actor,hitAge);return;
      }
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
