import {vehicleCollision,type DrivingEnvironment,type DrivingInput} from './driving.ts';
export type PolicePoint={x:number;z:number};
export type PolicePose=PolicePoint&{id?:string;yaw:number;speed:number;canArrest?:boolean};
export type WantedPlayer=PolicePoint&{speed?:number;vehicle?:boolean};
export type OffenseKind='assault'|'car-collision'|'npc-impact';
export type WantedState={level:0|1|2|3;heat:number;searching:boolean;remaining:number;evadeProgress:number;arrestProgress:number;arrested:boolean;lastKnown:PolicePoint};
export type WantedOptions={escapeSeconds?:number;escapeDistance?:number;arrestSeconds?:number;footArrestDistance?:number;vehicleArrestDistance?:number};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const distance=(a:PolicePoint,b:PolicePoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const valid=(p:PolicePoint)=>Number.isFinite(p.x)&&Number.isFinite(p.z);
const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const WEIGHTS:Record<OffenseKind,number>={'assault':25,'car-collision':12,'npc-impact':45};
const COOLDOWNS:Record<OffenseKind,number>={'assault':.6,'car-collision':2.5,'npc-impact':.85};
/** Wanted state uses active dt for escape/arrest; wall time only deduplicates offense reports. */
export class WantedController {
  private heat=0;
  private escapedFor=0;
  private arrestedFor=0;
  private arrested=false;
  private searching=false;
  private lastKnown:PolicePoint={x:0,z:0};
  private lastTime=-Infinity;
  private offensePending=false;
  private recent=new Map<string,number>();
  private options:Required<WantedOptions>;
  constructor(options:WantedOptions={}){
    this.options={escapeSeconds:Math.max(1,options.escapeSeconds??25),escapeDistance:Math.max(10,options.escapeDistance??85),arrestSeconds:Math.max(.5,options.arrestSeconds??3),footArrestDistance:Math.max(1,options.footArrestDistance??3.4),vehicleArrestDistance:Math.max(4.95,options.vehicleArrestDistance??6.5)};
  }
  get state():WantedState{
    const level=this.heat<=0?0:this.heat<30?1:this.heat<65?2:3;
    return {level,heat:this.heat,searching:level>0&&this.searching,remaining:level>0?Math.max(0,this.options.escapeSeconds-this.escapedFor):0,evadeProgress:level>0?clamp(this.escapedFor/this.options.escapeSeconds,0,1):0,arrestProgress:clamp(this.arrestedFor/this.options.arrestSeconds,0,1),arrested:this.arrested,lastKnown:{...this.lastKnown}};
  }
  offense(kind:OffenseKind,time:number,key='global'){
    if(this.arrested||!Number.isFinite(time)||time<this.lastTime||!Object.hasOwn(WEIGHTS,kind))return false;
    const id=kind+':'+key,last=this.recent.get(id)??-Infinity;if(time-last<COOLDOWNS[kind])return false;
    this.recent.set(id,time);while(this.recent.size>64)this.recent.delete(this.recent.keys().next().value!);
    this.lastTime=time;this.heat=Math.min(100,this.heat+WEIGHTS[kind]);this.escapedFor=0;this.arrestedFor=0;this.searching=false;this.offensePending=true;return true;
  }
  update(dt:number,time:number,player:WantedPlayer,cops:readonly PolicePose[]):WantedState{
    if(!Number.isFinite(time)||time<this.lastTime)return this.state;
    if(Number.isFinite(time))this.lastTime=Math.max(this.lastTime,time);
    const step=clamp(Number.isFinite(dt)?dt:0,0,.25);
    if(this.arrested||this.heat===0||!valid(player))return this.state;
    const active=cops.filter(c=>valid(c)),near=active.reduce((best,c)=>Math.min(best,distance(c,player)),Infinity);
    if(this.offensePending||near<=this.options.escapeDistance){this.lastKnown={x:player.x,z:player.z};this.offensePending=false;}
    if(step===0)return this.state;
    this.searching=near>this.options.escapeDistance;
    if(this.searching)this.escapedFor+=step;else this.escapedFor=0;
    const captureDistance=player.vehicle?this.options.vehicleArrestDistance:this.options.footArrestDistance;
    const held=active.some(c=>c.canArrest!==false&&Math.abs(c.speed)<2&&distance(c,player)<=captureDistance)&&Math.abs(player.speed??0)<.8;
    this.arrestedFor=held?this.arrestedFor+step:0;
    if(this.arrestedFor>=this.options.arrestSeconds){this.arrested=true;this.heat=0;this.searching=false;this.escapedFor=0;}
    else if(this.escapedFor>=this.options.escapeSeconds){this.heat=0;this.searching=false;this.escapedFor=0;this.arrestedFor=0;}
    return this.state;
  }
  /** Explicit story/reset/arrest resolution only. Calling update with dt=0 never clears heat. */
  reset(){this.heat=0;this.escapedFor=0;this.arrestedFor=0;this.arrested=false;this.searching=false;this.offensePending=false;this.recent.clear();this.lastTime=-Infinity;this.lastKnown={x:0,z:0};}
}
export type PoliceRoute={points:PolicePoint[];goal:PolicePoint;reachesTarget:boolean;length:number};
export type PoliceRouteOptions={length?:number;width?:number;maxVisits?:number};
const GRID=6,LOW=-144,SIZE=49;
const gridPoint=(id:number)=>({x:LOW+(id%SIZE)*GRID,z:LOW+Math.floor(id/SIZE)*GRID});
const roadDistance=(p:PolicePoint)=>Math.min(Math.abs(Math.abs(p.x)-48),Math.abs(Math.abs(p.z)-48),Math.abs(Math.abs(p.z)-132));
class Heap {
  items:{id:number;score:number}[]=[];
  push(item:{id:number;score:number}){const a=this.items;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.items,top=a[0],last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let n=i*2+1;if(n+1<a.length&&a[n+1].score<a[n].score)n++;if(a[n].score>=last.score)break;a[i]=a[n];i=n;}a[i]=last;}return top;}
}
/**
 * Bounded 6m A*: strongly favors the real street grid, permits clear driveways/plaza approaches.
 * Static geometry only. Traffic remains responsible for swept dynamic-car collision at every step.
 */
