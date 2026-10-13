// 音はすべて Web Audio で合成する（外部ファイルなし）。
// 低いドローン、水音、呼吸に合わせた風、灯籠を流すときの鈴。

const PENTA = [587.33, 659.25, 739.99, 880, 987.77, 1174.66]; // D の五音音階

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastNote = -1;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.4);
    const wet = ctx.createGain();
    wet.gain.value = .55;
    this.verb.connect(wet).connect(this.master);

    this.amb = ctx.createGain();
    this.amb.gain.value = 1;
    this.amb.connect(this.master);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const loopNoise = offset => {
      const s = ctx.createBufferSource();
      s.buffer = noise; s.loop = true; s.start(now, offset);
      return s;
    };

    // ドローン（D・A・E の柔らかい和音）
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = .4;
    const droneGain = ctx.createGain();
    droneGain.gain.value = .55;
    lp.connect(droneGain);
    droneGain.connect(this.amb);
    const send = ctx.createGain(); send.gain.value = .35;
    droneGain.connect(send).connect(this.verb);
    for (const [f, v] of [[146.83, .03], [220, .022], [329.63, .012], [73.42, .03]]) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
        const gn = ctx.createGain(); gn.gain.value = v;
        o.connect(gn).connect(lp); o.start(now);
      }
    }
    this.lfo(.045, 220, lp.frequency);
    this.lfo(.07, .12, droneGain.gain);

    // 水音
    const water = loopNoise(0);
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 480;
    const wh = ctx.createBiquadFilter(); wh.type = 'highpass'; wh.frequency.value = 140;
    const wg = ctx.createGain(); wg.gain.value = .045;
    water.connect(wl).connect(wh).connect(wg).connect(this.amb);
    this.lfo(.11, .018, wg.gain);
    this.lfo(.17, 120, wl.frequency);

    // 呼吸の風
    const wind = loopNoise(1.3);
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = .7;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    wind.connect(this.windF).connect(this.windG);
    this.windG.connect(this.master);
    this.windG.connect(this.verb);

    // 目を閉じるモードの案内音（吸うと上がり、吐くと下がる）
    this.tone = ctx.createOscillator();
    this.tone.type = 'sine'; this.tone.frequency.value = 196;
    this.toneG = ctx.createGain(); this.toneG.gain.value = 0;
    this.tone.connect(this.toneG);
    this.toneG.connect(this.master);
    const ts = ctx.createGain(); ts.gain.value = .6;
    this.toneG.connect(ts).connect(this.verb);
    this.tone.start(now);

    this.master.gain.setTargetAtTime(this.muted ? 0 : .9, now, 1.2);
    this.drops();
  }

  lfo(freq, depth, param) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    o.connect(g).connect(param); o.start();
  }

  impulse(sec) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  // ときどき水滴の音
  drops() {
    const wait = 4000 + Math.random() * 7000;
    setTimeout(() => {
      if (this.ctx && this.ctx.state === 'running') {
        const { ctx } = this, t = ctx.currentTime;
        const o = ctx.createOscillator();
        const f = 900 + Math.random() * 700;
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * .55, t + .09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.012, t + .008);
        g.gain.exponentialRampToValueAtTime(.0001, t + .18);
        o.connect(g); g.connect(this.verb); g.connect(this.amb);
        o.start(t); o.stop(t + .2);
      }
      this.drops();
    }, wait);
  }

  // 毎フレーム：呼吸の流れに合わせて風を、目を閉じるモードでは音程も動かす
  breathe(level, flow, avgDur, guideTone) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = Math.min(Math.abs(flow) * avgDur, 2);
    const inhaling = flow > 0;
    this.windG.gain.setTargetAtTime(.05 * f, t, .12);
    this.windF.frequency.setTargetAtTime(inhaling ? 380 + level * 700 : 260 + level * 520, t, .15);
    this.tone.frequency.setTargetAtTime(196 * 2 ** (level * 7 / 12), t, .08);
    this.toneG.gain.setTargetAtTime(guideTone ? .028 * Math.min(1, f * 1.5 + .25) : 0, t, .25);
  }

  chime(strength = 1) {
    if (!this.ctx) return;
    const { ctx } = this, t = ctx.currentTime;
    let i;
    do i = Math.floor(Math.random() * PENTA.length); while (i === this.lastNote);
    this.lastNote = i;
    const f = PENTA[i];
    for (const [mul, v, dec] of [[1, 1, 3.5], [2.76, .14, 1.2], [5.4, .04, .6]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.045 * strength * v, t + .015);
      g.gain.exponentialRampToValueAtTime(.0001, t + dec);
      o.connect(g); g.connect(this.verb);
      const dry = ctx.createGain(); dry.gain.value = .45; g.connect(dry).connect(this.master);
      o.start(t); o.stop(t + dec + .1);
    }
  }

  // 目安の秒数に届いたときの小さな合図
  cue(kind) {
    if (!this.ctx) return;
    const { ctx } = this, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = kind === 'out' ? 523.25 : 392;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.018, t + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + 1.2);
    o.connect(g).connect(this.verb);
    o.start(t); o.stop(t + 1.3);
  }

  ambience(v) {
    if (this.ctx) this.amb.gain.setTargetAtTime(v, this.ctx.currentTime, 1.5);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : .9, this.ctx.currentTime, .3);
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
}
