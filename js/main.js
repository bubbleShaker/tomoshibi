import { Scene } from './scene.js';
import { Sound } from './audio.js';
import { Breath, TEMPOS } from './breath.js';

const $ = s => document.querySelector(s);
const KEY = 'tomoshibi.v1';

// ---- 保存（使えない環境でも動くように） ----
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}
const data = load();
data.settings = Object.assign({ min: 3, tempo: 'normal', mode: 'touch', muted: false }, data.settings);
data.sessions = Array.isArray(data.sessions) ? data.sessions : [];

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function streak() {
  const days = new Set(data.sessions.map(s => s.day));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---- 描画と音 ----
const scene = new Scene($('#sky'));
const sound = new Sound();
sound.muted = !!data.settings.muted;
addEventListener('resize', () => { scene.resize(); placeGuide(); });

const guide = $('#guide');
const whisper = $('#whisper');
function placeGuide() {
  guide.style.top = `${scene.ringY + scene.ringR[1] + 28}px`;
}
placeGuide();
let guideText = '';
function say(text, cls = '') {
  if (text !== guideText) { guide.textContent = text; guideText = text; }
  guide.className = cls;
}

// ---- 設定の UI ----
for (const seg of document.querySelectorAll('.seg')) {
  const key = seg.dataset.key;
  const mark = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(data.settings[key])));
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    data.settings[key] = key === 'min' ? Number(b.dataset.v) : b.dataset.v;
    mark(); save();
  });
  mark();
}

const MOODS = [
  ['つらい', 'M9 16.5q3-2.5 6 0'],
  ['少し重い', 'M9 16q3-1.2 6 0'],
  ['ふつう', 'M9 15.5h6'],
  ['落ち着いている', 'M9 15q3 1.6 6 0'],
  ['とても穏やか', 'M8.5 14.5q3.5 3 7 0'],
];
const mood = { before: 0, after: 0 };
for (const box of document.querySelectorAll('.moods')) {
  const key = box.dataset.key;
  box.innerHTML = MOODS.map(([label, mouth], i) => {
    const eyes = i === 4 ? 'M8 10.5q1.2-1 2.4 0M13.6 10.5q1.2-1 2.4 0' : 'M9.2 10v.6M14.8 10v.6';
    return `<button data-v="${i + 1}" aria-label="${label}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="${eyes}"/><path d="${mouth}"/></svg></button>`;
  }).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = Number(b.dataset.v);
    mood[key] = mood[key] === v ? 0 : v;
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', Number(x.dataset.v) === mood[key]));
    if (key === 'after') onAfterMood();
  });
}
function clearMoods() {
  mood.before = mood.after = 0;
  document.querySelectorAll('.moods button').forEach(b => b.classList.remove('on'));
}

const muteBtn = $('#mute');
muteBtn.classList.toggle('off', sound.muted);
muteBtn.addEventListener('click', () => {
  data.settings.muted = !sound.muted;
  sound.init();
  sound.setMuted(data.settings.muted);
  muteBtn.classList.toggle('off', sound.muted);
  save();
});

function showStreak() {
  const n = streak(), total = data.sessions.length;
  const text = total === 0 ? '' : n >= 2 ? `${n} 日つづいています（これまで ${total} 回）` : `これまで ${total} 回`;
  $('#streak').textContent = text;
  $('#streak2').textContent = text;
}
showStreak();

// ---- 画面を消さない ----
let lock = null;
async function wake(on) {
  try {
    if (on && !lock && 'wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    } else if (!on && lock) {
      await lock.release(); lock = null;
    }
  } catch {}
}

// ---- セッション ----
const WHISPERS = [
  '肩の力を、そっと抜いて',
  'うまくやろうとしなくて大丈夫',
  '今日のことは、灯籠にあずけて',
  '吐く息が、いちばん大事',
  'あごと眉間を、ゆるめて',
  'ここには、急ぐことは何もありません',
];
let ses = null;
let current = null;