export function planPoliceRoute(start:PolicePose,target:PolicePoint,environment:DrivingEnvironment,options:PoliceRouteOptions={}):PoliceRoute{
  const empty=():PoliceRoute=>({points:[],goal:{x:start.x,z:start.z},reachesTarget:false,length:0});
  if(!valid(start)||!valid(target))return empty();
  const length=options.length??4.9,width=options.width??2.2,envelope=Math.hypot(length,width)+.20;
  const staticWorld:DrivingEnvironment={obstacles:environment.obstacles,worldEdge:environment.worldEdge??145};
  // Sparse broad phase makes route replans inexpensive even in the full architectural scene.
  const buckets=new Map<string,DrivingEnvironment['obstacles'][number][]>(),cell=12;
  for(const obstacle of staticWorld.obstacles){
    const c=Math.abs(Math.cos(obstacle.yaw??0)),s=Math.abs(Math.sin(obstacle.yaw??0)),rx=c*obstacle.rx+s*obstacle.rz,rz=s*obstacle.rx+c*obstacle.rz;
    for(let ix=Math.floor((obstacle.x-rx)/cell);ix<=Math.floor((obstacle.x+rx)/cell);ix++)for(let iz=Math.floor((obstacle.z-rz)/cell);iz<=Math.floor((obstacle.z+rz)/cell);iz++){const key=ix+':'+iz,list=buckets.get(key);if(list)list.push(obstacle);else buckets.set(key,[obstacle]);}
  }
  const clearAt=(p:PolicePoint,yaw:number,square=false)=>{
    const nearby=new Set<DrivingEnvironment['obstacles'][number]>(),reach=envelope/2+.1;
    for(let ix=Math.floor((p.x-reach)/cell);ix<=Math.floor((p.x+reach)/cell);ix++)for(let iz=Math.floor((p.z-reach)/cell);iz<=Math.floor((p.z+reach)/cell);iz++)for(const obstacle of buckets.get(ix+':'+iz)??[])nearby.add(obstacle);
    return !vehicleCollision({...p,yaw,length:square?envelope:length,width:square?envelope:width},{obstacles:[...nearby],worldEdge:staticWorld.worldEdge},.07);
  };
  const nodeClear=new Int8Array(SIZE*SIZE);
  const clearNode=(id:number)=>{if(id<0||id>=SIZE*SIZE)return false;if(!nodeClear[id])nodeClear[id]=clearAt(gridPoint(id),0,true)?1:-1;return nodeClear[id]===1;};
  const segment=(a:PolicePoint,b:PolicePoint,square=false)=>{
    const d=distance(a,b),yaw=square?0:Math.atan2(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(d/1.5));
    for(let i=0;i<=steps;i++){const t=i/steps;if(!clearAt({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},yaw,square))return false;}return true;
  };
  // Direct short approaches are valid only when the whole car corridor is clear.
  if(distance(start,target)<20&&segment(start,target))return {points:[{x:start.x,z:start.z},{...target}],goal:{...target},reachesTarget:true,length:distance(start,target)};
  const candidates=(p:PolicePoint)=>{
    const cx=clamp(Math.round((p.x-LOW)/GRID),1,SIZE-2),cz=clamp(Math.round((p.z-LOW)/GRID),1,SIZE-2),list:{id:number;d:number}[]=[];
    for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){const ix=cx+dx,iz=cz+dz;if(ix<1||ix>=SIZE-1||iz<1||iz>=SIZE-1)continue;const id=iz*SIZE+ix;if(clearNode(id))list.push({id,d:distance(p,gridPoint(id))});}
    return list.sort((a,b)=>a.d-b.d);
  };
  const entries=candidates(start).filter(c=>c.d<26&&segment(start,gridPoint(c.id))).slice(0,10),goals=candidates(target).slice(0,12);
  if(!entries.length||!goals.length)return empty();
  const goalCosts=new Map(goals.map(g=>[g.id,g.d*3.5])),open=new Heap(),scores=new Float64Array(SIZE*SIZE).fill(Infinity),previous=new Int32Array(SIZE*SIZE).fill(-2),closed=new Uint8Array(SIZE*SIZE);
  for(const e of entries){scores[e.id]=e.d*(1+Math.min(2,roadDistance(gridPoint(e.id))/12));previous[e.id]=-1;open.push({id:e.id,score:scores[e.id]+distance(gridPoint(e.id),target)});}
  let best=-1,bestCost=Infinity,visits=0;
  while(open.items.length&&visits++<(options.maxVisits??2401)){
    const {id,score}=open.pop();if(closed[id])continue;if(score>bestCost)break;closed[id]=1;
    const finish=goalCosts.get(id);if(finish!==undefined&&scores[id]+finish<bestCost){best=id;bestCost=scores[id]+finish;}
    const x=id%SIZE,z=Math.floor(id/SIZE),p=gridPoint(id);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if((dx===0&&dz===0)||x+dx<1||x+dx>=SIZE-1||z+dz<1||z+dz>=SIZE-1)continue;
      const nid=(z+dz)*SIZE+x+dx;if(closed[nid]||!clearNode(nid))continue;
      if(dx&&dz&&(!clearNode(z*SIZE+x+dx)||!clearNode((z+dz)*SIZE+x)))continue;
      const q=gridPoint(nid);if(!segment(p,q,true))continue;
      const cost=scores[id]+GRID*Math.hypot(dx,dz)*(1+Math.min(3,roadDistance(q)/11));
      if(cost<scores[nid]){scores[nid]=cost;previous[nid]=id;open.push({id:nid,score:cost+distance(q,target)});}
    }
  }
  if(best<0)return empty();
  const points:PolicePoint[]=[];for(let at=best;at>=0;at=previous[at])points.push(gridPoint(at));points.reverse();points.unshift({x:start.x,z:start.z});
  // Stop at the closest safe point to a foot target instead of driving into its building or water.
  const last=points.at(-1)!;let finish={...last};
  const towards=distance(last,target),yaw=Math.atan2(target.x-last.x,target.z-last.z);
  for(let d=.35;d<=towards;d+=.35){const t=Math.min(1,d/towards),q={x:last.x+(target.x-last.x)*t,z:last.z+(target.z-last.z)*t};if(!clearAt(q,yaw))break;finish=q;}
  const reachesTarget=segment(finish,target)&&distance(finish,target)<.6;if(reachesTarget)finish={...target};
  if(distance(finish,last)>.10)points.push(finish);
  // Remove only collinear vertices; cutting across road corners could cut through a building.
  for(let i=points.length-2;i>0;i--){const a=points[i-1],b=points[i],c=points[i+1],cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);if(Math.abs(cross)<1e-6)points.splice(i,1);}
  return {points,goal:{...finish},reachesTarget,length:points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0)};
}
/** Stateless pure-pursuit input; pass the latest route, replan about once per second as target moves. */
export function drivePoliceInput(cop:PolicePose,route:PoliceRoute,options:{maxSpeed?:number;stopDistance?:number}={}):DrivingInput{
  const stop=options.stopDistance??2.9,maxSpeed=options.maxSpeed??11;
  if(!valid(cop)||route.points.length<2||distance(cop,route.goal)<=stop)return {throttle:0,steer:0,brake:1};
  let closest=Infinity,segmentIndex=0,fraction=0;
  for(let i=0;i<route.points.length-1;i++){
    const a=route.points[i],b=route.points[i+1],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
    const t=length2>1e-8?clamp(((cop.x-a.x)*dx+(cop.z-a.z)*dz)/length2,0,1):0,p={x:a.x+dx*t,z:a.z+dz*t},d=distance(cop,p);
    if(d<closest){closest=d;segmentIndex=i;fraction=t;}
  }
  let look=clamp(3.8+Math.abs(cop.speed)*.48,3.8,8),aim={...route.goal};
  for(let i=segmentIndex;i<route.points.length-1;i++){
    const a=route.points[i],b=route.points[i+1],from=i===segmentIndex?fraction:0,left=distance(a,b)*(1-from);
    if(look<=left){const t=from+look/Math.max(1e-8,distance(a,b));aim={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};break;}look-=left;
  }
  const heading=Math.atan2(aim.x-cop.x,aim.z-cop.z),frontError=angle(heading-cop.yaw),reverse=Math.abs(frontError)>1.95&&Math.abs(cop.speed)<2.5;
  const error=angle(heading-cop.yaw-(reverse?Math.PI:0)),ahead=Math.max(2.2,distance(cop,aim));
  const steer=clamp((reverse?1:-1)*Math.atan2(2*2.8*Math.sin(error),ahead)/.56,-1,1);
  const turnSpeed=Math.max(2.2,maxSpeed*(1-Math.min(.82,Math.abs(error)*.7))),goalSpeed=Math.sqrt(Math.max(0,distance(cop,route.goal)-stop)*2*3.1),target=Math.min(reverse?2.1:maxSpeed,turnSpeed,goalSpeed);
  if(!reverse&&cop.speed>target+.55)return {throttle:0,steer,brake:.7};
  if(reverse&&cop.speed>1)return {throttle:0,steer,brake:1};
  const throttle=reverse?-.68:cop.speed<target-.3?1:.15;
  return {throttle,steer,brake:0};
}
