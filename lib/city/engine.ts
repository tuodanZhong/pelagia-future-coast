import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld } from './world';
import { Characters } from './characters';
import { JumpController, jumpKind, jumpVelocity } from './jump';
import { SeatController, nearestSeat, type Seat } from './seating';
import { Traffic, type Vehicle } from './traffic';
import { AttackController } from './combat';
import { locomotionSpeed } from './locomotion';
import { TrafficSignals } from './signals';
import { followOffset, resolveFollowCamera } from './camera';
import { EYE_HEIGHT, SPAWN, moveWithCollisions, movementVector, groundHeight, clearArrival } from './movement';

export type ViewMode = 'first' | 'third' | 'aerial';
export type CityState = { ready: boolean; locked: boolean; active: boolean; mode: ViewMode; x: number; z: number; yaw: number; fps: number; calls: number; triangles: number; zone: string; fallback: boolean; sprinting:boolean; seated:boolean; interaction:'sit'|'stand'|'busy'|null; driving:boolean; vehicleName:string; vehicleSpeed:number; vehicleGear:string; vehicleInteraction:'enter'|'exit'|null; attackHit:boolean };
export class CityEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, 1, 0.15, 12000);
  orbit: OrbitControls;
  world: ReturnType<typeof buildWorld>;
  mode: ViewMode = 'third';
  active = false;
  locked = false;
  fallback = false;
  yaw = SPAWN.yaw;
  pitch = -0.12;
  private streetMode: ViewMode = 'third';
  private characters: Characters;
  private traffic: Traffic;
  private signals: TrafficSignals;
  private characterYaw = SPAWN.yaw + Math.PI;
  private playerSpeed = 0;
  private moveSpeed = 0;
  private sprintToggled = false;
  private velocity={x:0,z:0};
  private seating=new SeatController();
  private nearbySeat?:Seat;
  private nearbyVehicle?:Vehicle;
  private attack=new AttackController();
  private hitUntil=0;
  private lastDriveLook=-10;
  private collisionNotice=-10;
  private cameraTarget = new THREE.Vector3();
  private reflection?: THREE.WebGLRenderTarget;
  keys = new Set<string>();
  private tappedKeys = new Set<string>();
  quality = 1;
  private assetsReady = false;
  private composer!: EffectComposer;
  private ao!: GTAOPass;
  private backgroundTexture?: THREE.DataTexture;
  private lastShadow = 0;
  private frame = 0;
  private dead = false;
  private dragging = false;
  private lockRequest = 0;
  private wantsLock = false;
  private lastPointer = { x: 0, y: 0 };
  private prev = 0;
  private elapsed = 0;
  private lastReport = 0;
  private frames = 0;
  private jump = new JumpController();
  private walkPosition = new THREE.Vector3(SPAWN.x, EYE_HEIGHT, SPAWN.z);
  private resizeObserver: ResizeObserver;
  private disposers: (() => void)[] = [];
  private sun: THREE.DirectionalLight;
  private environment: THREE.WebGLRenderTarget;
  private notice: (message: string) => void;
  private report: (state: CityState) => void;
  constructor(private container: HTMLElement, report: (state: CityState) => void, notice: (message: string) => void) {
    this.report = report; this.notice = notice;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '未来海岸三维场景，点击后使用 WASD 移动，鼠标观察');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#bed7e2');
    this.scene.fog = new THREE.FogExp2('#c9d0d0', 0.00030);
    const sky = new Sky(); sky.scale.setScalar(8000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 2.5; uniforms.rayleigh.value = 0.75;
    uniforms.mieCoefficient.value = 0.003; uniforms.mieDirectionalG.value = 0.84;
    const sunVector = new THREE.Vector3(.639025,.612810,.464878).normalize();
    uniforms.sunPosition.value.copy(sunVector);
    this.scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene(); const envSky = sky.clone(); envScene.add(envSky);
    this.environment = pmrem.fromScene(envScene, 0.03, 0.1, 10000); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.23; pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#dbe7ec', '#817e72', 0.16));
    this.sun = new THREE.DirectionalLight('#fff5e7', 2.5); this.sun.position.copy(sunVector).multiplyScalar(300);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    Object.assign(this.sun.shadow.camera, { left: -210, right: 210, top: 200, bottom: -200, near: 1, far: 650 });
    this.sun.shadow.bias = -0.00004; this.sun.shadow.normalBias = 0.04; this.scene.add(this.sun);
    const assetManager=new THREE.LoadingManager();
    assetManager.onLoad=()=>{if(!this.dead){this.assetsReady=true;this.emit();}};
    this.world = buildWorld(this.scene,assetManager);
    this.signals = new TrafficSignals(this.scene,this.world.obstacles);
    this.characters = new Characters(this.scene,assetManager,this.world.obstacles,()=>this.notice('人物资源加载失败，请刷新重试。'),this.world.seats);
    this.traffic = new Traffic(this.scene,assetManager,this.world.obstacles,()=>this.notice('车辆资源加载失败，请刷新重试。'));
    const target = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
    this.composer = new EffectComposer(this.renderer,target);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.ao = new GTAOPass(this.scene,this.camera,1,1);
    this.ao.updateGtaoMaterial({radius:.65,thickness:.8,distanceFallOff:1,scale:1,samples:8,screenSpaceRadius:false});
    this.ao.updatePdMaterial({radius:4,rings:2,samples:8});this.ao.blendIntensity=.45;
    this.composer.addPass(this.ao);this.composer.addPass(new OutputPass());
    // One reflection probe captures real buildings and landscape, then is reused.
    new HDRLoader(assetManager).load('/assets/kloofendal_38d_partly_cloudy_puresky_1k.hdr', texture => {
      if(this.dead){texture.dispose();return;}
      texture.mapping=THREE.EquirectangularReflectionMapping;this.backgroundTexture=texture;
      const pm=new THREE.PMREMGenerator(this.renderer);this.environment.dispose();
      this.environment=pm.fromEquirectangular(texture);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.9;
      this.scene.background=texture;this.scene.backgroundIntensity=1;this.scene.backgroundBlurriness=0;sky.visible=false;
      this.renderer.shadowMap.needsUpdate=true;
      const capture=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType});
      const probe=new THREE.CubeCamera(.3,3000,capture);probe.position.set(0,28,58);probe.update(this.renderer,this.scene);
      this.reflection=pm.fromCubemap(capture.texture);this.world.glass.envMap=this.reflection.texture;this.world.glass.needsUpdate=true;
      this.traffic.setReflection(this.reflection.texture);
      capture.dispose();pm.dispose();this.renderer.shadowMap.needsUpdate=true;
    },undefined,()=>this.notice('天空贴图未能加载，已切换到程序天空。'));

    this.camera.position.copy(this.walkPosition); this.applyLook();
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enabled = false; this.orbit.enableDamping = true; this.orbit.minDistance = 170; this.orbit.maxDistance = 580;
    this.orbit.maxPolarAngle = Math.PI / 2.15; this.orbit.minPolarAngle = 0.18; this.orbit.target.set(0, 28, 0);
    this.listen(window, 'keydown', this.onKeyDown as EventListener);
    this.listen(window, 'keyup', ((e: KeyboardEvent) => { this.keys.delete(e.code); }) as EventListener);
    this.listen(window, 'blur', () => this.pause());
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.pause(); });
    this.listen(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.renderer.domElement;
      this.keys.clear(); this.tappedKeys.clear(); this.dragging = false;
      if (this.locked) {
        if (!this.wantsLock || document.hidden) { document.exitPointerLock(); this.active = false; }
        else { this.fallback = false; this.active = true; }
      } else { this.active = false; this.wantsLock = false; this.lockRequest++; }
      this.emit();
    });
    this.listen(document, 'pointerlockerror', () => { if (this.wantsLock && !document.hidden) this.enableFallback(); });
    this.listen(document, 'mousemove', this.onMouseMove as EventListener);
    this.listen(this.renderer.domElement, 'pointerdown', ((e: PointerEvent) => {
      if (this.mode === 'aerial') return;
      if(this.locked&&e.button===0&&!this.traffic.controlled){this.punch();return;}
      if (e.pointerType === 'touch') { this.active = true; this.fallback = true; }
      if (!this.active) { this.enter(); return; }
      if (!this.locked) { this.dragging = true; this.lastPointer = { x: e.clientX, y: e.clientY }; this.renderer.domElement.setPointerCapture(e.pointerId); }
    }) as EventListener);
    this.listen(this.renderer.domElement, 'pointermove', ((e: PointerEvent) => {
      if (this.dragging && !this.locked && this.mode !== 'aerial') {
        this.look(e.clientX - this.lastPointer.x, e.clientY - this.lastPointer.y);
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    }) as EventListener);
    this.listen(this.renderer.domElement, 'pointerup', () => { this.dragging = false; });
    this.listen(this.renderer.domElement, 'pointercancel', () => { this.dragging = false; this.keys.clear(); this.tappedKeys.clear(); });
    this.listen(this.renderer.domElement, 'webglcontextlost', ((e: Event) => { e.preventDefault(); this.pause(); this.notice('图形连接已中断，请刷新页面恢复场景。'); }) as EventListener);
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(container); this.resize();
    this.renderer.compile(this.scene, this.camera);
    this.emit(); this.frame = requestAnimationFrame(this.tick);
  }
  private listen(target: EventTarget, name: string, listener: EventListener) { target.addEventListener(name, listener); this.disposers.push(() => target.removeEventListener(name, listener)); }
  private resize = () => { const { clientWidth: w, clientHeight: h } = this.container; this.renderer.setSize(w, h); this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix(); if(this.composer){this.composer.setSize(w,h);this.ao.setSize(Math.max(1,Math.round(w*.72)),Math.max(1,Math.round(h*.72)));} };
  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('button,input,select,textarea')) return;
    if (e.code === 'Escape') { this.pause(); return; }
    if (e.code === 'KeyV' && !e.repeat) { this.setMode(this.mode === 'first' ? 'third' : 'first'); return; }
    if (e.code === 'KeyB' && !e.repeat) { this.setMode(this.mode === 'aerial' ? this.streetMode : 'aerial'); return; }
    if (e.code === 'KeyR' && !e.repeat) { this.reset(); return; }
    if (!this.active || this.mode === 'aerial') return;
    if(e.code==='KeyF'&&!e.repeat){e.preventDefault();this.interactVehicle();return;}
    if(e.code==='KeyJ'&&!e.repeat){e.preventDefault();this.punch();return;}
    if(e.code==='KeyE'&&!e.repeat){e.preventDefault();this.interactSeat();return;}
    if(e.code==='KeyQ'&&!e.repeat){e.preventDefault();this.toggleSprint();return;}
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)) {
      e.preventDefault(); this.keys.add(e.code); if (!e.repeat) this.tappedKeys.add(e.code);
      if(this.traffic.controlled)return;
      if(this.seating.frame.phase!=='none'){
        if(this.seating.frame.phase==='seated'&&!e.repeat&&!e.code.startsWith('Shift'))this.seating.stand(this.world.obstacles);
        return;
      }
      if(e.code==='Space'&&!e.repeat&&!this.attack.frame.active){const kind=jumpKind(this.playerSpeed);if(this.jump.request(kind))this.characters.prepareJump(kind);}
    }
  };
  private onMouseMove = (e: MouseEvent) => { if (this.locked && this.mode !== 'aerial') this.look(e.movementX, e.movementY); };
  private look(dx: number, dy: number) { this.lastDriveLook=this.elapsed;this.yaw -= dx * 0.0022; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.3, 1.35); this.applyLook(); }
  private applyLook() {
    if(this.traffic.controlled){this.updateDrivingCamera(1,true);return;}
    if(this.mode==='first'){this.camera.position.copy(this.walkPosition);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');}
    else if(this.mode==='third')this.updateFollow(1,true);
  }
  private updateFollow(dt:number,snap=false) {
    this.cameraTarget.set(this.walkPosition.x,this.walkPosition.y-.3,this.walkPosition.z);
    const offset=followOffset(this.yaw,THREE.MathUtils.clamp(this.pitch,-.8,.42));
    const desired=this.cameraTarget.clone().add(new THREE.Vector3(offset.x,offset.y,offset.z));
    const safe=resolveFollowCamera(this.cameraTarget,desired,this.cameraObstacles());
    if(snap)this.camera.position.set(safe.x,safe.y,safe.z);
    else this.camera.position.lerp(new THREE.Vector3(safe.x,safe.y,safe.z),1-Math.exp(-dt*14));
    const corrected=resolveFollowCamera(this.cameraTarget,this.camera.position,this.cameraObstacles());
    this.camera.position.set(corrected.x,corrected.y,corrected.z);this.camera.lookAt(this.cameraTarget);
  }
  private cameraObstacles(){const seat=this.seating.frame.seat,car=this.traffic.controlled;return this.world.obstacles.filter(o=>o!==seat?.obstacle&&o!==car?.obstacle);}
  private updateDrivingCamera(dt:number,snap=false){
    const car=this.traffic.controlled;if(!car||this.mode==='aerial')return;
    const desiredYaw=car.yaw+Math.PI;
    if(this.elapsed-this.lastDriveLook>1.6){const difference=THREE.MathUtils.euclideanModulo(desiredYaw-this.yaw+Math.PI,Math.PI*2)-Math.PI;this.yaw+=difference*(1-Math.exp(-dt*2.7));}
    if(this.mode==='first'){
      this.camera.position.copy(this.characters.driverEye(car.model).applyMatrix4(car.matrix));this.camera.rotation.set(THREE.MathUtils.clamp(this.pitch,-.65,.65),this.yaw,0,'YXZ');
    }else{
      this.cameraTarget.set(car.position.x,car.position.y+(car.model==='concept'?.8:1.2),car.position.z);
      const offset=followOffset(this.yaw,THREE.MathUtils.clamp(this.pitch,-.65,-.12),7.1+Math.abs(car.speed)*.07);
      const desired=this.cameraTarget.clone().add(new THREE.Vector3(offset.x,offset.y+.45,offset.z));
      const safe=resolveFollowCamera(this.cameraTarget,desired,this.cameraObstacles());
      if(snap)this.camera.position.set(safe.x,safe.y,safe.z);else this.camera.position.lerp(new THREE.Vector3(safe.x,safe.y,safe.z),1-Math.exp(-dt*9));
      const corrected=resolveFollowCamera(this.cameraTarget,this.camera.position,this.cameraObstacles());this.camera.position.set(corrected.x,corrected.y,corrected.z);this.camera.lookAt(this.cameraTarget);
    }
  }
  private enableFallback() { if (this.dead || this.mode === 'aerial') return; this.fallback = true; this.active = true; this.notice('已启用拖动观察：按住画面拖动，WASD 自由移动。'); this.emit(); }
  enter() {
    if (this.mode === 'aerial') this.setMode(this.streetMode);
    this.active = true; this.wantsLock = true; const request = ++this.lockRequest; this.renderer.domElement.focus();
    if (typeof this.renderer.domElement.requestPointerLock !== 'function') { this.enableFallback(); return; }
    try { const p = this.renderer.domElement.requestPointerLock(); if (p) p.catch(() => { if (request === this.lockRequest && this.wantsLock && !document.hidden) this.enableFallback(); }); } catch { this.enableFallback(); }
    this.emit();
  }
  pause() { this.wantsLock = false; this.lockRequest++; this.active = false; this.keys.clear(); this.tappedKeys.clear(); this.dragging = false; if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock(); this.emit(); }
  setMode(mode: ViewMode) {
    if(mode===this.mode)return;
    const wasStreet=this.mode!=='aerial',isStreet=mode!=='aerial';
    if(!isStreet||!wasStreet)this.pause();
    if(isStreet)this.streetMode=mode;
    this.mode=mode;this.orbit.enabled=mode==='aerial';
    if(this.traffic.controlled&&isStreet)this.pitch=mode==='first'?0:-.22;
    if(mode==='aerial') {this.camera.position.set(195,220,330);this.orbit.target.set(0,30,-10);this.orbit.update();}
    else {if(mode==='third')this.pitch=Math.min(this.pitch,-.08);this.applyLook();}
    if(this.active)this.renderer.domElement.focus();
    this.emit();
  }
  reset() { this.teleport(SPAWN.x,SPAWN.z,SPAWN.yaw,this.mode==='first'?SPAWN.pitch:-.12);this.notice('已回到滨海广场入口'); }
  teleport(x:number,z:number,yaw:number,pitch=.14) {
    const arrival=clearArrival(x,z,this.world.obstacles);if(!arrival){this.notice('目的地暂时没有空位，请稍后重试。');return;}x=arrival.x;z=arrival.z;
    this.traffic.releaseControl();this.attack.reset();this.pause();if(this.mode==='aerial')this.mode=this.streetMode;this.orbit.enabled=false;this.yaw=yaw;
    this.pitch=this.mode==='third'?-.12:pitch;this.walkPosition.set(x,EYE_HEIGHT,z);this.jump.reset();this.seating.reset();this.velocity={x:0,z:0};this.moveSpeed=0;
    this.characterYaw=yaw+Math.PI;this.applyLook();this.emit();
  }
  setQuality(quality: number) {
    this.quality = quality; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, [1, 1.5, 2][quality]));
    this.renderer.shadowMap.enabled = quality > 0; this.sun.shadow.mapSize.setScalar(quality === 0 ? 1024 : 4096);
    this.ao.enabled=quality>0;this.ao.blendIntensity=quality===2?.55:.45;this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; this.renderer.shadowMap.needsUpdate = true; this.resize();
  }
  touchMove(code: string, down: boolean) { if (down) { if (this.mode === 'aerial') this.setMode(this.streetMode); this.active = true; this.fallback = true; this.keys.add(code); } else this.keys.delete(code); this.emit(); }
  interactSeat(){
    if(this.traffic.controlled||this.attack.frame.active||this.mode==='aerial'||this.jump.frame.phase!=='grounded')return;
    if(this.seating.frame.phase==='seated')this.seating.stand(this.world.obstacles);
    else if(this.seating.frame.phase==='none'){
      const seat=nearestSeat(this.walkPosition,this.world.seats,this.world.obstacles);
      if(!seat||!this.seating.request(seat,this.walkPosition,this.world.obstacles))return;
    }else return;
    this.keys.clear();this.tappedKeys.clear();this.velocity={x:0,z:0};this.moveSpeed=0;
    this.active=true;if(!this.locked)this.fallback=true;this.renderer.domElement.focus();this.emit();
  }
  interactVehicle(){
    if(this.mode==='aerial'||this.seating.frame.phase!=='none'||this.jump.frame.phase!=='grounded'||this.attack.frame.active)return;
    const car=this.traffic.controlled;
    if(car){
      if(Math.abs(car.speed)>.5){this.notice('先按空格刹停，再按 F 下车。');return;}
      const exit=this.traffic.exitPosition();if(!exit){this.notice('车门旁没有空位，请把车移到宽敞的位置。');return;}
      this.traffic.releaseControl();this.walkPosition.set(exit.x,groundHeight(exit.x,exit.z)+EYE_HEIGHT,exit.z);this.characterYaw=exit.yaw;this.yaw=exit.yaw+Math.PI;this.pitch=-.12;
      this.notice('已下车 · 车辆会留在这里，可以再次驾驶。');
    }else{
      const nearest=this.traffic.nearestVehicle(this.walkPosition);if(!nearest||!this.traffic.takeControl(nearest))return;
      this.yaw=nearest.yaw+Math.PI;this.pitch=this.mode==='first'?0:-.22;this.lastDriveLook=-10;
      this.walkPosition.copy(nearest.position);this.notice('W 加速 · S 刹车/倒车 · A/D 转向 · 空格急刹 · F 下车');
    }
    this.keys.clear();this.tappedKeys.clear();this.velocity={x:0,z:0};this.moveSpeed=0;this.sprintToggled=false;this.attack.reset();this.active=true;if(!this.locked)this.fallback=true;this.renderer.domElement.focus();this.applyLook();this.emit();
  }
  punch(){
    if(this.traffic.controlled||this.mode==='aerial'||this.seating.frame.phase!=='none'||this.jump.frame.phase!=='grounded'||!this.assetsReady)return;
    if(!this.attack.request())return;
    this.characterYaw=this.yaw+Math.PI;this.moveSpeed=0;this.velocity={x:0,z:0};this.active=true;if(!this.locked)this.fallback=true;this.renderer.domElement.focus();
  }
  toggleSprint(){if(this.traffic.controlled)return;this.sprintToggled=!this.sprintToggled;if(this.active)this.renderer.domElement.focus();this.emit();}
  private zone() { const { x, z } = this.walkPosition; if (Math.abs(x) > 132 || Math.abs(z) > 130) return '环岛滨水步道'; if (z>70&&z<108&&Math.abs(x)>18&&Math.abs(x)<30) return '海风市集'; if (z > 52 && Math.abs(x) < 35) return '滨海广场'; if (Math.abs(x) < 33 && z < 40 && z > -55) return '潮汐之塔'; if (Math.abs(Math.abs(x) - 48) < 16) return '棕榈大道'; return '蓝湾街区'; }
  private emit(fps = 0) {
    this.report({ ready: this.assetsReady, locked: this.locked, active: this.active, mode: this.mode, x: this.walkPosition.x, z: this.walkPosition.z, yaw: this.yaw, fps,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, zone: this.mode === 'aerial' ? '全城鸟瞰' : this.zone(), fallback: this.fallback, sprinting:this.sprintToggled||this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'), seated:this.seating.frame.phase==='seated', driving:!!this.traffic.controlled,vehicleName:this.traffic.controlled?.model==='concept'?'AERIS GT · 跑车':'ROVER · 城市 SUV',vehicleSpeed:Math.round(Math.abs(this.traffic.controlled?.speed??0)*3.6),vehicleGear:(this.traffic.controlled?.speed??0)<-.1?'R':Math.abs(this.traffic.controlled?.speed??0)<.1?'N':'D',vehicleInteraction:this.mode==='aerial'?null:this.traffic.controlled?'exit':this.nearbyVehicle&&this.seating.frame.phase==='none'?'enter':null,attackHit:this.elapsed<this.hitUntil, interaction:this.mode==='aerial'||this.traffic.controlled?null:this.seating.frame.phase==='seated'?'stand':this.seating.frame.phase!=='none'?'busy':this.nearbySeat?'sit':null });
  }
  private tick = (now: number) => {
    if (this.dead) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.prev ? (now - this.prev) / 1000 : 0.016, 0.05); this.prev = now;
    if (document.hidden) return;
    this.elapsed += dt; this.frames++;
    this.signals.update(this.elapsed);
    const car=this.traffic.controlled,held=(key:string)=>this.keys.has(key)||this.tappedKeys.has(key);
    const previousVehicles=this.traffic.poses();
    this.traffic.cockpitView=!!car&&this.mode==='first';
    const attackFrame=this.attack.update(dt);
    if(car){
      const enabled=this.active&&this.mode!=='aerial';
      const throttle=enabled?Number(held('KeyW')||held('ArrowUp'))-Number(held('KeyS')||held('ArrowDown')):0;
      const steer=enabled?Number(held('KeyD')||held('ArrowRight'))-Number(held('KeyA')||held('ArrowLeft')):0;
      const collision=this.traffic.drive(dt,{throttle,steer,brake:!enabled||held('Space')?1:0});
      if(collision&&this.elapsed-this.collisionNotice>3){this.notice('前方有障碍 · 松开油门，倒车调整方向。');this.collisionNotice=this.elapsed;}
      this.walkPosition.copy(car.position);this.characterYaw=car.yaw;this.tappedKeys.clear();
    }
    this.traffic.update(dt,this.walkPosition,this.signals,this.elapsed);
    const impactHits=this.characters.updateVehicleImpacts(previousVehicles,this.traffic.poses(),dt,this.elapsed,this.traffic.environment().obstacles,pose=>this.traffic.stopBeforeImpact(pose));
    for(const [id,hits] of impactHits)this.traffic.absorbImpact(id,hits);
    if(car){this.walkPosition.copy(car.position);this.characterYaw=car.yaw;}
    const wasSeating=this.seating.frame.phase!=='none',seatFrame=this.seating.update(dt,this.world.obstacles);
    const wasJumping=this.jump.frame.phase!=='grounded',jumpFrame=this.jump.update(dt);
    this.playerSpeed=0;
    if(car){this.playerSpeed=0;}else if(wasSeating){
      this.walkPosition.x=seatFrame.x;this.walkPosition.z=seatFrame.z;this.characterYaw=seatFrame.yaw;
      this.playerSpeed=seatFrame.speed;this.velocity={x:0,z:0};this.moveSpeed=0;
    }else {
      let desired={x:0,z:0};
      if(this.mode!=='aerial'&&this.active){
        const held=(key:string)=>this.keys.has(key)||this.tappedKeys.has(key);
        const forward=Number(held('KeyW')||held('ArrowUp'))-Number(held('KeyS')||held('ArrowDown'));
        const right=Number(held('KeyD')||held('ArrowRight'))-Number(held('KeyA')||held('ArrowLeft'));
        this.moveSpeed=locomotionSpeed(this.moveSpeed,forward!==0||right!==0,this.sprintToggled||held('ShiftLeft')||held('ShiftRight'),dt);
        const direction=movementVector(forward,right,this.yaw,this.moveSpeed,1);desired={x:direction.dx,z:direction.dz};
      }else this.moveSpeed=0;
      if(attackFrame.active){const stride=attackFrame.time<.15?.55:0;desired={x:Math.sin(this.characterYaw)*stride,z:Math.cos(this.characterYaw)*stride};this.moveSpeed=0;}
      this.tappedKeys.clear();
      this.velocity=wasJumping?jumpVelocity(this.velocity,desired,jumpFrame.phase,dt):desired;
      const previous={x:this.walkPosition.x,z:this.walkPosition.z};
      const next=moveWithCollisions(previous.x,previous.z,this.velocity.x*dt,this.velocity.z*dt,this.world.obstacles);
      this.velocity={x:(next.x-previous.x)/dt,z:(next.z-previous.z)/dt};
      this.playerSpeed=Math.hypot(this.velocity.x,this.velocity.z);
      if(!attackFrame.active&&this.playerSpeed>.05&&jumpFrame.phase!=='airborne'&&jumpFrame.phase!=='takeoff')this.characterYaw=Math.atan2(this.velocity.x,this.velocity.z);
      this.walkPosition.x=next.x;this.walkPosition.z=next.z;
    }
    if(this.mode==='aerial')this.orbit.update();
    const ground=seatFrame.seat&&['sitDown','seated','standUp'].includes(seatFrame.phase)?seatFrame.seat.ground:groundHeight(this.walkPosition.x,this.walkPosition.z);
    this.walkPosition.y=ground+EYE_HEIGHT+jumpFrame.height-.52*seatFrame.progress;
    this.nearbyVehicle=!car&&seatFrame.phase==='none'&&jumpFrame.phase==='grounded'?this.traffic.nearestVehicle(this.walkPosition):undefined;
    if(attackFrame.contact&&this.characters.strike(this.walkPosition,this.characterYaw,this.elapsed))this.hitUntil=this.elapsed+.22;
    this.nearbySeat=seatFrame.phase==='none'&&jumpFrame.phase==='grounded'?nearestSeat(this.walkPosition,this.world.seats,this.world.obstacles):undefined;
    if(car)this.updateDrivingCamera(dt);else if(this.mode==='first')this.applyLook();else if(this.mode==='third')this.updateFollow(dt);
    const feet=new THREE.Vector3(this.walkPosition.x,ground+jumpFrame.height,this.walkPosition.z);
    if(car)this.characters.updateDriver(car.matrix,car.yaw,car.model,this.mode!=='first',dt);
    else this.characters.updatePlayer(feet,this.characterYaw,this.playerSpeed,this.mode==='third'&&this.camera.position.distanceTo(this.cameraTarget)>1,dt,jumpFrame,seatFrame,attackFrame);
    this.characters.update(this.elapsed,this.walkPosition,this.mode==='aerial');
    this.world.update(this.elapsed);
    if(this.elapsed-this.lastShadow>.12){this.renderer.shadowMap.needsUpdate=true;this.lastShadow=this.elapsed;}
    this.renderer.info.autoReset=false;this.renderer.info.reset();
    this.composer.render(dt);
    // The island is static. Reuse its shadow map between frames.
    this.renderer.shadowMap.autoUpdate = false;
    if (now - this.lastReport > 200) { this.emit(Math.round(this.frames * 1000 / (now - this.lastReport))); this.frames = 0; this.lastReport = now; }
  };
  dispose() {
    this.dead = true; cancelAnimationFrame(this.frame); this.pause(); this.disposers.forEach(fn => fn()); this.resizeObserver.disconnect(); this.orbit.dispose();
    this.signals.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(obj => { if (obj instanceof THREE.InstancedMesh) obj.dispose(); if (obj instanceof THREE.Mesh) { geometries.add(obj.geometry); (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.environment.dispose();this.reflection?.dispose();this.backgroundTexture?.dispose();this.characters.dispose();this.traffic.dispose();
    for(const m of materials){for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();}
    this.composer.passes.forEach(p=>p.dispose());this.composer.dispose();this.sun.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