function panel(el, show) {
  if (show) { el.hidden = false; el.classList.remove('leave'); return; }
  el.classList.add('leave');
  setTimeout(() => { el.hidden = true; el.classList.remove('leave'); }, 850);
}

function start() {
  const st = data.settings;
  const tempo = TEMPOS[st.tempo] || TEMPOS.normal;
  const auto = st.mode === 'eyes';
  sound.init();
  sound.ambience(1);
  panel($('#title'), false);
  panel($('#end'), false);
  $('#pad').hidden = false;
  $('#quit').hidden = false;
  $('#bar').hidden = false;
  scene.demo = false;
  scene.p = 0;
  scene.breaths = 0;
  scene.dimTarget = auto ? .35 : 0;
  scene.ring.visTarget = 1;

  ses = {
    T: st.min * 60, el: 0, auto, tempo, minutes: st.min, before: mood.before,
    whisperAt: 30, whisperI: Math.floor(Math.random() * WHISPERS.length), ending: false,
  };
  ses.breath = new Breath({ ...tempo, auto }, {
    inhale() { current = scene.spawn(); },
    exhale({ fullness }) {
      if (!current) return;
      current.drifting = true;
      current.pushing = true;
      sound.chime(.5 + .5 * fullness);
    },
    exhaleEnd({ q }) {
      if (current) { current.pushing = false; current.glow = q; current.size = .7 + .3 * q; }
      current = null;
      scene.breaths++;
    },
    cue(kind) {
      if (ses.auto) return;
      try { navigator.vibrate?.(12); } catch {}
      sound.cue(kind);
    },
    done: finish,
  });
  wake(true);
}

function finish() {
  if (!ses || ses.ending) return;
  ses.ending = true;
  if (current) { current.pushing = false; current = null; }
  scene.ring.visTarget = 0;
  scene.dimTarget = 0;
  scene.p = 1;
  $('#pad').hidden = true;
  $('#quit').hidden = true;
  wake(false);
  const b = ses.breath;
  const count = b.count;
  if (count === 0) { say(''); toTitle(); return; }
  say('おつかれさまでした');
  const rec = {
    day: dayKey(), at: Date.now(), min: Math.round(ses.el / 6) / 10, breaths: count,
    out: Math.round(b.avgExhale() * 10) / 10, before: ses.before || null, after: null,
  };
  data.sessions.push(rec);
  if (data.sessions.length > 400) data.sessions.splice(0, data.sessions.length - 400);
  save();
  ses.rec = rec;
  $('#s-count').innerHTML = `${count}<small>個</small>`;
  $('#s-out').innerHTML = rec.out ? `${rec.out.toFixed(1)}<small>秒</small>` : '—';
  const m = Math.floor(ses.el / 60), s = Math.round(ses.el % 60);
  $('#s-time').innerHTML = m ? `${m}<small>分</small>${s ? `${s}<small>秒</small>` : ''}` : `${s}<small>秒</small>`;
  $('#mood-diff').textContent = '';
  document.querySelectorAll('.moods[data-key=after] button').forEach(x => x.classList.remove('on'));
  mood.after = 0;
  showStreak();
  setTimeout(() => {
    say('', 'hide');
    $('#bar').hidden = true;
    sound.ambience(.6);
    panel($('#end'), true);
  }, 3800);
}

function onAfterMood() {
  if (!ses?.rec) return;
  ses.rec.after = mood.after || null;
  save();
  const a = ses.rec.before, b = ses.rec.after;
  $('#mood-diff').textContent = a && b ? (b > a ? '少し、ゆるみましたね。' : 'いまの自分に気づけたことが、いちばん大事です。') : '';
}

function toTitle() {
  ses = null;
  clearMoods();
  $('#bar').hidden = true;
  $('#pad').hidden = true;
  $('#quit').hidden = true;
  scene.p = 0;
  scene.demo = true;
  scene.demoT = 3;
  scene.ring.visTarget = 0;
  scene.dimTarget = 0;
  say('', 'hide');
  showStreak();
  panel($('#end'), false);
  panel($('#title'), true);
}

