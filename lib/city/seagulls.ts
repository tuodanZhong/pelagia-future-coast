import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {groundHeight,isWalkable,type Obstacle} from './movement.ts';
import {GullFeeding,GULL_FEED_ZONES,MAX_GULL_CRUMBS,crumbPosition,type GullPoint} from './seagull-feeding.ts';
export {GULL_FEED_ZONES} from './seagull-feeding.ts';
type Phase='fly'|'approach'|'land'|'walk'|'peck'|'takeoff';
type Bird={id:number;zone:number;rig:THREE.Group;head:THREE.Group;wings:THREE.Group[];tips:THREE.Group[];legs:THREE.Group[];phase:Phase;elapsed:number;duration:number;from:THREE.Vector3;to:THREE.Vector3;startYaw:number;target?:number;nextLand:number;restUntil:number;wanderAt:number;scale:number;consumed:boolean;moving:number};
type Batch={mesh:THREE.InstancedMesh;part:'body'|'head'|'wing0'|'wing1'|'tip0'|'tip1'|'legs'};
const white='#e4e3de',gray='#a4adb0',dark='#282d31',cream='#bfa66c';
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const ease=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const turn=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*clamp(t,0,1);
function colored(g:THREE.BufferGeometry,color:THREE.ColorRepresentation){const c=new THREE.Color(color),array=new Float32Array(g.attributes.position.count*3);for(let i=0;i<array.length;i+=3){array[i]=c.r;array[i+1]=c.g;array[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(array,3));if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));return g;}
function merge(parts:THREE.BufferGeometry[]){const g=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());if(!g)throw new Error('Seagull geometry merge failed');g.computeBoundingSphere();return g;}
function ellipsoid(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,rx=0){const size=Math.max(sx,sy,sz),g=new THREE.SphereGeometry(1,size>.10?16:size>.04?12:8,size>.10?10:size>.04?8:6);g.scale(sx,sy,sz);g.rotateX(rx);g.translate(x,y,z);return colored(g,color);}
/** Closed, thin, cambered flight surface; upper feathers are gray, underside remains pale. */
function wingSurface(stations:number[][],outer=false){
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],top=new THREE.Color(gray),under=new THREE.Color(white),black=new THREE.Color(dark);
  for(const [x,z,chord,y] of stations)for(let k=0;k<8;k++){
    const a=k/8*Math.PI*2;positions.push(x,y+Math.sin(a)*.009,z+Math.cos(a)*chord/2);
    const c=outer&&x>.215?black:Math.sin(a)>.05?top:under;colors.push(c.r,c.g,c.b);
  }
  for(let i=0;i<stations.length-1;i++)for(let k=0;k<8;k++){const a=i*8+k,b=i*8+(k+1)%8,c=a+8,d=b+8;indices.push(a,c,b,b,c,d);}
  for(let k=1;k<7;k++){indices.push(0,k,k+1);const n=(stations.length-1)*8;indices.push(n,n+k+1,n+k);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function feather(x:number,z:number,tipX:number,tipZ:number,width:number,color:string,y=.012){
  const dx=tipX-x,dz=tipZ-z,length=Math.hypot(dx,dz),nx=-dz/length*width,nz=dx/length*width;
  const points=[x,y,z,x+dx*.34+nx,y+.004,z+dz*.34+nz,tipX,y-.006,tipZ,x+dx*.34-nx,y+.004,z+dz*.34-nz];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex([0,1,2,0,2,3,2,1,0,3,2,0]);g.computeVertexNormals();return colored(g,color);
}
function mirror(g:THREE.BufferGeometry){const result=g.clone();result.scale(-1,1,1);const indices=result.index!;for(let i=0;i<indices.count;i+=3){const a=indices.getX(i);indices.setX(i,indices.getX(i+1));indices.setX(i+1,a);}result.computeVertexNormals();return result;}
function makeGeometry(){
  const bodyParts=[ellipsoid(0,.243,0,.109,.132,.219,white,.09),ellipsoid(0,.277,.112,.093,.122,.141,white,.20),ellipsoid(0,.336,-.05,.101,.040,.168,gray),ellipsoid(0,.284,-.165,.078,.066,.12,white)];
  for(let i=0;i<7;i++)bodyParts.push(feather((i-3)*.018,-.18,(i-3)*.025,-.365-Math.cos((i-3)*.32)*.018,.018,i%2?'#d7d9d4':white,.267));
  const body=merge(bodyParts);
  const headParts=[ellipsoid(0,.025,.006,.056,.089,.061,white,-.25),ellipsoid(0,.076,.066,.075,.074,.089,white),ellipsoid(0,.033,.095,.057,.043,.071,white)];
  const beak=colored(new THREE.ConeGeometry(.027,.135,8),cream);beak.rotateX(Math.PI/2);beak.scale(.73,1,1);beak.translate(0,.042,.188);headParts.push(beak);
  headParts.push(ellipsoid(0,.026,.204,.012,.005,.013,'#ad644a'));
  const mouth=colored(new THREE.BoxGeometry(.029,.003,.078),'#756b50');mouth.translate(0,.034,.18);headParts.push(mouth);
  for(const side of [-1,1]){
    headParts.push(ellipsoid(side*.067,.088,.095,.008,.014,.014,'#aa9e69'));
    headParts.push(ellipsoid(side*.073,.088,.097,.006,.010,.010,'#151b1c'));
    headParts.push(ellipsoid(side*.078,.092,.101,.0025,.003,.003,'#f0f1e9'));
  }
  const head=merge(headParts);
  const upperParts=[wingSurface([[0,.006,.21,0],[.08,-.008,.225,.024],[.18,-.025,.206,.029],[.29,-.05,.17,.004]])];
  for(let i=0;i<7;i++)upperParts.push(feather(.018+i*.038,-.065,.035+i*.039,-.143-i*.003,.015,'#909b9e',.012));
  const wing=merge(upperParts);
  const outerParts=[wingSurface([[0,-.05,.17,0],[.08,-.072,.175,.012],[.17,-.103,.155,.007],[.27,-.155,.118,-.006],[.395,-.241,.018,-.022]],true)];
  for(let i=0;i<6;i++){
    const x=.12+i*.041,z=-.129-i*.017;outerParts.push(feather(x,z,x+.095,z-.08-i*.009,.018,i<2?'#6e7a80':dark,.004));
    if(i>2)outerParts.push(ellipsoid(x+.083,.002,z-.06-i*.008,.009,.003,.015,'#dddeda'));
  }
  const tip=merge(outerParts),legParts:THREE.BufferGeometry[]=[];
  const shin=colored(new THREE.CylinderGeometry(.0065,.0078,.14,7),cream);shin.translate(0,-.069,0);legParts.push(shin);
  for(const s of [-1,0,1]){
    const toe=colored(new THREE.CylinderGeometry(.0035,.005,.071,6),cream);toe.rotateX(Math.PI/2);toe.rotateY(s*.45);toe.translate(s*.014,-.14,.02);legParts.push(toe);
  }
  const web=new THREE.BufferGeometry();web.setAttribute('position',new THREE.Float32BufferAttribute([0,-.139,-.008,-.037,-.142,.048,0,-.143,.06,.037,-.142,.048],3));web.setIndex([0,1,2,0,2,3,2,1,0,3,2,0]);web.computeVertexNormals();legParts.push(colored(web,'#b99d63'));
  return {body,head,wing,wingLeft:mirror(wing),tip,tipLeft:mirror(tip),legs:merge(legParts)};
}

/** Eighteen articulated gulls, eight instanced draws including food; no external assets. */
export class Seagulls {
  readonly root=new THREE.Group();
  readonly feeding:GullFeeding;
  private birds:Bird[]=[];
  private batches:Batch[]=[];
  private crumbMesh:THREE.InstancedMesh;
  private obstacles:readonly Obstacle[];
  private dummy=new THREE.Object3D();
  private dead=false;
  private time=0;
  private geometries:THREE.BufferGeometry[]=[];
  private materials:THREE.Material[]=[];
  constructor(scene:THREE.Scene,obstacles:readonly Obstacle[],options:{count?:number}={}){
    this.obstacles=obstacles;this.root.name='Coastal seagull flocks';scene.add(this.root);
    this.feeding=new GullFeeding((x,z)=>isWalkable(x,z,this.obstacles as Obstacle[],.27));
    const count=clamp(Math.round(Number.isFinite(options.count)?options.count!:18),16,20),geometry=makeGeometry();
    this.geometries=Object.values(geometry);
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.74,metalness:0});this.materials.push(material);
    for(const [part,name] of [['body','body'],['head','head'],['wing0','wingLeft'],['wing1','wing'],['tip0','tipLeft'],['tip1','tip'],['legs','legs']] as const){
      const mesh=new THREE.InstancedMesh(geometry[name],material,part==='legs'?count*2:count);mesh.name='Gulls '+part;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);this.batches.push({mesh,part});
    }
    const crumbGeometry=new THREE.IcosahedronGeometry(.025,0),crumbMaterial=new THREE.MeshStandardMaterial({color:'#b79c71',roughness:1});
    this.geometries.push(crumbGeometry);this.materials.push(crumbMaterial);this.crumbMesh=new THREE.InstancedMesh(crumbGeometry,crumbMaterial,MAX_GULL_CRUMBS);this.crumbMesh.name='Gull feed crumbs';this.crumbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.crumbMesh.frustumCulled=false;this.crumbMesh.count=0;this.root.add(this.crumbMesh);
    for(let id=0;id<count;id++){
      const zone=id%2,rig=new THREE.Group(),head=new THREE.Group(),wings=[new THREE.Group(),new THREE.Group()],tips=[new THREE.Group(),new THREE.Group()],legs=[new THREE.Group(),new THREE.Group()];
      rig.add(head,...wings,...legs);head.position.set(0,.326,.125);
      for(let j=0;j<2;j++){const side=j?1:-1;wings[j].position.set(side*.089,.324,.021);wings[j].add(tips[j]);tips[j].position.set(side*.29,0,0);legs[j].position.set(side*.041,.153,.024);}
      const scale=.90+(id%5)*.036;rig.scale.setScalar(scale);
      const point=this.restPoint(zone,id),rest=id<6&&!!point;
      const b:Bird={id,zone,rig,head,wings,tips,legs,phase:rest?'walk':'fly',elapsed:0,duration:0,from:new THREE.Vector3(),to:new THREE.Vector3(),startYaw:0,nextLand:7+id*1.8,restUntil:12+id*1.6,wanderAt:2+id*.3,scale,consumed:false,moving:0};
      if(rest){rig.position.set(point!.x,groundHeight(point!.x,point!.z),point!.z);rig.rotation.y=id*1.7;b.to.copy(rig.position);}else this.flight(b,0);
      this.birds.push(b);
    }
    this.update(0,0,{x:0,z:0});
  }
  get count(){return this.birds.length;}
  get crumbCount(){return this.feeding.crumbs.length;}
  get feedingCount(){return this.birds.filter(b=>b.target!==undefined).length;}
  get cooldownRemaining(){return this.feeding.cooldownRemaining;}
  get states(){return this.birds.map(b=>({id:b.id,phase:b.phase,x:b.rig.position.x,y:b.rig.position.y,z:b.rig.position.z,zone:b.zone,target:b.target}));}
  available(player:GullPoint){return !this.dead&&this.feeding.available(player);}
  feed(player:GullPoint,yaw:number,time:number){if(this.dead)return false;return !!this.feeding.feed(player,yaw,time);}
  private restPoint(zone:number,index:number){
    const q=GULL_FEED_ZONES[zone];
    for(let i=0;i<30;i++){const angle=(index*2.399+i*.79),r=.25+(i%4)*.18,x=q.x+Math.sin(angle)*q.rx*r,z=q.z+Math.cos(angle)*q.rz*r;if(this.feeding.safe(x,z,zone))return {x,z};}
    return undefined;
  }
  private orbit(b:Bird,time:number){
    const a=time*(.15+(b.id%3)*.018)+b.id*2.399;
    if(b.zone===0)return new THREE.Vector3(158+Math.sin(a)*13.2,10.2+Math.sin(a*1.7+b.id)*2.2+(b.id%3)*1.5,105+Math.cos(a)*21);
    return new THREE.Vector3(-120+Math.sin(a)*21,10+Math.cos(a*1.4+b.id)*2.1+(b.id%3)*1.3,158+Math.cos(a)*9.3);
  }
  private flight(b:Bird,time:number){const p=this.orbit(b,time),next=this.orbit(b,time+.15);b.rig.position.copy(p);b.rig.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);}
  private landingSpot(b:Bird,point:{x:number;z:number}){
    for(let i=0;i<25;i++){
      const radius=i===0?0:.28+Math.floor((i-1)/8)*.22,angle=i*2.399+b.id;
      const p={x:point.x+Math.sin(angle)*radius,z:point.z+Math.cos(angle)*radius};
      if(!this.feeding.safe(p.x,p.z,b.zone))continue;
      if(this.birds.some(other=>other!==b&&other.zone===b.zone&&['land','walk','peck','approach'].includes(other.phase)&&Math.hypot(p.x-(other.phase==='approach'?other.to.x:other.rig.position.x),p.z-(other.phase==='approach'?other.to.z:other.rig.position.z))<.36))continue;
      return p;
    }
    return undefined;
  }
  private beginApproach(b:Bird,point:{x:number;z:number}){
    b.phase='approach';b.elapsed=0;b.from.copy(b.rig.position);b.to.set(point.x,groundHeight(point.x,point.z),point.z);b.duration=clamp(b.from.distanceTo(b.to)/6.5,1.8,6);b.startYaw=b.rig.rotation.y;
  }
  private takeoff(b:Bird){
    this.feeding.release(b.id);b.target=undefined;b.phase='takeoff';b.elapsed=0;b.duration=2.1;b.from.copy(b.rig.position);b.to.copy(this.orbit(b,this.time+b.duration));b.startYaw=b.rig.rotation.y;b.nextLand=this.time+12+(b.id%7)*2;
  }
  private claim(b:Bird){const crumb=this.feeding.claim(b.id,b.zone,b.rig.position);if(crumb)b.target=crumb.id;return crumb;}
  private animate(b:Bird){
    const t=this.time,id=b.id,grounded=['land','walk','peck'].includes(b.phase),landing=b.phase==='approach'?ease((b.elapsed/b.duration-.66)/.34):b.phase==='land'?1-ease(b.elapsed/.4):0;
    const groundedFold=b.phase==='land'?ease(b.elapsed/.38):grounded?1:0;
    const airborne=b.phase==='fly'||b.phase==='approach'||b.phase==='takeoff';
    const glide=b.phase==='fly'&&Math.sin(t*.72+id)>-.12;
    const flap=glide?.09+Math.sin(t*2+id)*.035:Math.sin(t*(b.phase==='takeoff'?17:12.5)+id*1.9)*(.48+landing*.17);
    const fold=b.phase==='takeoff'?1-ease(b.elapsed/.30):groundedFold;
    b.rig.rotation.x=grounded?0:b.phase==='approach'?-landing*.24:b.phase==='takeoff'?-.16:.035;
    b.rig.rotation.z=grounded?0:Math.sin(t*.15+id*2.399)*.10;
    const peck=b.phase==='peck'?Math.sin(clamp(b.elapsed/.5,0,1)*Math.PI)**4:grounded&&Math.sin(t*1.8+id)>.98?.18:0;
    b.head.position.set(0,.326-peck*.097,.125);b.head.rotation.set(peck*1.15,grounded?Math.sin(t*.8+id)*.21:Math.sin(t*.6+id)*.04,0);
    for(let j=0;j<2;j++){
      const side=j?1:-1;
      b.wings[j].rotation.set(0,side*fold*1.22,side*lerp(flap,.075,fold));
      b.tips[j].rotation.set(0,side*lerp(.06,.40,fold),side*(Math.sin(t*12.5+id*1.9-.55)*.19)*(1-fold));
      b.tips[j].scale.set(lerp(1,.82,fold),1,1);
      const step=grounded&&b.moving>.03?Math.sin(t*15+id+j*Math.PI)*.40:0;
      b.legs[j].rotation.x=airborne?(1-landing)*1.15:step;b.legs[j].position.y=.153+(step>0?Math.sin(step)*.025:0);
    }
    b.rig.updateMatrixWorld(true);
    for(const batch of this.batches){
      if(batch.part==='legs'){for(let j=0;j<2;j++)batch.mesh.setMatrixAt(id*2+j,b.legs[j].matrixWorld);}
      else{const node=batch.part==='body'?b.rig:batch.part==='head'?b.head:batch.part.startsWith('wing')?b.wings[Number(batch.part.at(-1))]:b.tips[Number(batch.part.at(-1))];batch.mesh.setMatrixAt(id,node.matrixWorld);}
    }
  }
  update(dt:number,time:number,player:GullPoint){
    if(this.dead)return;
    const step=clamp(Number.isFinite(dt)?dt:0,0,.10);if(Number.isFinite(time))this.time=Math.max(this.time,time);this.feeding.tick(this.time);
    for(const b of this.birds){
      b.elapsed+=step;b.moving=0;
      let crumb=b.target===undefined?undefined:this.feeding.get(b.target);
      if(b.target!==undefined&&!crumb)b.target=undefined;
      const ground=['walk','peck','land'].includes(b.phase),nearPlayer=Math.hypot(player.x-b.rig.position.x,player.z-b.rig.position.z);
      if(ground&&(!this.feeding.safe(b.rig.position.x,b.rig.position.z,b.zone)||nearPlayer<.66)){this.takeoff(b);crumb=undefined;}
      if(b.phase==='fly'){
        this.flight(b,this.time);
        if(b.elapsed>.4+(b.id%5)*.23)crumb=this.claim(b);
        const rest=this.time>b.nextLand?this.restPoint(b.zone,b.id+Math.floor(this.time)):undefined;
        if(crumb||rest){const spot=this.landingSpot(b,crumb??rest!);if(spot)this.beginApproach(b,spot);else{this.feeding.release(b.id);b.target=undefined;}}
      }else if(b.phase==='approach'){
        if(!this.feeding.safe(b.to.x,b.to.z,b.zone)){this.takeoff(b);}
        else{
          const u=clamp(b.elapsed/b.duration,0,1),s=ease(u);
          b.rig.position.lerpVectors(b.from,b.to,s);b.rig.position.y=lerp(b.from.y,b.to.y,u)+Math.sin(u*Math.PI)*1.15;
          const yaw=Math.atan2(b.to.x-b.rig.position.x,b.to.z-b.rig.position.z);b.rig.rotation.y=turn(b.rig.rotation.y,yaw,step*5);
          if(u>=1){b.phase='land';b.elapsed=0;b.restUntil=this.time+10+b.id%6;b.wanderAt=this.time+2;}
        }
      }else if(b.phase==='takeoff'){
        const u=clamp(b.elapsed/b.duration,0,1);b.rig.position.lerpVectors(b.from,b.to,ease(u));b.rig.position.y=lerp(b.from.y,b.to.y,Math.sin(u*Math.PI/2));
        b.rig.rotation.y=turn(b.rig.rotation.y,Math.atan2(b.to.x-b.from.x,b.to.z-b.from.z),step*4);
        if(u>=1){b.phase='fly';b.elapsed=0;}
      }else if(b.phase==='land'){
        if(b.elapsed>.4){b.phase='walk';b.elapsed=0;}
      }else if(b.phase==='peck'){
        if(!b.consumed&&b.elapsed>.24&&crumb){this.feeding.consume(crumb.id,b.id,this.time);b.consumed=true;}
        if(b.elapsed>.55){b.phase='walk';b.elapsed=0;b.target=undefined;this.feeding.release(b.id);}
      }else if(b.phase==='walk'){
        if(!crumb)crumb=this.claim(b);
        if(crumb){b.to.set(crumb.x,groundHeight(crumb.x,crumb.z),crumb.z);b.restUntil=this.time+7;}
        else if(this.time>b.restUntil){this.takeoff(b);}
        else if(this.time>b.wanderAt){const p=this.restPoint(b.zone,b.id+Math.floor(this.time));if(p)b.to.set(p.x,groundHeight(p.x,p.z),p.z);b.wanderAt=this.time+2.4+b.id%3;}
        if(b.phase==='walk'){
          const dx=b.to.x-b.rig.position.x,dz=b.to.z-b.rig.position.z,distance=Math.hypot(dx,dz);
          if(distance>(crumb?.30:.12)){
            const speed=Math.min(distance,(crumb?.52:.28)*step),nx=b.rig.position.x+dx/distance*speed,nz=b.rig.position.z+dz/distance*speed;
            const crowded=this.birds.some(other=>other!==b&&['walk','peck','land'].includes(other.phase)&&Math.hypot(nx-other.rig.position.x,nz-other.rig.position.z)<.25);
            if(crowded){b.wanderAt=this.time;}
            else if(this.feeding.safe(nx,nz,b.zone)){b.rig.position.set(nx,groundHeight(nx,nz),nz);b.rig.rotation.y=turn(b.rig.rotation.y,Math.atan2(dx,dz),step*8);b.moving=step>0?speed/step:0;}else this.takeoff(b);
          }else if(crumb&&this.time>=crumb.landsAt){b.rig.rotation.y=Math.atan2(dx,dz);b.phase='peck';b.elapsed=0;b.consumed=false;}
        }
      }
      this.animate(b);
    }
    for(const batch of this.batches)batch.mesh.instanceMatrix.needsUpdate=true;
    this.crumbMesh.count=this.feeding.crumbs.length;
    this.feeding.crumbs.forEach((c,i)=>{const p=crumbPosition(c,this.time,groundHeight);this.dummy.position.set(p.x,p.y,p.z);this.dummy.rotation.set(c.id*.7,c.id*1.31,c.id*.43);this.dummy.scale.setScalar(.75+(c.id%4)*.15);this.dummy.updateMatrix();this.crumbMesh.setMatrixAt(i,this.dummy.matrix);});
    this.crumbMesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){if(this.dead)return;this.dead=true;this.feeding.clear();for(const batch of this.batches)batch.mesh.dispose();this.crumbMesh.dispose();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();this.root.removeFromParent();this.birds.length=0;}
}
