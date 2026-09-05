import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld } from './world';
import { EYE_HEIGHT, SPAWN, moveWithCollisions, movementVector } from './movement';

export type ViewMode = 'walk' | 'aerial';
export type CityState = { ready: boolean; locked: boolean; active: boolean; mode: ViewMode; x: number; z: number; yaw: number; fps: number; calls: number; triangles: number; zone: string; fallback: boolean };
export class CityEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, 1, 0.15, 12000);
  orbit: OrbitControls;
  world: ReturnType<typeof buildWorld>;
  mode: ViewMode = 'walk';
  active = false;
  locked = false;
  fallback = false;
  yaw = SPAWN.yaw;
  pitch = SPAWN.pitch;
  keys = new Set<string>();
  private tappedKeys = new Set<string>();
  quality = 1;
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
  private verticalSpeed = 0;
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
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '未来海岸三维场景，点击后使用 WASD 移动，鼠标观察');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#bed7e2');
    this.scene.fog = new THREE.FogExp2('#c1d0d5', 0.00065);
    const sky = new Sky(); sky.scale.setScalar(8000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 2.5; uniforms.rayleigh.value = 0.75;
    uniforms.mieCoefficient.value = 0.003; uniforms.mieDirectionalG.value = 0.84;
    const sunVector = new THREE.Vector3(-0.8, 1.1, 0.65).normalize();
    uniforms.sunPosition.value.copy(sunVector);
    this.scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene(); const envSky = sky.clone(); envScene.add(envSky);
    this.environment = pmrem.fromScene(envScene, 0.03, 0.1, 10000); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.23; pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#d5ebff', '#7b8270', 0.42));
    this.sun = new THREE.DirectionalLight('#fff4dc', 3.0); this.sun.position.set(-130, 180, 120);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    Object.assign(this.sun.shadow.camera, { left: -210, right: 210, top: 200, bottom: -200, near: 1, far: 650 });
    this.sun.shadow.bias = -0.00004; this.sun.shadow.normalBias = 0.04; this.scene.add(this.sun);
    this.world = buildWorld(this.scene);
    const target = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
    this.composer = new EffectComposer(this.renderer,target);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.ao = new GTAOPass(this.scene,this.camera,1,1);
    this.ao.updateGtaoMaterial({radius:1.6,thickness:1.3,distanceFallOff:1,scale:1,samples:8,screenSpaceRadius:false});
    this.ao.updatePdMaterial({radius:4,rings:2,samples:8});this.ao.blendIntensity=.75;
    this.composer.addPass(this.ao);this.composer.addPass(new OutputPass());
    // One reflection probe captures real buildings and landscape, then is reused.
    new HDRLoader().load('/assets/kloppenheim_05_puresky_1k.hdr', texture => {
      if(this.dead){texture.dispose();return;}
      texture.mapping=THREE.EquirectangularReflectionMapping;this.backgroundTexture=texture;
      const pm=new THREE.PMREMGenerator(this.renderer);this.environment.dispose();
      this.environment=pm.fromEquirectangular(texture);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;
      this.scene.background=texture;this.scene.backgroundIntensity=1.3;this.scene.backgroundBlurriness=.025;sky.visible=false;
      this.renderer.shadowMap.needsUpdate=true;
      const capture=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});
      const probe=new THREE.CubeCamera(.3,3000,capture);probe.position.set(0,28,58);probe.update(this.renderer,this.scene);
      this.environment.dispose();this.environment=pm.fromCubemap(capture.texture);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.8;
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
      if (this.mode !== 'walk') return;
      if (e.pointerType === 'touch') { this.active = true; this.fallback = true; }
      if (!this.active) { this.enter(); return; }
      if (!this.locked) { this.dragging = true; this.lastPointer = { x: e.clientX, y: e.clientY }; this.renderer.domElement.setPointerCapture(e.pointerId); }
    }) as EventListener);
    this.listen(this.renderer.domElement, 'pointermove', ((e: PointerEvent) => {
      if (this.dragging && !this.locked && this.mode === 'walk') {
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
    if (e.code === 'KeyV' && !e.repeat) { this.setMode(this.mode === 'walk' ? 'aerial' : 'walk'); return; }
    if (e.code === 'KeyR' && !e.repeat) { this.reset(); return; }
    if (!this.active || this.mode !== 'walk') return;
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)) {
      e.preventDefault(); this.keys.add(e.code); if (!e.repeat) this.tappedKeys.add(e.code);
      if (e.code === 'Space' && this.camera.position.y <= EYE_HEIGHT + 0.01) this.verticalSpeed = 4.4;
    }
  };
  private onMouseMove = (e: MouseEvent) => { if (this.locked && this.mode === 'walk') this.look(e.movementX, e.movementY); };
  private look(dx: number, dy: number) { this.yaw -= dx * 0.0022; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.3, 1.35); this.applyLook(); }
  private applyLook() { this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
  private enableFallback() { if (this.dead || this.mode !== 'walk') return; this.fallback = true; this.active = true; this.notice('已启用拖动观察：按住画面拖动，WASD 自由移动。'); this.emit(); }
  enter() {
    if (this.mode === 'aerial') this.setMode('walk');
    this.active = true; this.wantsLock = true; const request = ++this.lockRequest; this.renderer.domElement.focus();
    if (typeof this.renderer.domElement.requestPointerLock !== 'function') { this.enableFallback(); return; }
    try { const p = this.renderer.domElement.requestPointerLock(); if (p) p.catch(() => { if (request === this.lockRequest && this.wantsLock && !document.hidden) this.enableFallback(); }); } catch { this.enableFallback(); }
    this.emit();
  }
  pause() { this.wantsLock = false; this.lockRequest++; this.active = false; this.keys.clear(); this.tappedKeys.clear(); this.dragging = false; if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock(); this.emit(); }
  setMode(mode: ViewMode) {
    if (mode === this.mode) return;
    this.pause();
    if (mode === 'aerial') {
      this.walkPosition.copy(this.camera.position); this.walkPosition.y = EYE_HEIGHT;
      this.camera.position.set(195, 240, 360); this.orbit.target.set(0, 34, -10); this.orbit.enabled = true; this.orbit.update();
    } else { this.orbit.enabled = false; this.camera.position.copy(this.walkPosition); this.applyLook(); }
    this.mode = mode; this.emit();
  }
  reset() { this.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw, SPAWN.pitch); this.notice('已回到滨海广场入口'); }
  teleport(x: number, z: number, yaw: number, pitch = 0.14) {
    this.pause(); this.mode = 'walk'; this.orbit.enabled = false; this.yaw = yaw; this.pitch = pitch;
    this.camera.position.set(x, EYE_HEIGHT, z); this.walkPosition.copy(this.camera.position); this.verticalSpeed = 0; this.applyLook(); this.emit();
  }
  setQuality(quality: number) {
    this.quality = quality; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, [1, 1.5, 2][quality]));
    this.renderer.shadowMap.enabled = quality > 0; this.sun.shadow.mapSize.setScalar(quality === 0 ? 1024 : 4096);
    this.ao.enabled=quality>0;this.ao.blendIntensity=quality===2?.9:.75;this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; this.renderer.shadowMap.needsUpdate = true; this.resize();
  }
  touchMove(code: string, down: boolean) { if (down) { if (this.mode !== 'walk') this.setMode('walk'); this.active = true; this.fallback = true; this.keys.add(code); } else this.keys.delete(code); this.emit(); }
  private zone() { const { x, z } = this.camera.position; if (Math.abs(x) > 132 || Math.abs(z) > 130) return '环岛滨水步道'; if (z > 52 && Math.abs(x) < 35) return '滨海广场'; if (Math.abs(x) < 33 && z < 40 && z > -55) return '潮汐之塔'; if (Math.abs(Math.abs(x) - 48) < 16) return '棕榈大道'; return '蓝湾街区'; }
  private emit(fps = 0) {
    this.report({ ready: true, locked: this.locked, active: this.active, mode: this.mode, x: this.camera.position.x, z: this.camera.position.z, yaw: this.yaw, fps,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, zone: this.mode === 'aerial' ? '全城鸟瞰' : this.zone(), fallback: this.fallback });
  }
  private tick = (now: number) => {
    if (this.dead) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.prev ? (now - this.prev) / 1000 : 0.016, 0.05); this.prev = now;
    if (document.hidden) return;
    this.elapsed += dt; this.frames++;
    if (this.mode === 'walk' && this.active) {
      const held = (key: string) => this.keys.has(key) || this.tappedKeys.has(key);
      const forward = Number(held('KeyW') || held('ArrowUp')) - Number(held('KeyS') || held('ArrowDown'));
      const right = Number(held('KeyD') || held('ArrowRight')) - Number(held('KeyA') || held('ArrowLeft'));
      this.tappedKeys.clear();
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 11 : 5.4;
      const { dx, dz } = movementVector(forward, right, this.yaw, speed, dt);
      const p = moveWithCollisions(this.camera.position.x, this.camera.position.z, dx, dz, this.world.obstacles);
      this.camera.position.x = p.x; this.camera.position.z = p.z;
      this.verticalSpeed -= 13 * dt; this.camera.position.y = Math.max(EYE_HEIGHT, this.camera.position.y + this.verticalSpeed * dt);
      if (this.camera.position.y === EYE_HEIGHT) this.verticalSpeed = 0;
    } else if (this.mode === 'aerial') this.orbit.update();
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
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(obj => { if (obj instanceof THREE.InstancedMesh) obj.dispose(); if (obj instanceof THREE.Mesh) { geometries.add(obj.geometry); (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m)); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.environment.dispose();this.backgroundTexture?.dispose();
    for(const m of materials){for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();}
    this.composer.passes.forEach(p=>p.dispose());this.composer.dispose();this.sun.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
