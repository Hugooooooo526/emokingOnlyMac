const test = require('node:test');
const assert = require('node:assert');
const { Sim, TUNING } = require('../web/sim.js');

const DT = 1 / 30;
const run = (s, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) s.step(DT); };
const types = (s) => s.drain().map((e) => e.type);

function litSim(opts) {
  const s = new Sim({ rand: () => 0.5, ...opts });
  s.clickPack(); run(s, 0.6);
  s.clickLighter(); run(s, 1);
  assert.equal(s.phase, 'lit');
  s.drain();
  return s;
}
// 每 30 秒吸一下，防止 60 秒自动熄灭
function keepAlive(s, seconds) {
  for (let t = 0; t < seconds && s.phase === 'lit'; t += 30) {
    run(s, Math.min(30, seconds - t));
    if (s.phase === 'lit') { s.pressCig(); s.releaseCig(); }
  }
}

test('完整流程：拿烟 → 点烟 → 掐灭，计一支', () => {
  const s = new Sim();
  assert.equal(s.phase, 'empty');
  s.clickPack(); assert.equal(s.phase, 'drawing');
  run(s, 0.6); assert.equal(s.phase, 'unlit');
  assert.equal(s.count, 0);
  s.clickLighter(); run(s, 1);
  assert.equal(s.phase, 'lit');
  assert.equal(s.count, 1);
  s.clickAshtray(); assert.equal(s.phase, 'stubbing');
  run(s, 0.8);
  assert.equal(s.phase, 'empty');
  assert.equal(s.butts, 1);
  assert.equal(s.tutorialDone, true);
});

test('不吸的话约 4 分钟烧完（只靠轻点续命的误差在 15 秒内）', () => {
  const s = litSim();
  let t = 0;
  while (s.phase === 'lit' && t < 400) {
    run(s, 50); t += 50;
    if (s.phase === 'lit') { s.pressCig(); s.step(DT); s.releaseCig(); }
  }
  assert.ok(t >= 200 && t <= 250, `烧了 ${t} 秒`);
  run(s, 1);
  assert.equal(s.phase, 'empty');
  assert.equal(s.butts, 1);
});

test('按住时烧得更快，松手按时长吐烟', () => {
  const s = litSim();
  s.pressCig(); run(s, 1);
  const fast = s.burned;
  assert.ok(Math.abs(fast - TUNING.puffBurnMult / TUNING.burnSeconds) < 0.002);
  s.releaseCig();
  const ex = s.drain().find((e) => e.type === 'exhale');
  assert.ok(ex.power > 0.35 && ex.power < 0.45);
});

test('轻点是小口，长按封顶', () => {
  const s = litSim();
  s.pressCig(); s.releaseCig();
  assert.equal(s.drain().find((e) => e.type === 'exhale').power, TUNING.tapPower);
  s.pressCig(); run(s, 6); s.releaseCig();
  assert.equal(s.drain().find((e) => e.type === 'exhale').power, 1);
});

test('60 秒不吸自动熄灭，吸一口会重新计时', () => {
  const s = litSim();
  run(s, 50); s.pressCig(); s.releaseCig();
  run(s, 50); assert.equal(s.phase, 'lit');
  run(s, 11); assert.equal(s.phase, 'out');
});

test('熄灭后可以重点，且不重复计数', () => {
  const s = litSim();
  run(s, 61); assert.equal(s.phase, 'out');
  const b = s.burned;
  s.clickLighter(); run(s, 1);
  assert.equal(s.phase, 'lit');
  assert.equal(s.count, 1);
  assert.ok(s.burned >= b);
});

test('熄灭后点烟盒：旧烟进烟灰缸，直接拿新的', () => {
  const s = litSim();
  run(s, 61);
  s.clickPack(); assert.equal(s.phase, 'stubbing');
  run(s, 0.8); assert.equal(s.phase, 'drawing');
  assert.equal(s.butts, 1);
  run(s, 0.6); assert.equal(s.phase, 'unlit');
  assert.equal(s.burned, 0);
});

test('抖灰清空烟灰并进烟灰缸', () => {
  const s = litSim();
  keepAlive(s, 20);
  assert.ok(s.ash > 0);
  s.drain(); s.flick();
  assert.ok(types(s).includes('ash'));
  assert.equal(s.ash, 0);
  assert.ok(s.ashPile > 0);
});

test('太久不抖会自己断', () => {
  const s = litSim();
  let broke = false;
  for (let i = 0; i < 90 * 30 && !broke; i++) {
    s.step(DT);
    if (i % 900 === 0) { s.pressCig(); s.releaseCig(); }
    broke = s.drain().some((e) => e.type === 'ash' && e.cause === 'break');
  }
  assert.ok(broke);
  assert.equal(s.ash, 0);
});

test('没点过的烟放回盒子，不算数也不留烟头', () => {
  const s = new Sim();
  s.clickPack(); run(s, 0.6);
  s.clickAshtray(); run(s, 0.5);
  assert.equal(s.phase, 'empty');
  assert.equal(s.count, 0);
  assert.equal(s.butts, 0);
});

test('手上有烟时点烟盒只给提示，没烟时点打火机只给提示', () => {
  const s = litSim();
  s.clickPack();
  assert.equal(s.phase, 'lit');
  assert.ok(s.drain().some((e) => e.key === 'busy'));
  const e = new Sim();
  e.clickLighter();
  assert.equal(e.phase, 'empty');
  assert.ok(e.drain().some((x) => x.key === 'noCig'));
});

test('掐灭时正在吸也会吐完这一口', () => {
  const s = litSim();
  s.pressCig(); run(s, 1); s.clickAshtray();
  assert.ok(types(s).includes('exhale'));
  assert.equal(s.puffing, false);
});

test('跨天清零，存档能恢复', () => {
  let day = '2026-11-08';
  const s = new Sim({ today: () => day, rand: () => 0.5 });
  s.clickPack(); run(s, 0.6); s.clickLighter(); run(s, 1);
  s.clickAshtray(); run(s, 0.8);
  const saved = s.snapshot();
  assert.equal(saved.count, 1);
  assert.equal(new Sim({ saved, today: () => day }).count, 1);
  day = '2026-11-09';
  assert.equal(new Sim({ saved, today: () => day }).count, 0);
  s.clickPack();
  assert.equal(s.count, 0);
  assert.equal(s.butts, 0);
});
