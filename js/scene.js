// 夜の水面の描画。灯籠・蛍・星・月・葦。強い光や点滅は使わない。

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;

// 決まった並びの乱数（星や山の形を毎回同じにする）
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const Z_FAR = 10;

export class Scene {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    this.calm = mq.matches;
    mq.addEventListener?.('change', e => (this.calm = e.matches));

    this.time = 0;
    this.p = 0;        // 目標の進み具合 0..1（夕暮れ→夜→月）
    this.pd = 0;       // 表示中の進み具合（ゆっくり追いかける）
    this.breaths = 0;
    this.lanterns = [];
    this.demo = true;
    this.demoT = 4;
    this.dim = 0;
    this.dimTarget = 0;
    this.ring = { vis: 0, visTarget: 0, level: 0, arc: 0 };

    const r = rng(7);
    this.stars = Array.from({ length: 240 }, () => ({
      x: r(), y: r() ** 1.4, s: .5 + r() * r() * 1.4, th: r(), ph: r() * TAU, f: .2 + r() * .5,
    }));
    this.flies = Array.from({ length: 28 }, () => ({
      x: r(), y: r(), ph: r() * TAU, fx: .05 + r() * .08, fy: .04 + r() * .07, a: 0,
      bl: .35 + r() * .4,
    }));
    this.reeds = Array.from({ length: 34 }, (_, i) => {
      const left = i % 2 === 0;
      return { left, x: r() * .22, h: .06 + r() * .13, bend: (r() - .5) * .5, ph: r() * TAU, w: 1 + r() * 1.6 };
    });
    this.mts = [0, 1].map(k => Array.from({ length: 6 }, () => ({ f: 1 + r() * 5, ph: r() * TAU, a: r() })));

    this.resize();
    for (const z of [2.2, 4.5, 7]) this.addDemoLantern(z);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (this.W = window.innerWidth);
    const H = (this.H = window.innerHeight);
    this.c.width = Math.round(W * dpr);
    this.c.height = Math.round(H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.horizon = H * .56;
    this.shore = H * .93;
    this.unit = Math.min(W * .12, H * .07, 64);
    this.ringY = this.horizon * .5;
    this.ringR = [this.unit * .7, this.unit * 1.9];
    this.moonR = Math.min(W, H) * .055;
    this.ridge = this.mts.map((waves, k) => {
      const n = 64, pts = [];
      for (let i = 0; i <= n; i++) {
        const x = i / n;
        let h = 0;
        for (const w of waves) h += Math.sin(x * w.f * TAU * .5 + w.ph) * (.35 + w.a * .65);
        h = (h / waves.length + .6) * (k === 0 ? .055 : .03) * H;
        if (k === 1) h *= smooth(.5, .05, x) + smooth(.5, .95, x); // 手前の山は両端だけ
        pts.push([x * W, this.horizon - Math.max(h, 0)]);
      }
      return pts;
    });
  }

  // 灯籠の位置：z=1 が岸、z=Z_FAR が地平線。遠いほど小さく、地平線へ寄る
  project(l) {
    const y = this.horizon + (this.shore - this.horizon) / l.z;
    const x = this.W / 2 + l.X / l.z;
    return [x, y, this.unit / l.z];
  }

  spawn() {
    for (const o of this.lanterns) if (o.z < 1.4) o.z = 1.4;
    const side = Math.random() < .5 ? -1 : 1;
    const l = {
      z: 1, X: 0, tx: side * (this.W * (.15 + Math.random() * .75)),
      flame: 0, glow: 0, size: .75, pushing: false, drifting: false,
      a: 0, ph: Math.random() * TAU,
    };
    this.lanterns.push(l);
    return l;
  }

  addDemoLantern(z = 1.2) {
    const l = this.spawn();
    l.z = z; l.flame = 1; l.glow = .5 + Math.random() * .5; l.size = .8 + l.glow * .2;
    l.drifting = true; l.a = z > 1.3 ? 1 : 0;
    l.X = l.tx * smooth(1, 4, z);
  }

