// 呼吸の状態機械。押している間が「吸う」、離している間が「吐く」。
// 目安の秒数は案内に使うだけで、失敗という判定はない。

export const TEMPOS = {
  easy:   { inhale: 3, exhale: 5 },
  normal: { inhale: 4, exhale: 6 },
  slow:   { inhale: 5, exhale: 7 },
};

export const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export class Breath {
  constructor({ inhale, exhale, auto = false }, on = {}) {
    this.I = inhale;
    this.E = exhale;
    this.auto = auto;
    this.on = on;
    this.state = 'idle'; // idle | in | out | done
    this.t = 0;
    this.level = 0;      // 肺の満ち具合 0..1（輪の大きさと音に使う）
    this.from = 0;       // 段階が始まったときの level
    this.flow = 0;       // level の変化の速さ（風の音に使う）
    this.exhales = [];   // 吐いた秒数
    this.stopAfter = false;
    if (auto) this.press();
  }

  get count() { return this.exhales.length; }

  avgExhale() {
    const xs = this.exhales.filter(s => s >= 1);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }

  press() {
    if (this.state === 'in' || this.state === 'done') return;
    if (this.state === 'out') this.finishExhale();
    this.state = 'in';
    this.t = 0;
    this.from = this.level;
    this.on.inhale?.();
  }

  release() {
    if (this.state !== 'in') return;
    const held = this.t;
    this.state = 'out';
    this.t = 0;
    this.from = this.level;
    this.on.exhale?.({ held, fullness: this.level });
  }

  finishExhale() {
    const sec = Math.min(this.t, this.E * 1.6);
    this.exhales.push(sec);
    const q = Math.max(.2, Math.min(1, sec / this.E));
    this.on.exhaleEnd?.({ sec, q });
  }

  update(dt) {
    if (this.state === 'done') { this.flow = 0; return; }
    const prevT = this.t;
    const prevLevel = this.level;
    this.t += dt;
    const { I, E } = this;

    if (this.state === 'in') {
      this.level = this.from + (1 - this.from) * ease(this.t / I);
      if (prevT < I && this.t >= I) this.on.cue?.('out');
      if (this.auto && this.t >= I) this.release();
    } else if (this.state === 'out') {
      this.level = this.from * (1 - ease(this.t / E));
      if (this.stopAfter && this.t >= E) { this.finishExhale(); return this.end(); }
      if (prevT < E && this.t >= E) {
        this.on.cue?.('in');
        if (this.auto) this.press();
      }
      if (this.state === 'out' && this.t > E * 1.6) {
        this.finishExhale();
        this.state = 'idle';
        this.t = 0;
      }
    } else if (this.state === 'idle') {
      this.level = Math.max(0, this.level - dt * .3);
      if (this.stopAfter) return this.end();
    }
    this.flow = dt > 0 ? (this.level - prevLevel) / dt : 0;
  }

  end() {
    this.state = 'done';
    this.flow = 0;
    this.on.done?.();
  }
}
