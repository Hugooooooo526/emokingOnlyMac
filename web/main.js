// 把输入、循环、存档和原生外壳接起来。
(function () {
  'use strict';

  const FRAME_MS = 1000 / 30;
  const CALM_MS = 200;
  const HINTS = {
    empty: '点烟盒，拿一支烟',
    unlit: '点打火机，点着它',
    lit: '按住烟或空格吸一口，松手吐烟',
    ash: '点烟头抖灰，拖动物件可以挪窗口',
    out: '灭了。点打火机重点，或点烟盒换一支',
    busy: '手上还有一支，点烟灰缸掐灭',
    noCig: '先点烟盒拿一支烟',
    notLit: '还没点着，先点打火机',
  };

  const boot = window.__EMOKING_BOOT || {};
  // Mac 外壳走 webkit，Windows 外壳走 Tauri，浏览器里两个都没有
  const macBridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.native;
  const tauri = window.__TAURI__;
  const nativeBridge = macBridge || (tauri && { postMessage: (msg) => tauri.core.invoke('native', { msg }) });

  function loadGame() {
    if (boot.game) return boot.game;
    try { return JSON.parse(localStorage.getItem('emoking') || '{}'); } catch { return {}; }
  }

  function saveGame(data) {
    if (nativeBridge) nativeBridge.postMessage({ cmd: 'save', data });
    else try { localStorage.setItem('emoking', JSON.stringify(data)); } catch { /* 无痕模式 */ }
  }

  const sim = new window.EmoSim.Sim({ saved: loadGame() });
  const canvas = document.getElementById('scene');
  const hintEl = document.getElementById('hint');
  const todayEl = document.getElementById('today');
  const scene = new window.EmoScene.Scene({
    base: document.getElementById('base'),
    mid: canvas,
    smoke: document.getElementById('smoke'),
  }, sim);
  scene.level = boot.smokeLevel ?? 1;
  if (macBridge) {
    scene.nativeSmoke = true;
    scene.resize();
    nativeBridge.postMessage({ cmd: 'sprites', urls: scene.sprites.map((c) => c.toDataURL('image/png')) });
  }

  // ---- 提示 ----
  let hintTimer = 0;
  function showHint(key, sticky) {
    clearTimeout(hintTimer);
    hintEl.textContent = HINTS[key];
    hintEl.classList.add('show');
    if (!sticky) hintTimer = setTimeout(clearHint, 3500);
  }
  function clearHint() {
    clearTimeout(hintTimer);
    hintEl.classList.remove('show');
  }

  function tutorial() {
    if (sim.tutorialDone) return;
    if (['empty', 'unlit', 'lit'].includes(sim.phase)) showHint(sim.phase, true);
    else clearHint();
  }

  // ---- 事件 ----
  let ashHinted = false;
  function pump() {
    for (const e of sim.drain()) {
      scene.onEvent(e);
      if (e.type === 'save') {
        saveGame(sim.snapshot());
        todayEl.textContent = `今日 ${sim.count} 支`;
      } else if (e.type === 'hint') {
        showHint(e.key);
      } else if (e.type === 'phase') {
        if (e.phase === 'out') showHint('out');
        else tutorial();
      } else if (e.type === 'puffStart' && !sim.tutorialDone) {
        clearHint();
      }
    }
    if (!sim.tutorialDone && !ashHinted && sim.ash > 0.1) {
      ashHinted = true;
      showHint('ash');
    }
    sendHitRects();
  }

  let lastRects = '';
  function sendHitRects() {
    if (!nativeBridge) return;
    const rects = scene.hitRects();
    const key = JSON.stringify(rects);
    if (key === lastRects) return;
    lastRects = key;
    nativeBridge.postMessage({ cmd: 'hit', rects });
  }

  // ---- 循环：只有东西在动才跑，否则一帧都不画 ----
  let paused = false, running = false, last = 0;
  function frame() {
    if (paused) { running = false; return; }
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    sim.step(dt);
    pump();
    scene.update(dt);
    if (scene.outbox.length) macBridge.postMessage({ cmd: 'smoke', items: scene.takeOutbox() });
    scene.render();
    const interval = macBridge && scene.calm() ? CALM_MS : FRAME_MS;
    if (scene.busy()) setTimeout(frame, Math.max(0, interval - (performance.now() - now)));
    else running = false;
  }

  function kick() {
    pump();
    if (running || paused) { if (!paused) scene.render(); return; }
    running = true;
    last = performance.now();
    setTimeout(frame, 0);
  }

  // ---- 输入 ----
  let press = null;
  let pressAt = { x: 0, y: 0 };

  function toScene(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / scene.scale,
      y: (ev.clientY - r.top) / scene.scale,
    };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const p = toScene(ev);
    const item = scene.hitTest(p.x, p.y);
    if (!item) return;
    canvas.setPointerCapture(ev.pointerId);
    press = item;
    pressAt = { x: ev.screenX, y: ev.screenY };
    if (tauri) nativeBridge.postMessage({ cmd: 'press', down: true });
    if (item === 'cig') sim.pressCig();
    kick();
  });

  // Mac 的拖动在原生层处理；Windows 由这里判断，再交给系统拖窗口
  canvas.addEventListener('pointermove', (ev) => {
    if (!tauri || !['pack', 'lighter', 'tray'].includes(press)) return;
    if (Math.hypot(ev.screenX - pressAt.x, ev.screenY - pressAt.y) <= 4) return;
    press = null;
    canvas.releasePointerCapture(ev.pointerId);
    nativeBridge.postMessage({ cmd: 'drag' });
  });

  canvas.addEventListener('pointerup', (ev) => {
    const item = press;
    press = null;
    if (tauri) nativeBridge.postMessage({ cmd: 'press', down: false });
    if (!item) return;
    if (item === 'cig') { sim.releaseCig(); kick(); return; }
    const p = toScene(ev);
    if (scene.hitTest(p.x, p.y) !== item) return;
    if (item === 'pack') sim.clickPack();
    else if (item === 'lighter') sim.clickLighter();
    else if (item === 'tray') sim.clickAshtray();
    else if (item === 'tip') sim.flick();
    kick();
  });

  function cancelPress() {
    if (press === 'cig') sim.releaseCig();
    press = null;
    if (tauri) nativeBridge.postMessage({ cmd: 'press', down: false });
    kick();
  }

  canvas.addEventListener('pointercancel', cancelPress);
  window.addEventListener('blur', () => { spaceDown = false; cancelPress(); });
  window.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (tauri) nativeBridge.postMessage({ cmd: 'menu' });
  });

  let spaceDown = false;
  window.addEventListener('keydown', (ev) => {
    if (ev.code !== 'Space') return;
    ev.preventDefault();
    if (ev.repeat || spaceDown) return;
    spaceDown = true;
    sim.pressCig();
    kick();
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.code !== 'Space') return;
    spaceDown = false;
    sim.releaseCig();
    kick();
  });

  window.addEventListener('resize', () => { scene.resize(); scene.render(); });
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));

  function setPaused(value) {
    paused = value;
    if (!paused) kick();
  }

  // 原生外壳调用的入口
  window.emoking = {
    sim, scene, kick, setPaused, cancelPress,
    setSmokeLevel(n) { scene.level = n; },
  };

  todayEl.textContent = `今日 ${sim.count} 支`;
  scene.render();
  tutorial();
  pump();
})();
