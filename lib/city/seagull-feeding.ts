/** Deterministic, DOM/Three-free feeding rules. Coordinates are metres. */
export type GullPoint={x:number;z:number;y?:number};
export type FeedZone={id:string;name:string;x:number;z:number;rx:number;rz:number;reach:number};
export const GULL_FEED_ZONES:readonly FeedZone[]=Object.freeze([
  Object.freeze({id:'east',name:'东岸观鸥步道',x:143,z:105,rx:1.2,rz:3.0,reach:8}),
  Object.freeze({id:'south',name:'南岸观鸥木栈道',x:-123.1,z:143,rx:1.8,rz:1.12,reach:8}),
]);
export const FEED_COOLDOWN=1.8,MAX_GULL_CRUMBS=40,CRUMBS_PER_FEED=8,CRUMB_LIFETIME=15;
export type GullCrumb={id:number;zone:number;x:number;z:number;from:GullPoint;born:number;landsAt:number;expires:number;claimedBy?:number};
export type LandingCheck=(x:number,z:number)=>boolean;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const finitePoint=(p:GullPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.z);
export class GullFeeding {
  readonly crumbs:GullCrumb[]=[];
  private nextId=0;
  private seed=94217;
  private lastFeed=-Infinity;
  private now=0;
  readonly zones:readonly FeedZone[];
  private canLand:LandingCheck;
  constructor(canLand:LandingCheck=()=>true,zones:readonly FeedZone[]=GULL_FEED_ZONES){this.canLand=canLand;this.zones=zones;}
  private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  get cooldownRemaining(){return Math.max(0,this.lastFeed+FEED_COOLDOWN-this.now);}
  safe(x:number,z:number,zone:number){const q=this.zones[zone];return !!q&&Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x-q.x)<=q.rx&&Math.abs(z-q.z)<=q.rz&&Math.abs(x)<145&&Math.abs(z)<145&&this.canLand(x,z);}
  zoneAt(player:GullPoint){if(!finitePoint(player)||Math.abs(player.x)>145||Math.abs(player.z)>145)return -1;return this.zones.findIndex(q=>Math.hypot(player.x-q.x,player.z-q.z)<=q.reach);}
  available(player:GullPoint){return this.zoneAt(player)>=0&&this.cooldownRemaining<=0&&this.canLand(player.x,player.z);}
  tick(time:number){
    if(Number.isFinite(time))this.now=Math.max(this.now,time);
    for(let i=this.crumbs.length-1;i>=0;i--)if(this.crumbs[i].expires<=this.now||!this.safe(this.crumbs[i].x,this.crumbs[i].z,this.crumbs[i].zone))this.crumbs.splice(i,1);
  }
  /** yaw follows the walking camera convention: zero faces -Z. */
  feed(player:GullPoint,yaw:number,time:number):GullCrumb[]|undefined{
    if(!Number.isFinite(time)||!Number.isFinite(yaw)||time<this.now)return undefined;
    this.tick(time);if(!this.available(player))return undefined;
    const zone=this.zoneAt(player),q=this.zones[zone];
    const target={x:clamp(player.x-Math.sin(yaw)*3.3,q.x-q.rx+.15,q.x+q.rx-.15),z:clamp(player.z-Math.cos(yaw)*3.3,q.z-q.rz+.15,q.z+q.rz-.15)};
    const added:GullCrumb[]=[];
    for(let i=0;i<CRUMBS_PER_FEED;i++){
      let point:GullPoint|undefined;
      for(let attempt=0;attempt<24;attempt++){
        const spread=attempt<12?.8:1;
        const x=attempt<12?clamp(target.x+(this.random()-.5)*spread*2,q.x-q.rx+.06,q.x+q.rx-.06):q.x+(this.random()*2-1)*q.rx*.94;
        const z=attempt<12?clamp(target.z+(this.random()-.5)*spread*2,q.z-q.rz+.06,q.z+q.rz-.06):q.z+(this.random()*2-1)*q.rz*.94;
        if(this.safe(x,z,zone)){point={x,z};break;}
      }
      if(!point)continue;
      added.push({id:this.nextId++,zone,x:point.x,z:point.z,from:{x:player.x,z:player.z,y:Number.isFinite(player.y)?player.y:undefined},born:time,landsAt:time+.62+this.random()*.24,expires:time+CRUMB_LIFETIME});
    }
    if(!added.length)return undefined;
    this.lastFeed=time;
    while(this.crumbs.length+added.length>MAX_GULL_CRUMBS)this.crumbs.shift();
    this.crumbs.push(...added);return added;
  }
  claim(birdId:number,zone:number,from:GullPoint){
    const held=this.crumbs.find(c=>c.claimedBy===birdId);if(held)return held;
    let nearest:GullCrumb|undefined,distance=Infinity;
    for(const c of this.crumbs)if(c.zone===zone&&c.claimedBy===undefined){const d=Math.hypot(c.x-from.x,c.z-from.z);if(d<distance){distance=d;nearest=c;}}
    if(nearest)nearest.claimedBy=birdId;return nearest;
  }
  release(birdId:number){for(const c of this.crumbs)if(c.claimedBy===birdId)c.claimedBy=undefined;}
  consume(id:number,birdId:number,time:number){const i=this.crumbs.findIndex(c=>c.id===id&&c.claimedBy===birdId&&time>=c.landsAt&&time<c.expires);if(i<0)return false;this.crumbs.splice(i,1);return true;}
  get(id:number){return this.crumbs.find(c=>c.id===id);}
  clear(){this.crumbs.length=0;}
}
/** A bounded hand-toss arc; endpoints are exact and never bounce into water. */
export function crumbPosition(crumb:GullCrumb,time:number,ground:(x:number,z:number)=>number){
  const t=clamp((time-crumb.born)/(crumb.landsAt-crumb.born),0,1),y0=ground(crumb.from.x,crumb.from.z)+1.05,y1=ground(crumb.x,crumb.z)+.025;
  return {x:crumb.from.x+(crumb.x-crumb.from.x)*t,z:crumb.from.z+(crumb.z-crumb.from.z)*t,y:y0+(y1-y0)*t+Math.sin(t*Math.PI)*.72};
}
