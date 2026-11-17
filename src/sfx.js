// 여왕을 지켜라 — 효과음. 소리 파일 없이 브라우저에서 바로 만들어 낸다.
(function () {
  const Sfx = {
    ctx: null,
    on: true,
    last: {},

    // 브라우저는 사용자가 화면을 누른 뒤에만 소리를 허용한다. 첫 터치에서 부른다.
    unlock() {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {
        this.ctx = null;
      }
    },

    tone(freq, dur, opt) {
      const o = opt || {};
      const c = this.ctx;
      const t = c.currentTime + (o.delay || 0);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      gain.gain.setValueAtTime(o.vol || 0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    noise(dur, vol) {
      const c = this.ctx;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = vol || 0.08;
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.start();
    },

    notes(list, step, opt) {
      list.forEach((f, i) => this.tone(f, step * 1.4, Object.assign({}, opt, { delay: i * step })));
    },

    // name: 소리 이름, gap: 같은 소리를 다시 낼 수 있는 최소 간격(초)
    play(name, gap) {
      if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      if (now - (this.last[name] || -9) < (gap || 0.05)) return;
      this.last[name] = now;
      try {
        this.sounds[name].call(this);
      } catch (e) {
        /* 소리가 안 나도 게임은 계속된다 */
      }
    },

    sounds: {
      tap() { this.tone(620, 0.04, { vol: 0.04 }); },
      move() { this.tone(440, 0.07, { to: 700, vol: 0.05 }); },
      error() { this.tone(170, 0.12, { vol: 0.06 }); },
      deposit() { this.tone(980, 0.04, { type: 'sine', vol: 0.03 }); },
      loot() { this.notes([700, 940, 1250], 0.05, { type: 'triangle', vol: 0.06 }); },
      order() { this.tone(330, 0.06, { to: 440, vol: 0.05 }); },
      built() { this.notes([520, 780], 0.07, { vol: 0.05 }); },
      born() { this.tone(700, 0.09, { to: 1100, type: 'triangle', vol: 0.06 }); },
      attack() { this.tone(200, 0.25, { to: 480, type: 'sawtooth', vol: 0.06 }); },
      smash() { this.noise(0.12, 0.07); this.tone(320, 0.1, { to: 160, vol: 0.04 }); }, // 내가 적 칸을 부숨
      cellLost() { this.noise(0.18, 0.1); this.tone(150, 0.2, { to: 70, vol: 0.07 }); }, // 내 칸이 부서짐
      died() { this.tone(220, 0.12, { to: 110, type: 'triangle', vol: 0.05 }); },
      alarm() { this.notes([880, 660, 880, 660], 0.11, { vol: 0.06 }); },
      queenDied() { this.notes([440, 370, 294, 220], 0.16, { type: 'sawtooth', vol: 0.07 }); },
      queenKill() { this.notes([392, 523, 659], 0.09, { vol: 0.06 }); },
      newQueen() { this.notes([523, 659, 784, 1047], 0.1, { type: 'triangle', vol: 0.07 }); },
      wilt() { this.notes([660, 554, 466], 0.14, { type: 'sine', vol: 0.06 }); },
      win() { this.notes([523, 659, 784, 1047, 1319], 0.12, { vol: 0.07 }); },
      lose() { this.notes([392, 330, 262, 196], 0.2, { type: 'triangle', vol: 0.08 }); },
    },
  };
  window.Sfx = Sfx;
})();
