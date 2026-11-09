var desktop = (function () {
  'use strict';

  const hints = {
    empty: '点烟盒，拿一支烟',
    unlit: '点打火机，点着它',
    lit: '按住烟或空格吸一口，松手吐烟',
    ash: '点烟头抖灰，拖动物件可以挪窗口',
    out: '灭了。点打火机重点，或点烟盒换一支',
    busy: '手上还有一支，点烟灰缸掐灭',
    noCig: '先点烟盒拿一支烟',
    notLit: '还没点着，先点打火机',
  };
  const sim = new EmoSim.Sim({ saved: JSON.parse(native(50)) });
  const layers = {
    base: document.createElement('canvas'),
    mid: document.createElement('canvas'),
    smoke: document.createElement('canvas'),
  };
  const scene = new EmoScene.Scene(layers, sim);
  let hint = '', hintLeft = 0, ashHinted = false, lastRects = '';

  function show(key, sticky) {
    hint = hints[key] || '';
    hintLeft = hint && !sticky ? 3.5 : 0;
  }

  function tutorial() {
    if (!sim.tutorialDone) show(sim.phase, true);
  }

  function pump() {
    for (const e of sim.drain()) {
      scene.onEvent(e);
      if (e.type === 'save') native(51, JSON.stringify(sim.snapshot()));
      else if (e.type === 'hint') show(e.key);
      else if (e.type === 'phase') {
        if (e.phase === 'out') show('out');
        else tutorial();
      } else if (e.type === 'puffStart' && !sim.tutorialDone) show('');
    }
    if (!sim.tutorialDone && !ashHinted && sim.ash > 0.1) {
      ashHinted = true;
      show('ash');
    }
  }

  function draw() {
    scene.render();
    const rects = JSON.stringify(scene.hitRects());
    if (rects !== lastRects) {
      lastRects = rects;
      native(52, rects);
    }
    native(53, hint, sim.count);
    return scene.busy() || hintLeft > 0 ? 1 : 0;
  }

  tutorial();
  return function (action, x, y) {
    switch (action) {
      case 'hit': return scene.hitTest(x / scene.scale, y / scene.scale) || '';
      case 'count': sim.syncDay(); pump(); return sim.count;
      case 'status': return JSON.stringify({ phase: sim.phase, puffing: sim.puffing, count: sim.count,
        butts: sim.butts, ashPile: sim.ashPile, smoke: scene.smoke.length });
      case 'size': layers.mid.clientWidth = x; scene.resize(); break;
      case 'smoke': scene.level = x; break;
      case 'style': scene.setStyles(x, y); break;
      case 'pack': sim.clickPack(); break;
      case 'lighter': sim.clickLighter(); break;
      case 'tray': sim.clickAshtray(); break;
      case 'tip': sim.flick(); break;
      case 'press': sim.pressCig(); break;
      case 'release': sim.releaseCig(); break;
      case 'tick':
        if (hintLeft > 0 && (hintLeft -= x) <= 0) show('');
        sim.step(x);
        pump();
        scene.update(x);
        return draw();
    }
    pump();
    return draw();
  };
})();
