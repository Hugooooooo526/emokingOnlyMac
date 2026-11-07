// 画面：场景、烟、烟雾粒子。规则都在 sim.js，这里只读状态。
(function () {
  'use strict';

  const W = 340, H = 520;
  const MAX_SMOKE = 120;
  const MAX_FLAKES = 24;
  const SPRITE = 64;
  const SMOKE_KEYS = 12;   // 一团烟的路径切成几段
  const TOBACCO = 116, FILTER = 42, CIG_R = 5.2;
  const HOLD = { x: 132, y: 338, a: 0.14 };
  const TRAY = { x: 118, y: 462, rx: 80, ry: 30 };
  const PACK = { x: 238, y: 404, w: 72, h: 96 };
  const LIGHTER = { x: 206, y: 442, w: 24, h: 58 };
  const LEVEL_RATE = [6, 12, 18];        // 烟头每秒出几团烟：少 / 标准 / 多
  const LEVEL_EXHALE = [0.6, 1, 1.4];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);

  function seeded(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function offscreen(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // 一团烟的贴图：几个软圆叠在一起，比单个径向渐变更像烟
  function makePuffSprite(seed) {
    const size = SPRITE, c = offscreen(size, size), x = c.getContext('2d'), r = seeded(seed);
    x.scale(size / 128, size / 128);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = r() * 26;
      const px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d, pr = 22 + r() * 16;
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, 'rgba(206,210,217,.34)');
      g.addColorStop(0.6, 'rgba(190,195,204,.14)');
      g.addColorStop(1, 'rgba(180,186,196,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
    return c;
  }

  function makeGlowSprite() {
    const c = offscreen(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,190,110,.95)');
    g.addColorStop(0.25, 'rgba(255,110,40,.5)');
    g.addColorStop(1, 'rgba(255,60,10,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return c;
  }

  // ---- 静态物件 ----
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }

  function groundShadow(c, x, y, rx, ry) {
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, rx * 0.4, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawButt(c, x, y, a) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = '#c98f4e';
    roundRect(c, 0, -3.6, 25, 7.2, 2);
    c.fill();
    c.fillStyle = '#ece8df';
    c.fillRect(-7, -3.3, 7, 6.6);
    c.fillStyle = '#3a3633';
    c.beginPath();
    c.ellipse(-8, 0, 3.4, 3.6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawTray(c, butts, ashPile) {
    const { x, y, rx, ry } = TRAY;
    groundShadow(c, x, y + 20, rx + 16, ry + 8);

    // 侧壁
    let g = c.createLinearGradient(x - rx, 0, x + rx, 0);
    g.addColorStop(0, '#23262c');
    g.addColorStop(0.45, '#4b505a');
    g.addColorStop(1, '#1d2025');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y + 11, rx, ry, 0, 0, Math.PI * 2);
    c.fill();

    // 上沿
    g = c.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, '#6c727e');
    g.addColorStop(1, '#3a3e47');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();

    // 碗
    g = c.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, '#17191d');
    g.addColorStop(1, '#2c2f36');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y + 1, rx - 13, ry - 7, 0, 0, Math.PI * 2);
    c.fill();

    // 搁烟的缺口
    c.fillStyle = '#17191d';
    for (const a of [-2.2, -0.9, 0.4, 2.8]) {
      c.beginPath();
      c.ellipse(x + Math.cos(a) * (rx - 6), y + Math.sin(a) * (ry - 3.5), 7, 3.2, 0, 0, Math.PI * 2);
      c.fill();
    }

    // 烟灰堆
    const r = seeded(7);
    const flecks = Math.round(ashPile * 150);
    for (let i = 0; i < flecks; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.82;
      const shade = 90 + Math.floor(r() * 80);
      c.fillStyle = `rgb(${shade},${shade},${shade + 3})`;
      c.beginPath();
      c.ellipse(x + Math.cos(a) * d * (rx - 18), y + 1 + Math.sin(a) * d * (ry - 11),
        1 + r() * 2.2, 0.7 + r() * 1.2, r() * 3, 0, Math.PI * 2);
      c.fill();
    }

    // 烟头
    const spots = [[-30, 2, 0.3], [18, 7, -0.5], [-6, -7, 2.9], [34, -3, 2.4], [-40, -4, 0.9], [4, 3, 1.5]];
    for (let i = 0; i < Math.min(butts, spots.length); i++) {
      const [dx, dy, a] = spots[i];
      drawButt(c, x + dx, y + dy, a);
    }
  }

  function drawPack(c) {
    const { x, y, w, h } = PACK;
    groundShadow(c, x + w / 2, y + h + 1, w * 0.72, 9);

    // 露出来的滤嘴
    for (let i = 0; i < 3; i++) {
      const fx = x + 13 + i * 16.5;
      const g = c.createLinearGradient(fx, 0, fx + 13, 0);
      g.addColorStop(0, '#b67a3a');
      g.addColorStop(0.5, '#e2ab68');
      g.addColorStop(1, '#a86f33');
      c.fillStyle = g;
      roundRect(c, fx, y - 9, 13, 18, 3);
      c.fill();
    }

    // 盒身
    let g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#5c1420');
    g.addColorStop(0.5, '#8a2233');
    g.addColorStop(1, '#4a0f19');
    c.fillStyle = g;
    roundRect(c, x, y, w, h, 3);
    c.fill();

    // 翻盖开口
    c.fillStyle = 'rgba(0,0,0,.35)';
    c.fillRect(x, y, w, 3);
    c.strokeStyle = 'rgba(0,0,0,.28)';
    c.beginPath();
    c.moveTo(x, y + 20); c.lineTo(x + w, y + 20);
    c.stroke();

    // 烟标
    c.strokeStyle = '#d8b56a';
    c.lineWidth = 1;
    c.strokeRect(x + 7, y + 30, w - 14, 48);
    c.fillStyle = '#d8b56a';
    c.beginPath(); // 小皇冠
    const cx = x + w / 2, cy = y + 49;
    c.moveTo(cx - 11, cy);
    c.lineTo(cx - 13, cy - 11);
    c.lineTo(cx - 6, cy - 5);
    c.lineTo(cx, cy - 13);
    c.lineTo(cx + 6, cy - 5);
    c.lineTo(cx + 13, cy - 11);
    c.lineTo(cx + 11, cy);
    c.closePath();
    c.fill();
    c.font = '600 10px -apple-system, "Helvetica Neue", sans-serif';
    c.textAlign = 'center';
    c.fillText('EMOKING', cx, y + 67);
  }

  function drawLighterBody(c, x, y, wheelSpin) {
    const { w, h } = LIGHTER;
    let g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#0f6a6d');
    g.addColorStop(0.45, '#25b1ad');
    g.addColorStop(1, '#0c5558');
    c.fillStyle = g;
    roundRect(c, x, y + 13, w, h - 13, 3);
    c.fill();

    g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#80858d');
    g.addColorStop(0.5, '#e3e6ea');
    g.addColorStop(1, '#6f747c');
    c.fillStyle = g;
    roundRect(c, x + 2, y, w - 4, 14, [3, 3, 0, 0]);
    c.fill();

    c.fillStyle = '#4b4f55';
    c.beginPath();
    c.arc(x + w - 7, y + 6, 4.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#c8ccd2';
    c.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      const a = wheelSpin + i * Math.PI / 2;
      c.beginPath();
      c.moveTo(x + w - 7, y + 6);
      c.lineTo(x + w - 7 + Math.cos(a) * 4, y + 6 + Math.sin(a) * 4);
      c.stroke();
    }
  }

  function drawFlame(c, x, y, T, glow) {
    const f = 1 + Math.sin(T * 31) * 0.08 + Math.sin(T * 47) * 0.06;
    const h = 24 * f, w = 7;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.drawImage(glow, x - 26, y - h - 18, 52, 52);
    c.restore();
    const teardrop = (hh, ww, color) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x, y - hh);
      c.bezierCurveTo(x + ww * 0.3, y - hh * 0.55, x + ww, y - hh * 0.3, x, y);
      c.bezierCurveTo(x - ww, y - hh * 0.3, x - ww * 0.3, y - hh * 0.55, x, y - hh);
      c.fill();
    };
    teardrop(h, w, 'rgba(255,150,40,.92)');
    teardrop(h * 0.66, w * 0.6, 'rgba(255,232,150,.96)');
    teardrop(h * 0.26, w * 0.42, 'rgba(90,140,255,.8)');
  }

  class Scene {
    // 三层画布：base 只在烟灰缸内容变化时重画，mid 只在烟或打火机变化时重画，
    // smoke 每帧都画，但烟是糊的，所以用 1 倍分辨率，像素量只有视网膜屏的四分之一
    constructor({ base, mid, smoke }, sim) {
      this.layers = { base, mid, smoke };
      this.canvas = mid;
      this.baseCtx = base.getContext('2d');
      this.ctx = mid.getContext('2d');
      this.smokeCtx = smoke.getContext('2d');
      this.sim = sim;
      this.level = 1;
      this.smoke = [];
      this.outbox = [];
      this.nativeSmoke = false;
      this.flakes = [];
      this.sprites = [11, 23, 37, 53].map(makePuffSprite);
      this.glow = makeGlowSprite();
      this.T = 0;
      this.emitAcc = 0;
      this.exhale = null;
      this.puffAmt = 0;
      this.wobble = 0;
      this.wisp = 0;
      this.lastPose = { x: HOLD.x, y: HOLD.y, a: HOLD.a };
      const r = seeded(99);
      this.ashJitter = Array.from({ length: 24 }, () => r());
      this.staticDirty = true;
      this.resize();
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const cw = this.canvas.clientWidth || W;
      this.scale = cw / W;
      this.px = this.scale * dpr;
      this.smokePx = this.nativeSmoke ? 0 : this.scale;
      for (const [name, px] of [['base', this.px], ['mid', this.px], ['smoke', this.smokePx]]) {
        this.layers[name].width = Math.round(W * px);
        this.layers[name].height = Math.round(H * px);
      }
      this.staticDirty = true;
      this.midKey = '';
    }

    // ---- 事件 ----
    onEvent(e) {
      if (e.type === 'exhale') {
        this.exhale = { left: 0.35 + e.power * 1.1, power: e.power, acc: 0 };
      } else if (e.type === 'ash') {
        this.spawnAsh(e.amount);
        this.staticDirty = true;
      } else if (e.type === 'flick') {
        this.wobble = 1;
      } else if (e.type === 'butt') {
        this.staticDirty = true;
        this.burst(TRAY.x, TRAY.y - 6, 10);
      } else if (e.type === 'save') {
        this.staticDirty = true;
      } else if (e.type === 'phase' && e.phase === 'out') {
        this.wisp = 3;
      } else if (e.type === 'phase' && e.phase === 'stubbing') {
        this.wisp = 0;
      }
    }

    spawnAsh(amount) {
      const p = this.lastPose;
      const len = TOBACCO * amount;
      const n = clamp(Math.round(4 + amount * 40), 4, 14);
      for (let i = 0; i < n && this.flakes.length < MAX_FLAKES; i++) {
        const big = i === 0;
        this.flakes.push({
          x: p.x - Math.random() * len * Math.cos(p.a),
          y: p.y - Math.random() * len * Math.sin(p.a),
          vx: (Math.random() - 0.5) * 34,
          vy: Math.random() * 16,
          rot: Math.random() * 3,
          vr: (Math.random() - 0.5) * 7,
          w: big ? Math.max(4, len * 0.62) : 1.5 + Math.random() * 3,
          h: big ? CIG_R * 1.6 : 1 + Math.random() * 2,
          shade: 110 + Math.floor(Math.random() * 70),
          floor: TRAY.y - 6 + Math.random() * 14,
        });
      }
    }

    // 一团烟出生时就把整条路径算完。App 里交给 Core Animation 播放，之后不用再管它；
    // 浏览器里由 drawSmoke 按同一条路径回放
    addSmoke(q, delay = 0) {
      if (this.smoke.length >= MAX_SMOKE) return;
      const keys = [];
      const round = (v) => Math.round(v * 1000) / 1000;
      const seg = q.life / SMOKE_KEYS, sub = Math.ceil(seg * 15), h = seg / sub;
      let { x, y, vx, vy } = q, t = 0;
      for (let i = 0; i <= SMOKE_KEYS; i++) {
        const k = i / SMOKE_KEYS;
        const r = q.r0 + (q.r1 - q.r0) * (1 - (1 - k) * (1 - k));
        // 靠近窗口边缘时淡掉，不让烟被窗口切出一条直线
        const edge = clamp(y / 90, 0, 1) * clamp((x + 10) / 60, 0, 1) * clamp((W + 10 - x) / 60, 0, 1);
        const a = i === 0 ? 0 : q.a0 * Math.pow(1 - k, 1.5) * edge;
        keys.push(round(x), round(y), round(r), round(a));
        if (i === SMOKE_KEYS) break;
        for (let j = 0; j < sub; j++) {
          t += h;
          const A = 5 + 34 * (t / q.life), T = this.T + t;
          vx += (Math.sin(y * 0.019 + T * 0.8 + q.seed) + 0.5 * Math.sin(y * 0.047 - T * 1.3 + q.seed * 2)) * A * h;
          const drag = q.jet || 0.55;
          vx *= 1 - drag * h;
          vy = q.jet ? vy * (1 - drag * h) - 22 * h : vy * (1 - 0.16 * h);
          x += vx * h;
          y += vy * h;
        }
      }
      const plan = { keys, life: q.life, rot: q.rot, spin: q.spin, spr: q.spr, age: -delay };
      this.smoke.push(plan);
      if (this.nativeSmoke) this.outbox.push({ ...plan, delay });
    }

    takeOutbox() {
      const items = this.outbox;
      this.outbox = [];
      return items;
    }

    burst(x, y, n) {
      for (let i = 0; i < n; i++) {
        this.addSmoke({
          x: x + (Math.random() - 0.5) * 14, y,
          vx: (Math.random() - 0.5) * 26, vy: -26 - Math.random() * 26,
          age: 0, life: 1.6 + Math.random() * 1.2, r0: 5, r1: 30, a0: 0.3,
          rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.6,
          spr: i & 3, seed: Math.random() * 10,
        });
      }
    }

    // ---- 姿态 ----
    filterEnd(p) {
      const len = (TOBACCO * (1 - this.sim.burned) + FILTER) * (p.k || 1);
      return { x: p.x + Math.cos(p.a) * len, y: p.y + Math.sin(p.a) * len };
    }

    pose() {
      const s = this.sim;
      const packMouth = { x: PACK.x + 30, y: PACK.y - 6, a: Math.PI / 2 };
      const wob = Math.sin(this.T * 42) * this.wobble * 0.05;
      const held = {
        x: HOLD.x,
        y: HOLD.y,
        a: HOLD.a + this.puffAmt * 0.035 + wob,
      };
      const between = (from, to, t) => ({
        x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), a: lerp(from.a, to.a, t),
      });
      const A = window.EmoSim.TUNING.anim;
      switch (s.phase) {
        case 'drawing': return between(packMouth, held, ease(clamp(s.t / A.drawing, 0, 1)));
        case 'putback': return between(held, packMouth, ease(clamp(s.t / A.putback, 0, 1)));
        case 'stubbing': {
          const t = clamp(s.t / A.stubbing, 0, 1);
          const target = { x: TRAY.x + 6, y: TRAY.y - 2, a: -0.95 };
          const p = between(held, target, ease(clamp(t / 0.6, 0, 1)));
          const crush = clamp((t - 0.6) / 0.4, 0, 1);
          p.a += Math.sin(crush * 9) * 0.1 * crush;
          p.k = 1 - crush * 0.5;
          return p;
        }
        default: return held;
      }
    }

    hasCig() { return this.sim.phase !== 'empty'; }

    // 点到了什么。tip 是烟头那段（抖灰），cig 是烟身（吸）
    hitTest(x, y) {
      const s = this.sim;
      if (['unlit', 'lit', 'out'].includes(s.phase)) {
        const p = this.lastPose;
        const dx = x - p.x, dy = y - p.y;
        const u = dx * Math.cos(p.a) + dy * Math.sin(p.a);
        const v = -dx * Math.sin(p.a) + dy * Math.cos(p.a);
        const len = TOBACCO * (1 - s.burned) + FILTER;
        const ashLen = TOBACCO * s.ash;
        if (Math.abs(v) < 14 && u > -ashLen - 12 && u < len + 8) {
          return u < 18 ? 'tip' : 'cig';
        }
      }
      const inside = (r) => x >= r.x - 3 && x <= r.x + r.w + 3 && y >= r.y - 12 && y <= r.y + r.h + 3;
      if (inside(PACK)) return 'pack';
      if (inside(LIGHTER)) return 'lighter';
      const ex = (x - TRAY.x) / TRAY.rx, ey = (y - TRAY.y - 5) / (TRAY.ry + 7);
      if (ex * ex + ey * ey <= 1) return 'tray';
      return null;
    }

    // 给原生层的可点击区域，其余部分鼠标直接穿透到下面的窗口
    hitRects() {
      const rects = [
        { x: PACK.x - 3, y: PACK.y - 12, w: PACK.w + 6, h: PACK.h + 15, drag: true },
        { x: LIGHTER.x - 3, y: LIGHTER.y - 12, w: LIGHTER.w + 6, h: LIGHTER.h + 15, drag: true },
        { x: TRAY.x - TRAY.rx, y: TRAY.y - TRAY.ry - 2, w: TRAY.rx * 2, h: TRAY.ry * 2 + 14, drag: true },
      ];
      if (['unlit', 'lit', 'out'].includes(this.sim.phase)) {
        const p = this.lastPose, e = this.filterEnd(p);
        const left = p.x - TOBACCO * this.sim.ash - 14;
        rects.push({
          x: Math.floor(left / 4) * 4,
          y: Math.floor((Math.min(p.y, e.y) - 16) / 4) * 4,
          w: Math.ceil((e.x - left + 12) / 4) * 4,
          h: Math.ceil((Math.abs(e.y - p.y) + 32) / 4) * 4 + 4,
          drag: false,
        });
      }
      return rects;
    }

    // ---- 更新 ----
    busy() {
      const s = this.sim;
      return !['empty', 'unlit', 'out'].includes(s.phase) || (!this.nativeSmoke && this.smoke.length > 0) ||
        this.flakes.length > 0 || this.exhale || this.wisp > 0 || this.wobble > 0.01 || this.puffAmt > 0.01;
    }

    // 只是在慢慢烧：画面每秒变 5 次就够，循环可以降速
    calm() {
      const target = this.sim.puffing ? 1 : 0;
      return this.sim.phase === 'lit' && !this.exhale && this.flakes.length === 0 &&
        this.wobble === 0 && Math.abs(this.puffAmt - target) < 0.01;
    }

    update(dt) {
      const s = this.sim;
      this.T += dt;
      this.puffAmt += ((s.puffing ? 1 : 0) - this.puffAmt) * Math.min(1, dt * 9);
      if (this.puffAmt < 0.005 && !s.puffing) this.puffAmt = 0;
      this.wobble = this.wobble < 0.01 ? 0 : this.wobble * Math.exp(-dt * 7);
      this.lastPose = this.pose();
      const p = this.lastPose;

      // 烟头持续冒烟；吸的时候烟被吸回去，所以变少
      let rate = 0;
      if (s.phase === 'lit') rate = LEVEL_RATE[this.level] * (1 - this.puffAmt * 0.8);
      else if (this.wisp > 0) {
        this.wisp = Math.max(0, this.wisp - dt);
        rate = LEVEL_RATE[this.level] * 0.45 * (this.wisp / 3);
      }
      this.emitAcc += rate * dt;
      const due = Math.floor(this.emitAcc);
      for (let n = 0; n < due; n++) {
        this.emitAcc -= 1;
        this.addSmoke({
          x: p.x - 1 + (Math.random() - 0.5) * 2, y: p.y - 4,
          vx: (Math.random() - 0.5) * 3, vy: -36 - Math.random() * 12,
          age: 0, life: 3.4 + Math.random() * 1.8,
          r0: 3, r1: 26 + Math.random() * 14, a0: 0.46,
          rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.5,
          spr: Math.floor(Math.random() * 4), seed: Math.random() * 10,
        }, n / due * dt);
      }

      // 吐烟：从滤嘴那头（嘴的位置）往左上方喷一股
      if (this.exhale) {
        const ex = this.exhale, m = this.filterEnd(p);
        ex.left -= dt;
        ex.acc += (30 + ex.power * 34) * LEVEL_EXHALE[this.level] * dt;
        while (ex.acc >= 1) {
          ex.acc -= 1;
          // 速度和阻力都拉开差距，烟才会拉成一股，而不是全停在同一处聚成球
          const reach = Math.random();
          const sp = 70 + ex.power * 120 + reach * 150;
          const dir = -2.45 + (Math.random() - 0.5) * (0.9 - reach * 0.5);
          this.addSmoke({
            x: m.x + 4 + (Math.random() - 0.5) * 6, y: m.y - 12 + (Math.random() - 0.5) * 6,
            vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
            age: 0, life: 1.6 + ex.power * 1.4 + Math.random() * 1.4,
            r0: 4, r1: 18 + ex.power * 16 + reach * 26 + Math.random() * 12,
            a0: 0.2 + ex.power * 0.14,
            rot: Math.random() * 6, spin: (Math.random() - 0.5) * 1,
            spr: Math.floor(Math.random() * 4), seed: Math.random() * 10,
            jet: 0.9 + Math.random() * 1.5,
          });
        }
        if (ex.left <= 0) this.exhale = null;
      }

      const smoke = this.smoke;
      for (let i = smoke.length - 1; i >= 0; i--) {
        const q = smoke[i];
        q.age += dt;
        if (q.age >= q.life) { smoke[i] = smoke[smoke.length - 1]; smoke.pop(); }
      }

      const flakes = this.flakes;
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i];
        f.vy += 430 * dt;
        f.vx *= 1 - 1.6 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.y >= f.floor) { flakes[i] = flakes[flakes.length - 1]; flakes.pop(); }
      }
    }

    // ---- 绘制 ----
    renderStatic() {
      const c = this.baseCtx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.layers.base.width, this.layers.base.height);
      c.setTransform(this.px, 0, 0, this.px, 0, 0);
      drawTray(c, this.sim.butts, this.sim.ashPile);
      drawPack(c);
      this.staticDirty = false;
    }

    // 烟头闪烁只需要每秒 5 次，mid 层因此不用跟着 30fps 重画
    flicker() { return Math.floor(this.T * 5) / 5; }

    drawCig(c, p) {
      const s = this.sim;
      const lit = s.phase === 'lit' || (s.phase === 'stubbing' && s.counted);
      const used = s.counted || s.burned > 0;
      const rem = TOBACCO * (1 - s.burned), r = CIG_R;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      if (p.k) c.scale(p.k, 1);

      // 卷纸
      let g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#d8d4cb');
      g.addColorStop(0.3, '#fbf9f4');
      g.addColorStop(1, '#a9a59c');
      c.fillStyle = g;
      c.fillRect(1, -r, rem, r * 2);

      // 靠近烟头的焦痕
      if (used) {
        g = c.createLinearGradient(0, 0, 9, 0);
        g.addColorStop(0, 'rgba(56,34,20,.95)');
        g.addColorStop(1, 'rgba(120,84,50,0)');
        c.fillStyle = g;
        c.fillRect(1, -r, 9, r * 2);
      }

      // 滤嘴
      const fx = 1 + rem;
      g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#b87d3e');
      g.addColorStop(0.3, '#e9b676');
      g.addColorStop(1, '#8e5d2a');
      c.fillStyle = g;
      c.fillRect(fx, -r, FILTER, r * 2);
      c.fillStyle = 'rgba(92,56,24,.5)';
      for (let i = 0; i < 22; i++) {
        c.fillRect(fx + this.ashJitter[i] * (FILTER - 2), -r + this.ashJitter[(i + 7) % 24] * r * 2 - 0.5, 1.2, 1);
      }
      c.fillStyle = '#d8b56a';
      c.fillRect(fx, -r, 2, r * 2);
      c.fillStyle = '#d9c9ac';
      c.beginPath();
      c.ellipse(fx + FILTER, 0, 2, r, 0, 0, Math.PI * 2);
      c.fill();

      // 烟头
      if (!used) {
        c.fillStyle = '#6e4a28';
        c.beginPath();
        c.ellipse(1, 0, 2, r, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        const heat = lit ? 0.55 + Math.sin(this.flicker() * 7) * 0.05 + this.puffAmt * 0.45 : 0;
        c.fillStyle = lit ? `rgb(255,${Math.round(70 + heat * 130)},${Math.round(20 + heat * 40)})` : '#2b2826';
        c.beginPath();
        c.ellipse(1, 0, 3.2, r + 0.2, 0, 0, Math.PI * 2);
        c.fill();
      }

      // 烟灰
      const ashLen = TOBACCO * s.ash;
      if (ashLen > 0.6) {
        const steps = Math.max(2, Math.ceil(ashLen / 3));
        c.beginPath();
        c.moveTo(1, -r);
        for (let i = 1; i <= steps; i++) {
          c.lineTo(1 - ashLen * i / steps, -r + 0.4 + this.ashJitter[i % 24] * 1.3);
        }
        for (let i = steps; i >= 0; i--) {
          c.lineTo(1 - ashLen * i / steps, r - 0.4 - this.ashJitter[(i + 11) % 24] * 1.3);
        }
        c.closePath();
        g = c.createLinearGradient(0, -r, 0, r);
        g.addColorStop(0, '#c9c7c3');
        g.addColorStop(0.5, '#a4a29e');
        g.addColorStop(1, '#6f6d6a');
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = 'rgba(70,68,66,.55)';
        c.lineWidth = 0.7;
        for (let i = 1; i < steps; i += 2) {
          const ax = 1 - ashLen * i / steps;
          c.beginPath();
          c.moveTo(ax, -r + 1.5);
          c.lineTo(ax - 1.5 + this.ashJitter[i % 24] * 3, r - 1.5);
          c.stroke();
        }
      }
      c.restore();

      if (lit && used) {
        const size = 26 + this.puffAmt * 34 + Math.sin(this.flicker() * 7) * 2;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.55 + this.puffAmt * 0.45;
        c.drawImage(this.glow, p.x - size / 2, p.y - size / 2, size, size);
        c.restore();
      }
    }

    drawLighter(c) {
      const s = this.sim;
      let x = LIGHTER.x, y = LIGHTER.y, flame = false, spin = 0;
      if (s.phase === 'lighting') {
        const t = clamp(s.t / window.EmoSim.TUNING.anim.lighting, 0, 1);
        const m = t < 0.28 ? ease(t / 0.28) : t > 0.8 ? 1 - ease((t - 0.8) / 0.2) : 1;
        const p = this.lastPose;
        x = lerp(LIGHTER.x, p.x - 8, m);
        y = lerp(LIGHTER.y, p.y + 26, m);
        flame = t > 0.26 && t < 0.82;
        spin = t * 18;
      }
      groundShadow(c, LIGHTER.x + LIGHTER.w / 2, LIGHTER.y + LIGHTER.h + 1, 22, 6);
      drawLighterBody(c, x, y, spin);
      if (flame) drawFlame(c, x + 8, y + 1, this.T, this.glow);
    }

    drawSmoke(c) {
      for (const q of this.smoke) {
        if (q.age < 0) continue;
        const f = q.age / q.life * SMOKE_KEYS;
        const i = Math.min(SMOKE_KEYS - 1, Math.floor(f)) * 4, t = f - Math.floor(f), k = q.keys;
        const a = lerp(k[i + 3], k[i + 7], t);
        if (a < 0.004) continue;
        const r = lerp(k[i + 2], k[i + 6], t), rot = q.rot + q.spin * q.age;
        const cos = Math.cos(rot) * r * 2 / SPRITE, sin = Math.sin(rot) * r * 2 / SPRITE;
        c.globalAlpha = a;
        c.transform(cos, sin, -sin, cos, lerp(k[i], k[i + 4], t), lerp(k[i + 1], k[i + 5], t));
        c.drawImage(this.sprites[q.spr], -SPRITE / 2, -SPRITE / 2);
        c.setTransform(this.smokePx, 0, 0, this.smokePx, 0, 0);
      }
      c.globalAlpha = 1;
    }

    render() {
      if (this.staticDirty) this.renderStatic();
      this.renderMid();
      if (this.nativeSmoke) return;
      const c = this.smokeCtx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.layers.smoke.width, this.layers.smoke.height);
      c.setTransform(this.smokePx, 0, 0, this.smokePx, 0, 0);
      this.drawSmoke(c);
    }

    renderMid() {
      const s = this.sim, p = this.lastPose;
      const moving = s.phase === 'lighting' || this.flakes.length > 0;
      const key = moving ? this.T : [
        s.phase, p.x, p.y, p.a, p.k, s.burned.toFixed(3), s.ash.toFixed(3),
        this.puffAmt.toFixed(2), s.phase === 'lit' ? this.flicker() : 0,
      ].join();
      if (key === this.midKey) return;
      this.midKey = key;

      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.setTransform(this.px, 0, 0, this.px, 0, 0);
      this.drawLighter(c);
      if (this.hasCig()) this.drawCig(c, p);
      for (const f of this.flakes) {
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.rot);
        c.fillStyle = `rgb(${f.shade},${f.shade},${f.shade})`;
        c.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
        c.restore();
      }
    }
  }

  window.EmoScene = { Scene, W, H };
})();