$('#start').addEventListener('click', start);
$('#again').addEventListener('click', () => { mood.before = mood.after; start(); });
$('#back').addEventListener('click', toTitle);
$('#quit').addEventListener('click', () => {
  if (!ses) return;
  ses.breath.stopAfter = true;
  if (ses.breath.state === 'in') ses.breath.release();
  ses.breath.end();
});

// ---- 押す・離す ----
const pad = $('#pad');
const held = new Set();
const press = () => { if (ses && !ses.auto && !ses.ending) ses.breath.press(); };
const release = () => { if (ses && !ses.auto) ses.breath.release(); };
pad.addEventListener('pointerdown', e => {
  e.preventDefault();
  held.add(e.pointerId);
  try { pad.setPointerCapture(e.pointerId); } catch {}
  if (held.size === 1) press();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  pad.addEventListener(ev, e => {
    if (!held.delete(e.pointerId)) return;
    if (held.size === 0) release();
  });
}
pad.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && ses) { e.preventDefault(); press(); } });
addEventListener('keyup', e => { if (e.code === 'Space' && ses) release(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    held.clear(); release();
    sound.suspend();
  } else {
    sound.resume();
    if (ses && !ses.ending) wake(true);
    last = performance.now();
  }
});

// ---- 案内の文言 ----
function updateGuide() {
  if (!ses || ses.ending) return;
  const b = ses.breath, { I, E } = b;
  const soft = b.count >= 6 ? 'soft' : '';
  if (ses.auto) {
    if (ses.el < 9) return say('目を閉じて、音に合わせて呼吸します');
    return say(b.state === 'in' ? '吸って' : 'ゆっくり吐いて', soft);
  }
  if (b.state === 'idle') return say(b.count === 0 ? '画面を押して、ゆっくり吸って' : '押して、吸って', b.count === 0 ? '' : soft);
  if (b.state === 'in') return say(b.t < I ? '吸って…' : 'はなして、ゆっくり吐いて', soft);
  if (b.state === 'out') return say(b.t < E ? 'ゆっくり吐いて…' : '押して、吸って', soft);
}

function updateWhisper(dt) {
  if (!ses || ses.ending) return;
  if (ses.el >= ses.whisperAt && ses.el < ses.T - 12) {
    whisper.textContent = WHISPERS[ses.whisperI++ % WHISPERS.length];
    whisper.classList.add('on');
    ses.whisperHide = ses.el + 7;
    ses.whisperAt += 45;
  }
  if (ses.whisperHide && ses.el >= ses.whisperHide) { whisper.classList.remove('on'); ses.whisperHide = 0; }
}

// ---- ループ（30fps で十分） ----
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .1);
  last = now;
  acc += dt;
  if (acc < 1 / 31) return;
  const step = Math.min(acc, .1);
  acc = 0;

  if (ses && !ses.ending) {
    ses.el += step;
    scene.p = Math.min(ses.el / ses.T, 1);
    if (ses.el >= ses.T) ses.breath.stopAfter = true;
    $('#bar i').style.width = `${(scene.p * 100).toFixed(2)}%`;
  }
  ses?.breath.update(step); // 1 回も呼吸せずに終わると、ここで ses が null になる
  if (ses) {
    const b = ses.breath;
    const R = scene.ring;
    R.level = b.level;
    R.arc = b.state === 'in' ? Math.min(b.t / b.I, 1) : b.state === 'out' ? 1 - Math.min(b.t / b.E, 1) : 0;
    if (current) {
      if (b.state === 'in') current.flame = b.level;
      if (b.state === 'out') { current.glow = Math.min(b.t / b.E, 1); current.size = .7 + .3 * current.glow; }
    }
    sound.breathe(b.level, b.flow, (b.I + b.E) / 2, ses.auto && !ses.ending);
    updateGuide();
    updateWhisper(step);
    if (ses.ending) whisper.classList.remove('on');
  }
  scene.update(step);
  scene.draw();
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 確認用
window.__tomoshibi = { scene, sound, get ses() { return ses; } };
