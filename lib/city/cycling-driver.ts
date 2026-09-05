import * as THREE from 'three';

export type CyclistActor={root:THREE.Group;mixer:THREE.AnimationMixer;actions:Record<string,THREE.AnimationAction>;action:string;yaw:number};
const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
const STEERING_AXIS=new THREE.Vector3(0,.94,-.342).normalize();
const PIVOT=new THREE.Vector3(0,.85,.405);
const GRIP_Q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Z,Y.clone().negate(),X));
function setWorldQuaternion(bone:THREE.Object3D,q:THREE.Quaternion){bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
/** Two-bone rotations only; does not rescale or translate any limb bone. */
function armIK(root:THREE.Object3D,side:'L'|'R',target:THREE.Vector3,handQ:THREE.Quaternion,pole:THREE.Vector3){
 const upper=root.getObjectByName(`Bip01_${side}_UpperArm`),lower=root.getObjectByName(`Bip01_${side}_Forearm`),hand=root.getObjectByName(`Bip01_${side}_Hand`);if(!upper||!lower||!hand)return 0;
 const A=upper.getWorldPosition(new THREE.Vector3()),B=lower.getWorldPosition(new THREE.Vector3()),C=hand.getWorldPosition(new THREE.Vector3()),l1=A.distanceTo(B),l2=B.distanceTo(C),raw=target.clone().sub(A),distance=raw.length();raw.normalize();
 const d=THREE.MathUtils.clamp(distance,Math.abs(l1-l2)+.0001,l1+l2-.0001),reachable=A.clone().addScaledVector(raw,d),along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),bend=pole.clone().sub(A);bend.addScaledVector(raw,-bend.dot(raw)).normalize();const elbow=A.clone().addScaledVector(raw,along).addScaledVector(bend,height);
 setWorldQuaternion(upper,new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(),elbow.clone().sub(A).normalize()).multiply(upper.getWorldQuaternion(new THREE.Quaternion())));
 const B2=lower.getWorldPosition(new THREE.Vector3()),C2=hand.getWorldPosition(new THREE.Vector3());setWorldQuaternion(lower,new THREE.Quaternion().setFromUnitVectors(C2.sub(B2).normalize(),reachable.clone().sub(B2).normalize()).multiply(lower.getWorldQuaternion(new THREE.Quaternion())));setWorldQuaternion(hand,handQ);
 return hand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
}
/** Invoke after mixer sampling. Matrix is bicycle.leanRoot.matrixWorld, already ground/yaw/lean corrected. */
export function retargetCyclistArms(root:THREE.Group,matrix:THREE.Matrix4,steer:number){
 root.updateMatrixWorld(true);const rotation=new THREE.Quaternion(),unused=new THREE.Vector3(),scale=new THREE.Vector3();matrix.decompose(unused,rotation,scale);
 const bounded=THREE.MathUtils.clamp(steer,-.6,.6),turn=new THREE.Quaternion().setFromAxisAngle(STEERING_AXIS,-bounded);let maxError=0;
 // A real cyclist follows the turning bars with the chest; arm-only IK overreaches at full lock.
 const spine=root.getObjectByName('Bip01_Spine1'),head=root.getObjectByName('Bip01_Head'),headQ=head?.getWorldQuaternion(new THREE.Quaternion());
 if(spine){const bodyTurn=new THREE.Quaternion().setFromAxisAngle(Y.clone().applyQuaternion(rotation),-bounded*.95);setWorldQuaternion(spine,bodyTurn.multiply(spine.getWorldQuaternion(new THREE.Quaternion())));}
 if(head&&headQ)setWorldQuaternion(head,headQ);
 for(const[side,sign]of[['L',1],['R',-1]] as const){
  const grip=new THREE.Vector3(sign*.27,1.18,.45).sub(PIVOT).applyQuaternion(turn).add(PIVOT),offset=new THREE.Vector3(0,.035,-.090).applyQuaternion(turn),target=grip.add(offset).applyMatrix4(matrix),q=rotation.clone().multiply(turn).multiply(GRIP_Q),pole=new THREE.Vector3(sign*.40,1.28,.15).applyMatrix4(matrix);
  maxError=Math.max(maxError,armIK(root,side,target,q,pole));
 }
 return maxError;
}
/** Helper body for Characters.updateRider(matrix,yaw,crank,steer,speed,visible,dt). */
export function poseRider(actor:CyclistActor,matrix:THREE.Matrix4,yaw:number,crank:number,steer:number,speed:number,visible:boolean,dt:number){
 matrix.decompose(actor.root.position,actor.root.quaternion,actor.root.scale);actor.yaw=yaw;actor.root.visible=visible;
 const restPhase=Math.abs(Math.atan2(Math.sin(crank-Math.PI/2),Math.cos(crank-Math.PI/2)));
 const key=Math.abs(speed)<.08&&restPhase<.04?'cycling_rest':'cycling',action=actor.actions[key];if(!action)return;
 if(actor.action!==key){const previous=actor.actions[actor.action];if(actor.action==='cycling'||actor.action==='cycling_rest'){previous?.fadeOut(.22);action.reset().setEffectiveWeight(1).fadeIn(.22).play();}else{actor.mixer.stopAllAction();action.reset().setEffectiveWeight(1).play();}actor.action=key;}
 action.paused=true;action.time=key==='cycling'?THREE.MathUtils.euclideanModulo(crank,Math.PI*2)/(Math.PI*2)*action.getClip().duration:0;
 actor.mixer.update(Math.max(0,dt));retargetCyclistArms(actor.root,matrix,steer);
}
export const CYCLING_REST_CRANK=Math.PI/2;
export const FEEDING={duration:.8,releaseTime:.42,handBone:'Bip01_R_Hand',localHandForwardOffset:.075};
export const CYCLING_EYE_LOCAL=new THREE.Vector3(.00442,1.66623,.17);