  update(dt) {
    this.time += dt;
    this.pd += clamp(this.p - this.pd, -dt * .04, dt * .05);
    this.dim += clamp(this.dimTarget - this.dim, -dt * .3, dt * .3);
    const R = this.ring;
    R.vis += clamp(R.visTarget - R.vis, -dt * .8, dt * .8);

    if (this.demo) {
      this.demoT -= dt;
      if (this.demoT <= 0) { this.addDemoLantern(); this.demoT = 7 + Math.random() * 4; }
    }

    for (const l of this.lanterns) {
      l.a = Math.min(1, l.a + dt * .8);
      if (l.drifting) {
        l.z += dt * (.055 + (l.pushing ? .2 : 0)) * (l.z * .3 + .7);
        l.X = lerp(0, l.tx, smooth(1, 4.5, l.z));
      }
    }
    this.lanterns = this.lanterns.filter(l => l.z < Z_FAR);

    const want = Math.min(4 + this.breaths * 2, this.flies.length) * (this.demo ? .4 : 1);
    this.flies.forEach((f, i) => { f.a = clamp(f.a + (i < want ? dt : -dt) * .25, 0, 1); });
  }

  draw() {
    const { g, W, H, horizon, time } = this;
    const p = this.pd;
    const calm = this.calm ? .25 : 1;

    // 空：夕暮れの紫から夜の藍へ
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, mix([16, 22, 58], [6, 9, 26], smooth(0, .6, p)));
    sky.addColorStop(.7, mix([38, 36, 84], [12, 17, 46], smooth(0, .7, p)));
    sky.addColorStop(1, mix([86, 62, 104], [26, 32, 72], smooth(0, .8, p)));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, horizon + 1);

    // 星
    const shown = .12 + p * 1.0;
    for (const s of this.stars) {
      const a = smooth(s.th, s.th + .08, shown);
      if (a <= 0) continue;
      const tw = .65 + .35 * Math.sin(time * s.f * calm + s.ph);
      g.globalAlpha = a * tw * .8;
      g.fillStyle = '#f4ecdc';
      const y = s.y * horizon * .9;
      g.fillRect(s.x * W, y, s.s, s.s);
    }
    g.globalAlpha = 1;

    // 月：p=0.15 から昇り始める
    const mp = smooth(.12, 1, p);
    const mx = W * .82, my = lerp(horizon + this.moonR * 1.2, H * .13, mp), mr = this.moonR;
    const moonUp = clamp((horizon - my) / (mr * 2), 0, 1);
    if (my - mr < horizon) {
      g.save();
      g.beginPath(); g.rect(0, 0, W, horizon); g.clip();
      const halo = g.createRadialGradient(mx, my, mr * .8, mx, my, mr * 6);
      halo.addColorStop(0, `rgba(255,236,200,${.16 * moonUp})`);
      halo.addColorStop(1, 'rgba(255,236,200,0)');
      g.fillStyle = halo; g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
      const body = g.createRadialGradient(mx - mr * .3, my - mr * .3, mr * .1, mx, my, mr);
      body.addColorStop(0, '#fbf1d8'); body.addColorStop(1, '#e8d6ae');
      g.fillStyle = body;
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.restore();
    }

    // 山
    const mtC = [mix([42, 34, 74], [16, 21, 48], smooth(0, .7, p)), mix([24, 20, 46], [9, 12, 30], smooth(0, .7, p))];
    this.ridge.forEach((pts, k) => {
      g.fillStyle = mtC[k];
      g.beginPath(); g.moveTo(0, horizon + 1);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(W, horizon + 1); g.closePath(); g.fill();
    });

    // 水
    const water = g.createLinearGradient(0, horizon, 0, H);
    water.addColorStop(0, mix([40, 34, 72], [16, 22, 52], smooth(0, .8, p)));
    water.addColorStop(.35, mix([16, 18, 44], [9, 13, 34], smooth(0, .8, p)));
    water.addColorStop(1, '#04060f');
    g.fillStyle = water;
    g.fillRect(0, horizon, W, H - horizon);

    // さざ波
    const rows = 42;
    g.lineWidth = 1;
    for (let k = 1; k <= rows; k++) {
      const d = k / rows;
      const y = horizon + (H - horizon) * d * d;
      const len = 4 + d * 60, gap = .55;
      g.strokeStyle = `rgba(160,176,230,${.035 + .07 * (1 - d) * (.6 + .4 * p)})`;
      g.beginPath();
      const step = Math.max(4, len / 3);
      for (let x = -step; x < W + step; x += step) {
        const v = Math.sin(x / len + k * 1.7 + time * (.25 + .15 * Math.sin(k)) * calm);
        if (v > gap) { g.moveTo(x, y + Math.sin(time * .6 * calm + k) * .8); g.lineTo(x + step * .9, y); }
      }
      g.stroke();
    }

    // 月の映り込み
    if (moonUp > 0) {
      g.fillStyle = '#f5e7c6';
      let k = 0;
      for (let y = horizon + 2; y < H; y += 3, k++) {
        const d = (y - horizon) / (H - horizon);
        const h1 = Math.sin(k * 12.9898) * 43758.5453, r1 = h1 - Math.floor(h1);
        const h2 = Math.sin(k * 78.233) * 12345.678, r2 = h2 - Math.floor(h2);
        const sh = .5 + .5 * Math.sin(time * (.5 + r1 * .9) * calm + r2 * TAU);
        const w = mr * (.3 + 2.4 * d) * (.25 + .75 * r1);
        const off = (r2 - .5) * mr * (.5 + 1.8 * d) + Math.sin(time * .3 * calm + k * .7) * mr * .15 * d;
        g.globalAlpha = .26 * moonUp * (1 - d * .6) * sh * sh;
        g.fillRect(mx - w / 2 + off, y, w, 1.2);
      }
      g.globalAlpha = 1;
    }

    // 灯籠（遠い順）
    const ls = [...this.lanterns].sort((a, b) => b.z - a.z);
    for (const l of ls) this.drawLantern(l, calm);

    // 蛍
    for (const f of this.flies) {
      if (f.a <= .01) continue;
      const x = W * (f.x + .06 * Math.sin(time * f.fx * calm + f.ph));
      const y = lerp(horizon - H * .14, H * .88, f.y) + H * .03 * Math.sin(time * f.fy * calm + f.ph * 2);
      const b = f.a * (.25 + .75 * (.5 + .5 * Math.sin(time * f.bl + f.ph)) ** 2);
      const r = 7;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(222,255,170,${.9 * b})`);
      gr.addColorStop(.25, `rgba(190,240,140,${.35 * b})`);
      gr.addColorStop(1, 'rgba(190,240,140,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 葦（左右の手前）
    g.strokeStyle = '#03050c';
    g.lineCap = 'round';
    for (const r of this.reeds) {
      const bx = r.left ? r.x * W : W - r.x * W;
      const h = r.h * H * (1 - r.x * 1.6);
      const sway = Math.sin(time * .45 * calm + r.ph) * 5 * calm + r.bend * h * .4;
      g.lineWidth = r.w;
      g.beginPath();
      g.moveTo(bx, H + 2);
      g.quadraticCurveTo(bx + sway * .3, H - h * .5, bx + sway, H - h);
      g.stroke();
    }

    this.drawRing();

    // 四隅を少し暗く
    const v = g.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .35, W / 2, H * .45, Math.max(W, H) * .8);
    v.addColorStop(0, 'rgba(2,3,10,0)');
    v.addColorStop(1, 'rgba(2,3,10,.45)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);

    if (this.dim > .001) {
      g.fillStyle = `rgba(2,3,10,${this.dim})`;
      g.fillRect(0, 0, W, H);
    }
  }

  drawLantern(l, calm) {
    const { g, time } = this;
    let [x, y, s] = this.project(l);
    s *= l.size;
    const fade = l.a * (1 - smooth(Z_FAR * .72, Z_FAR, l.z));
    if (fade <= 0) return;
    const flick = 1 + (.05 * Math.sin(time * 6.3 + l.ph) + .03 * Math.sin(time * 11.7 + l.ph * 2)) * calm;
    const light = clamp(.15 + .55 * l.flame + .45 * l.glow, 0, 1.15) * flick;
    y += Math.sin(time * .8 * calm + l.ph) * s * .05;
    x += Math.sin(time * .3 * calm + l.ph) * s * .08;

    // 水面への映り込み
    g.save();
    g.translate(x, y + s * .2);
    g.scale(1, 2.8);
    const rr = s * 1.1;
    const ref = g.createRadialGradient(0, 0, 0, 0, 0, rr);
    ref.addColorStop(0, `rgba(255,160,80,${.28 * light * fade})`);
    ref.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = ref; g.fillRect(-rr, -rr, rr * 2, rr * 2);
    g.restore();

    // 光の暈
    const cy = y - s * .5;
    const hr = s * (1.4 + 2.4 * light);
    const halo = g.createRadialGradient(x, cy, s * .2, x, cy, hr);
    halo.addColorStop(0, `rgba(255,180,100,${.32 * light * fade})`);
    halo.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = halo; g.fillRect(x - hr, cy - hr, hr * 2, hr * 2);

    g.globalAlpha = fade;
    if (s < 5) {
      g.fillStyle = mix([110, 70, 50], [255, 210, 150], clamp(light, 0, 1));
      g.fillRect(x - s * .4, y - s * .9, s * .8, s * .85);
      g.globalAlpha = 1;
      return;
    }
    // 台
    g.fillStyle = '#1a1210';
    g.fillRect(x - s * .5, y - s * .1, s, s * .12);
    // 和紙
    const top = y - s * .92, bot = y - s * .1;
    const paper = g.createLinearGradient(0, top, 0, bot);
    const lt = clamp(light, 0, 1);
    paper.addColorStop(0, mix([80, 52, 40], [255, 222, 168], lt));
    paper.addColorStop(.6, mix([96, 60, 42], [255, 196, 120], lt));
    paper.addColorStop(1, mix([70, 44, 34], [236, 150, 80], lt));
    g.fillStyle = paper;
    g.fillRect(x - s * .4, top, s * .8, bot - top);
    // 枠
    g.strokeStyle = 'rgba(30,18,14,.85)';
    g.lineWidth = Math.max(1, s * .05);
    g.strokeRect(x - s * .4, top, s * .8, bot - top);
    g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
    // 屋根
    g.fillStyle = '#1a1210';
    g.beginPath();
    g.moveTo(x - s * .5, top); g.lineTo(x + s * .5, top);
    g.lineTo(x + s * .32, top - s * .12); g.lineTo(x - s * .32, top - s * .12);
    g.closePath(); g.fill();
    g.globalAlpha = 1;
  }

  drawRing() {
    const R = this.ring;
    if (R.vis <= .01) return;
    const { g, W } = this;
    const x = W / 2, y = this.ringY;
    const [r0, r1] = this.ringR;
    const r = lerp(r0, r1, R.level);
    const a = R.vis;

    // 目標の大きさ（うっすら）
    g.strokeStyle = `rgba(255,226,190,${.08 * a})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r1, 0, TAU); g.stroke();

    const fill = g.createRadialGradient(x, y, 0, x, y, r);
    fill.addColorStop(0, `rgba(255,204,150,${(.05 + .1 * R.level) * a})`);
    fill.addColorStop(.75, `rgba(255,190,130,${(.08 + .12 * R.level) * a})`);
    fill.addColorStop(1, 'rgba(255,190,130,0)');
    g.fillStyle = fill;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();

    g.strokeStyle = `rgba(255,226,190,${.38 * a})`;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();

    // 秒の目安（外側の細い弧）
    if (R.arc > .001) {
      g.strokeStyle = `rgba(255,190,122,${.55 * a})`;
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, r1 + 10, -Math.PI / 2, -Math.PI / 2 + TAU * R.arc); g.stroke();
    }
  }
}
