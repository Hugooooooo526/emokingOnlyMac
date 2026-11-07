// 吸烟模拟器的全部规则。这里不碰 DOM，所以能在 node 里直接测试。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmoSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TUNING = {
    burnSeconds: 240,     // 不吸时一支烟烧完约 4 分钟
    puffBurnMult: 7,      // 吸的时候烧得更快
    autoOutSeconds: 60,   // 60 秒不吸自动熄灭
    fullPuffSeconds: 2.5, // 按住这么久就是最大一口
    tapPower: 0.15,       // 轻点的小口
    ashBreakMin: 0.2,     // 烟灰长到这个比例会自己断
    ashBreakMax: 0.3,
    minFlickAsh: 0.004,
    anim: { drawing: 0.55, lighting: 0.9, stubbing: 0.75, putback: 0.4 },
  };

  function localDay(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  class Sim {
    constructor({ saved = {}, rand = Math.random, today = () => localDay(new Date()) } = {}) {
      this.rand = rand;
      this.today = today;
      this.events = [];
      this.date = saved.date || today();
      this.count = saved.count || 0;
      this.butts = saved.butts || 0;
      this.ashPile = saved.ashPile || 0;
      this.tutorialDone = !!saved.tutorialDone;
      this.queueNew = false;
      this.resetCig();
      this.phase = 'empty';
      this.syncDay();
    }

    resetCig() {
      this.burned = 0;
      this.ash = 0;
      this.ashLimit = this.nextAshLimit();
      this.counted = false;
      this.puffing = false;
      this.puffTime = 0;
      this.idle = 0;
      this.t = 0;
    }

    nextAshLimit() {
      return TUNING.ashBreakMin + this.rand() * (TUNING.ashBreakMax - TUNING.ashBreakMin);
    }

    emit(type, data) { this.events.push({ type, ...data }); }
    drain() { const e = this.events; this.events = []; return e; }

    snapshot() {
      return {
        date: this.date, count: this.count, butts: this.butts,
        ashPile: this.ashPile, tutorialDone: this.tutorialDone,
      };
    }

    syncDay() {
      const d = this.today();
      if (d === this.date) return;
      this.date = d;
      this.count = 0;
      this.butts = 0;
      this.ashPile = 0;
      this.emit('save');
    }

    setPhase(phase) {
      this.phase = phase;
      this.t = 0;
      this.emit('phase', { phase });
    }

    // ---- 玩家操作 ----
    clickPack() {
      this.syncDay();
      if (this.phase === 'empty') this.setPhase('drawing');
      else if (this.phase === 'out') { this.queueNew = true; this.setPhase('stubbing'); }
      else if (this.phase === 'lit') this.emit('hint', { key: 'busy' });
    }

    clickLighter() {
      this.syncDay();
      if (this.phase === 'unlit' || this.phase === 'out') this.setPhase('lighting');
      else if (this.phase === 'empty') this.emit('hint', { key: 'noCig' });
    }

    clickAshtray() {
      this.syncDay();
      if (this.phase === 'lit' || this.phase === 'out') {
        this.endPuff();
        this.setPhase('stubbing');
      } else if (this.phase === 'unlit') {
        // 没点过的烟放回盒子，不算一支；点过又灭的走上面的 out 分支
        this.setPhase('putback');
      }
    }

    pressCig() {
      if (this.phase === 'lit') {
        this.puffing = true;
        this.puffTime = 0;
        this.emit('puffStart');
      } else if (this.phase === 'unlit' || this.phase === 'out') {
        this.emit('hint', { key: 'notLit' });
      }
    }

    releaseCig() { this.endPuff(); }

    endPuff() {
      if (!this.puffing) return;
      this.puffing = false;
      this.idle = 0;
      const power = Math.min(1, Math.max(TUNING.tapPower, this.puffTime / TUNING.fullPuffSeconds));
      this.emit('exhale', { power });
    }

    flick() {
      if (this.phase !== 'lit' && this.phase !== 'out') return;
      this.emit('flick');
      if (this.ash >= TUNING.minFlickAsh) this.dropAsh('flick');
    }

    dropAsh(cause) {
      const amount = this.ash;
      this.ashPile = Math.min(1, this.ashPile + amount * 0.2);
      this.ash = 0;
      this.ashLimit = this.nextAshLimit();
      this.emit('ash', { amount, cause });
      this.emit('save');
    }

    // ---- 时间推进 ----
    step(dt) {
      this.t += dt;
      const A = TUNING.anim;
      switch (this.phase) {
        case 'drawing':
          if (this.t >= A.drawing) this.setPhase('unlit');
          break;
        case 'putback':
          if (this.t >= A.putback) { this.resetCig(); this.setPhase('empty'); }
          break;
        case 'lighting':
          if (this.t >= A.lighting) {
            this.idle = 0;
            if (!this.counted) {
              this.counted = true;
              this.count += 1;
              this.emit('save');
            }
            this.setPhase('lit');
          }
          break;
        case 'lit':
          this.burn(dt);
          break;
        case 'stubbing':
          if (this.t >= A.stubbing) this.finishStub();
          break;
      }
    }

    burn(dt) {
      const rate = (this.puffing ? TUNING.puffBurnMult : 1) / TUNING.burnSeconds;
      const d = Math.min(rate * dt, 1 - this.burned);
      this.burned += d;
      this.ash += d;
      if (this.puffing) { this.puffTime += dt; this.idle = 0; }
      else this.idle += dt;

      if (this.ash >= this.ashLimit) this.dropAsh('break');
      if (this.burned >= 1) {
        this.endPuff();
        this.setPhase('stubbing');
      } else if (this.idle >= TUNING.autoOutSeconds) {
        this.setPhase('out');
      }
    }

    finishStub() {
      if (this.ash > 0) this.ashPile = Math.min(1, this.ashPile + this.ash * 0.2);
      if (this.counted) {
        this.butts += 1;
        this.tutorialDone = true;
      }
      this.resetCig();
      this.emit('save');
      this.emit('butt');
      const next = this.queueNew;
      this.queueNew = false;
      this.setPhase(next ? 'drawing' : 'empty');
    }
  }

  return { Sim, TUNING, localDay };
});
