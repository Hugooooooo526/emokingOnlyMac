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
  const LIGHTER = { x: 204, y: 451, w: 29, h: 49 };
  const LEVEL_RATE = [6, 12, 18];        // 烟头每秒出几团烟：少 / 标准 / 多
  const LEVEL_EXHALE = [0.6, 1, 1.4];
  const PACK_STYLES = [
    { face: ['#0e2e2b', '#1f5541', '#112e28'], filter: ['#cbd4ce', '#f4fcf6', '#9caea5'], band: '#238d57', speck: 'rgba(47,111,83,.2)', width: 1, label: drawLuckyStrike },
    { face: ['#c4c6c5', '#f9f9f5', '#c7cbd0'], filter: ['#c6c5bd', '#faf9f3', '#a2a29b'], band: '#535761', speck: 'rgba(52,53,57,.15)', width: 1, label: drawSevenStars },
    { face: ['#132b61', '#3973b6', '#132c64'], filter: ['#c4ccd2', '#fbfcfc', '#a6b2c5'], band: '#3b6fa8', speck: 'rgba(48,82,119,.18)', width: 0.9, label: drawMildSeven },
    { face: ['#d9d8cf', '#fffdf7', '#bfbeb6'], filter: ['#b8783d', '#e7a961', '#94602f'], band: '#e8d8b9', speck: 'rgba(90,52,28,.52)', width: 1, label: drawMarlboro },
    { face: ['#bb925e', '#f1deb2', '#bc9569'], filter: ['#bf954e', '#edc179', '#ad793b'], band: '#997141', speck: 'rgba(91,61,28,.47)', width: 0.95, label: drawCamel },
  ];
  const ZIPPO_STYLES = [
    { shell: ['#626971', '#d0d6da', '#878e95'], edge: '#e6e9eb', ink: '#4b5058', grain: true },
    { shell: ['#77531f', '#d9ae57', '#a87b31'], edge: '#f0cd7c', ink: '#65451c', grain: true },
    { shell: ['#1c2025', '#3c4148', '#22262c'], edge: '#62676e', ink: '#babdc3' },
    { shell: ['#530d18', '#d83848', '#7b1525'], edge: '#f77d85', ink: '#ffd0ce' },
  ];

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

  function across(c, x, y, w, h, colors, middle = 0.48) {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, colors[0]);
    g.addColorStop(middle, colors[1]);
    g.addColorStop(1, colors[2]);
    return g;
  }

  function caption(c, text, x, y, size, color) {
    c.fillStyle = color;
    c.font = `600 ${size}px sans-serif`;
    c.textAlign = 'center';
    c.fillText(text, x, y);
  }

  function polygon(c, color, points) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    c.closePath();
    c.fill();
  }

  function drawLuckyStrike(c) {
    const green = '#84e29e';
    for (const radius of [31, 26, 22]) {
      c.strokeStyle = radius === 26 ? '#5fa79c' : '#73b77a';
      c.lineWidth = radius === 22 ? 1.4 : 0.7;
      c.beginPath();
      c.arc(36, 49, radius, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = green;
    c.lineWidth = 0.7;
    for (const offset of [-1, 1]) {
      c.beginPath();
      c.moveTo(36 + offset * 21, 32);
      c.lineTo(36 + offset * 30, 24);
      c.lineTo(36 + offset * 30, 9);
      c.stroke();
    }
    caption(c, 'LUCKY', 36, 47, 10, '#f8fcf8');
    caption(c, 'STRIKE', 36, 59, 10, '#f8fcf8');
    caption(c, 'ACTIVATE GREEN', 36, 89, 6.5, green);
  }

  function drawSevenStars(c) {
    const ink = '#2e3137';
    for (let i = 0; i < 7; i++) {
      const points = [];
      for (let j = 0; j < 10; j++) {
        const angle = j * Math.PI / 5 - Math.PI / 2, r = j % 2 ? 1.6 : 3.4;
        points.push(11.5 + i * 8.2 + r * Math.cos(angle), 37 + r * Math.sin(angle));
      }
      polygon(c, ink, points);
    }
    caption(c, 'Seven Stars', 36, 58, 11.5, ink);
    c.fillStyle = '#a2a6ad';
    c.fillRect(10, 67, 52, 1);
    caption(c, 'CHARCOAL FILTER', 36, 81, 5.5, ink);
  }

  function drawMildSeven(c) {
    c.strokeStyle = '#83c8e7';
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(4, 49 + i * 5);
      c.bezierCurveTo(26, 57 + i * 5, 35, 35 + i * 5, 68, 29 + i * 5);
      c.stroke();
    }
    caption(c, 'MILD SEVEN', 36, 73, 10, '#ffffff');
    caption(c, 'ORIGINAL BLUE', 36, 85, 6, '#dceffa');
  }

  function drawMarlboro(c) {
    polygon(c, '#b82129', [1, 2, 71, 2, 71, 29, 36, 49, 1, 29]);
    polygon(c, '#e04a49', [1, 2, 71, 2, 71, 8, 1, 8]);
    caption(c, 'Marlboro', 36, 69, 13, '#201d19');
    caption(c, 'RED', 36, 82, 7, '#8c1d22');
  }

  function drawCamel(c) {
    caption(c, 'CAMEL', 36, 36, 14, '#234354');
    polygon(c, '#d0aa6a', [8, 67, 27, 48, 44, 67]);
    polygon(c, '#bc9355', [36, 67, 51, 52, 65, 67]);
    polygon(c, '#695139', [15, 54, 20, 51, 25, 53, 29, 62, 35, 57, 43, 53, 49, 58,
      54, 60, 56, 69, 51, 73, 51, 80, 48, 80, 47, 73, 35, 73, 32, 80, 29, 80,
      30, 72, 25, 67, 21, 57, 15, 57]);
    caption(c, 'FILTERS', 36, 91, 6, '#234354');
  }

  function drawPack(c, style) {
    const { x, y, w, h } = PACK;
    groundShadow(c, x + w / 2, y + h + 1, w * 0.72, 9);
    c.save();
    c.translate(x, y);
    for (let i = 0; i < 3; i++) {
      const fx = 13 + i * 16.5, width = 13 * style.width;
      c.fillStyle = across(c, fx, 0, width, 0, style.filter);
      roundRect(c, fx, -9, width, 18, 3);
      c.fill();
    }
    c.fillStyle = across(c, 0, 0, w, 0, style.face);
    roundRect(c, 0, 0, w, h, 3);
    c.fill();
    style.label(c);
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(3, 0, w - 6, 2);
    c.fillRect(0, 18, w, 1);
    c.restore();
  }

  function shellPanel(c, y, height, radii, style) {
    const w = LIGHTER.w;
    c.fillStyle = across(c, 0, 0, w, 0, style.shell);
    roundRect(c, 0, y, w, height, radii);
    c.fill();
    if (style.grain) {
      for (let i = 3; i < height - 2; i += 2) {
        c.fillStyle = i % 3 === 0 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.16)';
        c.fillRect(2, y + i, w - 4, 0.48);
      }
    }
    c.strokeStyle = style.edge;
    c.lineWidth = 0.75;
    c.stroke();
  }

  function drawLighterBody(c, x, y, lid, wheelSpin, style) {
    const { w, h } = LIGHTER;
    c.save();
    c.translate(x, y);
    if (lid > 0) {
      // 防风罩、棉芯和火石轮在翻盖下面。
      c.fillStyle = across(c, 5, 0, 13, 0, ['#686b6d', '#d9dce1', '#73777c']);
      roundRect(c, 5, 1, 13, 16, [2, 2, 0, 0]);
      c.fill();
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          c.fillStyle = '#343237';
          c.beginPath();
          c.arc(7.8 + col * 3.7, 5 + row * 4, 1.05, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = '#c7b38a';
      c.fillRect(10.5, -1, 2, 3);
      c.fillStyle = '#434447';
      c.beginPath();
      c.arc(w - 6, 9, 4.2, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#bec1c4';
      c.lineWidth = 0.65;
      for (let i = 0; i < 6; i++) {
        const a = wheelSpin + i * Math.PI / 3;
        c.beginPath();
        c.moveTo(w - 6 + Math.cos(a) * 2.1, 9 + Math.sin(a) * 2.1);
        c.lineTo(w - 6 + Math.cos(a) * 3.7, 9 + Math.sin(a) * 3.7);
        c.stroke();
      }
    }
    shellPanel(c, 15, h - 15, [0, 0, 4, 4], style);
    caption(c, 'ZIPPO', w / 2, 39, 6, style.ink);
    c.save();
    c.translate(1, 15);
    c.rotate(-lid * 2.3);
    c.translate(-1, -15);
    shellPanel(c, 0, 14.5, [4, 4, 0, 0], style);
    c.restore();
    c.fillStyle = style.ink;
    c.fillRect(0, 13, 2, 4);
    c.restore();
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
      this.packStyle = PACK_STYLES[0];
      this.lighterStyle = ZIPPO_STYLES[0];
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

    setStyles(pack, lighter) {
      const nextPack = PACK_STYLES[pack] || PACK_STYLES[0];
      const nextLighter = ZIPPO_STYLES[lighter] || ZIPPO_STYLES[0];
      if (this.packStyle !== nextPack) this.staticDirty = true;
      if (this.packStyle !== nextPack || this.lighterStyle !== nextLighter) this.midKey = '';
      this.packStyle = nextPack;
      this.lighterStyle = nextLighter;
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
      drawPack(c, this.packStyle);
      this.staticDirty = false;
    }

    // 烟头闪烁只需要每秒 5 次，mid 层因此不用跟着 30fps 重画
    flicker() { return Math.floor(this.T * 5) / 5; }

    drawCig(c, p) {
      const s = this.sim;
      const lit = s.phase === 'lit' || (s.phase === 'stubbing' && s.counted);
      const used = s.counted || s.burned > 0;
      const style = this.packStyle;
      const rem = TOBACCO * (1 - s.burned), r = CIG_R * style.width;
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
      c.fillStyle = across(c, 0, -r, 0, r * 2, style.filter, 0.3);
      c.fillRect(fx, -r, FILTER, r * 2);
      c.fillStyle = style.speck;
      for (let i = 0; i < 22; i++) {
        c.fillRect(fx + this.ashJitter[i] * (FILTER - 2), -r + this.ashJitter[(i + 7) % 24] * r * 2 - 0.5, 1.2, 1);
      }
      c.fillStyle = style.band;
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
      let x = LIGHTER.x, y = LIGHTER.y, flame = false, spin = 0, lid = 0;
      if (s.phase === 'lighting') {
        const t = clamp(s.t / window.EmoSim.TUNING.anim.lighting, 0, 1);
        const m = t < 0.28 ? ease(t / 0.28) : t > 0.8 ? 1 - ease((t - 0.8) / 0.2) : 1;
        const p = this.lastPose;
        x = lerp(LIGHTER.x, p.x - 11.5, m);
        y = lerp(LIGHTER.y, p.y + 25, m);
        lid = ease(clamp(Math.min(t / 0.24, (1 - t) / 0.16), 0, 1));
        flame = t > 0.28 && t < 0.81;
        spin = t * 18;
      }
      groundShadow(c, LIGHTER.x + LIGHTER.w / 2, LIGHTER.y + LIGHTER.h + 1, 22, 6);
      drawLighterBody(c, x, y, lid, spin, this.lighterStyle);
      if (flame) drawFlame(c, x + 11.5, y, this.T, this.glow);
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
