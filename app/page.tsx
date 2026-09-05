'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Compass, Eye, UserRound, Footprints, Layers3, LocateFixed, Map, Maximize, Mouse, RotateCcw, Waves, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CityEngine, CityState } from '@/lib/city/engine';
import { TOWERS } from '@/lib/city/world';
const INITIAL: CityState = { ready: false, locked: false, active: false, mode: 'third', x: 18, z: 116, yaw: 0.15, fps: 0, calls: 0, triangles: 0, zone: '滨海广场', fallback: false, sprinting:false, seated:false, interaction:null };
export default function CityPage() {
  const container = useRef<HTMLDivElement>(null), engine = useRef<CityEngine | null>(null);
  const [state, setState] = useState(INITIAL), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [mapOpen, setMapOpen] = useState(true), [quality, setQuality] = useState(1), [help, setHelp] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import('@/lib/city/engine').then(({ CityEngine }) => {
      if (cancelled || !container.current) return;
      try { engine.current = new CityEngine(container.current, s => { if (!cancelled) setState(s); }, setToast); }
      catch (e) { console.error(e); setError('无法启动三维场景。请启用浏览器硬件加速，并使用支持 WebGL 2 的浏览器。'); }
    }).catch(e => { console.error(e); setError('场景加载失败，请刷新重试。'); });
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'KeyM' && !e.repeat && !(e.target as HTMLElement)?.closest('button,input')) setMapOpen(v => !v); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const switchQuality = () => { const q = (quality + 1) % 3; setQuality(q); engine.current?.setQuality(q); };
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => setToast('当前浏览器无法退出全屏')); else document.documentElement.requestFullscreen?.().catch(() => setToast('当前窗口不支持全屏，可在浏览器中打开')); };
  return <main className={`city-app ${state.active ? 'is-playing' : ''}`}>
    <div ref={container} className="scene-container" />
    <div className="scene-vignette" />
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Waves size={25} strokeWidth={1.4} /></div><div><span className="brand-name">PELAGIA<span className="brand-dot">®</span></span><span className="brand-caption">未来海岸 · 自由探索</span></div></div>
      <div className="top-middle"><span className="live-dot" /> 开放世界 <span className="divider">/</span> 01 — 蓝湾</div>
      <nav className="top-actions" aria-label="视角与画面设置">
        <div className="view-switch">
          <Button className={state.mode === 'first' ? 'nav-button selected' : 'nav-button'} onClick={() => engine.current?.setMode('first')} aria-pressed={state.mode === 'first'} disabled={!state.ready}><Eye />第一人称</Button>
          <Button className={state.mode === 'third' ? 'nav-button selected' : 'nav-button'} onClick={() => engine.current?.setMode('third')} aria-pressed={state.mode === 'third'} disabled={!state.ready}><UserRound />第三人称</Button>
          <Button className={state.mode === 'aerial' ? 'nav-button selected' : 'nav-button'} onClick={() => engine.current?.setMode('aerial')} aria-pressed={state.mode === 'aerial'} disabled={!state.ready}><Layers3 />鸟瞰</Button>
        </div>
        <Button className="square-button" aria-label="切换全屏" title="全屏" onClick={fullscreen}><Maximize /></Button>
      </nav>
    </header>
    <div className="coordinate-line"><span>BLUE BAY DISTRICT</span><span>22° N &nbsp; 114° E</span></div>
    <div className="compass"><span>W</span><i /><span>N</span><b style={{ transform: `rotate(${-state.yaw * 180 / Math.PI}deg)` }}>⌃</b><span>E</span></div>
    {state.active && state.mode === 'first' && <div className="crosshair" aria-hidden="true" />}
    {!state.ready && <div className="loading-screen"><div className="loading-symbol"><Waves size={40} /></div><h1>{error ? '暂时无法进入' : '正在构建未来海岸'}</h1><p>{error || '连接街道、花园与海洋…'}</p>{error && <Button className="enter-button" onClick={() => window.location.reload()}>重新加载</Button>}<div className={error ? '' : 'loading-bar'} /></div>}
    {state.ready && <>
      <aside className="location-panel">
        <div className="eyebrow"><span className="location-number">01</span><span>THE WATERFRONT CITY</span></div>
        <h1>{state.zone}<span className="title-period">.</span></h1>
        <p>{state.mode === 'aerial' ? '海与城之间，发现新的视角。' : '循着海风，走进明日之城。'}</p>
        <div className="location-detail"><span><span className="live-dot" /> 自由探索</span><span>午后 · 海风轻拂</span></div>
        <div className="destination-links">
          <button onClick={() => engine.current?.teleport(18, 116, 0.15, 0.24)} title="前往滨海广场">广场 <ArrowRight size={12} /></button>
          <button onClick={() => engine.current?.teleport(18.7, 102.7, -1.1, .05)} title="前往海风市集">市集 <ArrowRight size={12} /></button>
          <button onClick={() => engine.current?.teleport(-48, 30, -0.25, 0.2)} title="前往棕榈大道">大道 <ArrowRight size={12} /></button>
          <button onClick={() => engine.current?.teleport(138, 105, 0.8, 0.13)} title="前往滨水步道">滨水 <ArrowRight size={12} /></button>
          <button onClick={() => engine.current?.teleport(68, 74, -Math.PI/2, 0)} title="前往服饰与琴行街区">商街 <ArrowRight size={12} /></button>
          <button onClick={() => engine.current?.teleport(19.8, 106.6, .39, -.08)} title="前往广场座椅">休息 <ArrowRight size={12} /></button>
        </div>
      </aside>
      {!state.active && state.mode !== 'aerial' && <div className="entry-prompt"><Button className="enter-button" onClick={() => engine.current?.enter()}><Footprints size={18} />进入街区 <ArrowRight size={17} /></Button><span>WASD 移动 · Shift 加速 · 空格跳跃</span></div>}
      {state.mode === 'aerial' && <div className="aerial-hint"><Mouse size={16} /> 拖动旋转 · 滚轮缩放 <button onClick={() => engine.current?.enter()}>返回街区 <ArrowRight size={13} /></button></div>}
      {state.interaction && state.interaction!=='busy' && <button className="seat-interaction" onClick={() => engine.current?.interactSeat()}><kbd>E</kbd>{state.interaction==='stand'?'起身':'坐下休息'}</button>}
      {state.active && <div className="playing-hint">{state.fallback ? '按住画面拖动观察' : '鼠标环顾'}<span>ESC 释放鼠标</span></div>}
      <aside className={`map-panel ${mapOpen ? '' : 'map-collapsed'}`}>
        <div className="map-header"><span><Map size={14} /> 街区导航</span><button onClick={() => setMapOpen(!mapOpen)} aria-label={mapOpen ? '收起地图' : '展开地图'}>{mapOpen ? '−' : '+'}</button></div>
        {mapOpen && <><svg viewBox="0 0 300 300" className="minimap" role="img" aria-label="城市地图，青色箭头标注当前位置">
          <rect width="300" height="300" fill="#233c45" />
          <rect x="10" y="10" width="280" height="280" rx="5" fill="#839895" opacity=".18" />
          {[-96,0,96].flatMap(x => [-96,0,96].map(z => <rect key={`${x},${z}`} x={(x+150)*.92+12-31} y={(z+150)*.92+12-31} width="62" height="62" rx="5" fill="#59756f" opacity=".55" />))}
          {[-48,48].map(v => <path key={`v${v}`} d={`M${(v+150)*.92+12} 15 V285`} stroke="#d1e1d8" strokeWidth="1" opacity=".45" />)}
          {[-132,-48,48,132].map(v => <path key={`h${v}`} d={`M15 ${(v+150)*.92+12} H285`} stroke="#d1e1d8" strokeWidth="1" opacity=".4" />)}
          {TOWERS.map(t => <ellipse key={t.name} cx={(t.x+150)*.92+12} cy={(t.z+150)*.92+12} rx={(t.r+6)*.92} ry={(t.r+6)*.72} fill="#bfd0c8" opacity=".8" />)}
          <circle cx="150" cy="231" r="15" fill="none" stroke="#9fc7c9" strokeWidth="2" />
          <path d="M61 69 Q112 69 150 135 Q211 173 241 139 M145 52 Q200 30 226 64" stroke="#cce2d8" strokeWidth="3" fill="none" opacity=".5" />
          {state.mode !== 'aerial' && <g transform={`translate(${(state.x+150)*.92+12} ${(state.z+150)*.92+12}) rotate(${-state.yaw*180/Math.PI})`}><circle r="12" fill="#81ddd0" opacity=".16" /><path d="M0 -8 L6 6 L0 3 L-6 6 Z" fill="#9fffe7" stroke="#193e3a" strokeWidth="1.2" /></g>}
          <text x="272" y="28" fill="#d0e5e2" fontSize="13">N</text>
        </svg><div className="map-footer"><span><span className="map-dot" /> {state.mode !== 'aerial' ? '你的位置' : '蓝湾全境'}</span><span>0 ─── 100 m</span></div></>}
      </aside>
      <footer className="bottom-bar"><div className="keyboard-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span><span><kbd>SHIFT</kbd> 加速跑</span><span><kbd>SPACE</kbd> 跳跃</span><span><kbd>V</kbd> 人称</span></div><div className="bottom-tools"><button className="sprint-button" aria-pressed={state.sprinting} title="按住 Shift 加速；Q 或点击切换持续跑步" onClick={() => engine.current?.toggleSprint()}><Footprints size={14} /><span>{state.sprinting ? '跑步 · 开' : '加速跑步'}</span></button><button onClick={() => engine.current?.reset()} title="重置位置 R"><RotateCcw size={14} /><span>重置</span></button><button onClick={switchQuality}>画质 · {['流畅','均衡','精致'][quality]}</button><span className="fps"><i />{state.fps || '—'} FPS</span><button onClick={() => { engine.current?.pause(); setHelp(!help); }} aria-label="操作帮助">?</button></div></footer>
      <div className="touch-controls" style={state.mode === 'aerial' ? { display: 'none' } : undefined}>{[['KeyW',ArrowUp],['KeyA',ArrowLeft],['KeyS',ArrowDown],['KeyD',ArrowRight]].map(([code,Icon]) => { const Arrow = Icon as typeof ArrowUp; return <button key={code as string} aria-label={`${code} 移动`} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); engine.current?.touchMove(code as string,true); }} onPointerUp={() => engine.current?.touchMove(code as string,false)} onPointerCancel={() => engine.current?.touchMove(code as string,false)}><Arrow /></button>; })}</div>
    </>}
    {help && <div className="help-panel"><button className="help-close" aria-label="关闭帮助" onClick={() => setHelp(false)}><X size={18} /></button><Compass size={24} /><h2>探索这座城</h2><p>点击「进入街区」后，使用 WASD 移动、鼠标转头。按住 Shift 加速跑，Q 或底部按钮切换持续跑步；空格跳跃。靠近座椅时按 E 坐下，再按 E 或方向键起身。</p><p>Esc 暂停并释放鼠标。V 切换第一 / 第三人称，B 切换鸟瞰，M 收放地图，R 返回入口。也可以使用左下角地点快速前往街区。</p><p>若浏览器不允许锁定鼠标，可按住画面拖动观察。</p><a href="/credits.html" target="_blank" rel="noreferrer" style={{fontSize:12,textDecoration:"underline",color:"#bdd8d0"}}>素材鸣谢与许可</a></div>}
    {toast && <div className="toast" role="status"><LocateFixed size={16} />{toast}</div>}
  </main>;
}
