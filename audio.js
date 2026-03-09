class AudioDirector {
  constructor() {
    this.supported = Boolean(window.AudioContext || window.webkitAudioContext);
    this.ctx = null;
    this.masterBus = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.muted = false;
    this.mode = "standby";
    this.step = 0;
    this.nextStepTime = 0;
    this.lookahead = 0.16;
    this.schedulerId = null;
    this.listeners = new Map();
    this.tracks = {
      standby: {
        tempo: 92,
        bass: [36, null, null, null, 39, null, 36, null, 43, null, 39, null, 34, null, null, null],
        lead: [null, null, 60, null, null, 67, null, null, null, null, 62, null, null, 69, null, null],
        kick: [0, 8],
        snare: [4, 12],
        hat: [2, 6, 10, 14],
        chords: {
          0: [48, 55, 60],
          8: [46, 53, 58],
        },
      },
      patrol: {
        tempo: 128,
        bass: [43, null, 43, null, 46, null, 43, 43, 41, null, 43, null, 46, 43, 38, null],
        lead: [67, null, 69, 71, 74, null, 71, null, 67, 69, 71, null, 74, 76, 74, 71],
        kick: [0, 3, 8, 10, 12],
        snare: [4, 12],
        hat: [2, 6, 10, 14],
        chords: {
          0: [55, 59, 62],
          4: [57, 60, 64],
          8: [53, 57, 60],
          12: [50, 55, 59],
        },
      },
      boss: {
        tempo: 148,
        bass: [38, 38, null, 41, 38, 38, null, 34, 36, 36, null, 38, 31, 31, 34, null],
        lead: [null, 62, null, 60, null, 58, null, 57, null, 60, null, 62, null, 65, null, 62],
        kick: [0, 2, 4, 6, 8, 10, 12, 14],
        snare: [4, 12],
        hat: [1, 3, 5, 7, 9, 11, 13, 15],
        chords: {
          0: [38, 45, 50],
          8: [36, 43, 48],
        },
      },
    };
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(handler);
  }

  off(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      return;
    }
    this.listeners.get(eventName).delete(handler);
  }

  emit(eventName, detail) {
    if (!this.listeners.has(eventName)) {
      return;
    }

    for (const handler of this.listeners.get(eventName)) {
      try {
        handler(detail);
      } catch (error) {
        console.error("Audio hook error", error);
      }
    }
  }

  getState() {
    return {
      supported: this.supported,
      unlocked: this.unlocked,
      muted: this.muted,
      mode: this.mode,
      contextState: this.ctx ? this.ctx.state : "inactive",
    };
  }

  ensureContext() {
    if (this.ctx || !this.supported) {
      return this.ctx;
    }

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtor();

    this.masterBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    const compressor = this.ctx.createDynamicsCompressor();

    this.masterBus.gain.value = 0.85;
    this.musicBus.gain.value = 0.34;
    this.sfxBus.gain.value = 0.7;
    compressor.threshold.value = -16;
    compressor.knee.value = 20;
    compressor.ratio.value = 2.2;

    this.musicBus.connect(compressor);
    this.sfxBus.connect(compressor);
    compressor.connect(this.masterBus);
    this.masterBus.connect(this.ctx.destination);

    this.noiseBuffer = this.createNoiseBuffer();
    this.updateMuteState(this.ctx.currentTime);
    this.emit("support", this.getState());
    return this.ctx;
  }

  createNoiseBuffer() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  async unlock() {
    const ctx = this.ensureContext();
    if (!ctx) {
      return false;
    }

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (!this.unlocked) {
      this.unlocked = true;
      this.resetSequencer();
      this.startScheduler();
      this.playSfx("start");
      this.emit("unlock", this.getState());
    }

    return true;
  }

  async suspend() {
    if (!this.ctx || this.ctx.state !== "running") {
      return;
    }
    await this.ctx.suspend();
    this.emit("support", this.getState());
  }

  async resume() {
    if (!this.ctx || this.ctx.state !== "suspended") {
      return;
    }
    await this.ctx.resume();
    this.emit("support", this.getState());
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.ctx) {
      this.updateMuteState(this.ctx.currentTime);
    }
    this.emit("mute", this.getState());
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  updateMuteState(time) {
    if (!this.masterBus) {
      return;
    }

    this.masterBus.gain.cancelScheduledValues(time);
    this.masterBus.gain.setTargetAtTime(this.muted ? 0.0001 : 0.85, time, 0.02);
  }

  setMusicMode(mode) {
    if (!this.tracks[mode]) {
      return;
    }

    if (this.mode === mode) {
      return;
    }

    this.mode = mode;
    this.resetSequencer();
    this.emit("music-mode", this.getState());
  }

  resetSequencer() {
    if (!this.ctx) {
      this.step = 0;
      return;
    }

    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
  }

  startScheduler() {
    if (this.schedulerId || !this.ctx) {
      return;
    }

    this.schedulerId = window.setInterval(() => this.schedule(), 40);
  }

  schedule() {
    if (!this.ctx || !this.unlocked || this.ctx.state !== "running") {
      return;
    }

    const track = this.tracks[this.mode];
    if (!track) {
      return;
    }

    const stepDuration = 60 / track.tempo / 4;

    while (this.nextStepTime < this.ctx.currentTime + this.lookahead) {
      this.scheduleTrackStep(track, this.step, this.nextStepTime);
      this.emit("music-step", {
        mode: this.mode,
        step: this.step,
        time: this.nextStepTime,
      });
      this.step = (this.step + 1) % 16;
      this.nextStepTime += stepDuration;
    }
  }

  scheduleTrackStep(track, step, time) {
    if (track.kick.includes(step)) {
      this.playKick(time, track === this.tracks.boss ? 0.16 : 0.13);
    }

    if (track.snare.includes(step)) {
      this.playSnare(time, track === this.tracks.boss ? 0.095 : 0.075);
    }

    if (track.hat.includes(step)) {
      this.playHat(time, track === this.tracks.standby ? 0.017 : 0.022);
    }

    const bassNote = track.bass[step];
    if (typeof bassNote === "number") {
      this.playBass(time, bassNote, track === this.tracks.boss ? 0.07 : 0.06);
    }

    const leadNote = track.lead[step];
    if (typeof leadNote === "number") {
      this.playLead(time, leadNote, track === this.tracks.boss ? 0.05 : 0.042, track === this.tracks.standby ? "triangle" : "square");
    }

    if (track.chords[step]) {
      this.playPad(time, track.chords[step], track === this.tracks.boss ? 0.028 : 0.022);
    }
  }

  playSfx(name, detail = {}) {
    this.emit("sfx", { name, detail, state: this.getState() });

    if (!this.ctx || !this.unlocked || this.muted || this.ctx.state !== "running") {
      return;
    }

    const time = this.ctx.currentTime;

    switch (name) {
      case "start":
        this.playTone({ time, frequency: 520, sweepTo: 740, duration: 0.12, gain: 0.05, type: "triangle", bus: this.sfxBus });
        this.playTone({ time: time + 0.07, frequency: 740, sweepTo: 980, duration: 0.16, gain: 0.045, type: "triangle", bus: this.sfxBus });
        break;
      case "player-shot":
        this.playTone({ time, frequency: 1260, sweepTo: 460, duration: 0.08, gain: 0.026, type: "square", filterFreq: 2600, bus: this.sfxBus });
        break;
      case "enemy-shot":
        this.playTone({ time, frequency: 440, sweepTo: 180, duration: 0.12, gain: 0.035, type: "sawtooth", filterFreq: 1600, bus: this.sfxBus });
        break;
      case "ring":
        this.playTone({ time, frequency: 880, sweepTo: 1040, duration: 0.11, gain: 0.04, type: "triangle", bus: this.sfxBus });
        this.playTone({ time: time + 0.05, frequency: 1180, sweepTo: 1460, duration: 0.16, gain: 0.036, type: "triangle", bus: this.sfxBus });
        break;
      case "enemy-hit":
        this.playTone({ time, frequency: 260, sweepTo: 220, duration: 0.05, gain: 0.02, type: "triangle", filterFreq: 700, bus: this.sfxBus });
        break;
      case "enemy-down":
        this.playNoise({ time, duration: 0.16, gain: 0.06, filterType: "bandpass", filterFreq: 1100, bus: this.sfxBus });
        this.playTone({ time, frequency: 220, sweepTo: 88, duration: 0.21, gain: 0.05, type: "square", filterFreq: 900, bus: this.sfxBus });
        break;
      case "boss-incoming":
        for (let index = 0; index < 4; index += 1) {
          const alarmTime = time + index * 0.18;
          this.playTone({ time: alarmTime, frequency: 180, sweepTo: 220, duration: 0.12, gain: 0.055, type: "square", filterFreq: 900, bus: this.sfxBus });
          this.playTone({ time: alarmTime + 0.05, frequency: 280, sweepTo: 220, duration: 0.16, gain: 0.05, type: "sawtooth", filterFreq: 1400, bus: this.sfxBus });
        }
        break;
      case "boss-hit":
        this.playTone({ time, frequency: 190, sweepTo: 120, duration: 0.12, gain: 0.05, type: "square", filterFreq: 800, bus: this.sfxBus });
        this.playNoise({ time, duration: 0.06, gain: 0.024, filterType: "highpass", filterFreq: 1800, bus: this.sfxBus });
        break;
      case "boss-down":
        this.playNoise({ time, duration: 0.6, gain: 0.09, filterType: "bandpass", filterFreq: 600, bus: this.sfxBus });
        this.playTone({ time, frequency: 180, sweepTo: 48, duration: 0.65, gain: 0.08, type: "sawtooth", filterFreq: 900, bus: this.sfxBus });
        this.playTone({ time: time + 0.1, frequency: 240, sweepTo: 62, duration: 0.55, gain: 0.06, type: "square", filterFreq: 1100, bus: this.sfxBus });
        break;
      case "gate-warning":
        this.playTone({ time, frequency: 210, sweepTo: 210, duration: 0.09, gain: 0.04, type: "square", filterFreq: 1200, bus: this.sfxBus });
        this.playTone({ time: time + 0.12, frequency: 210, sweepTo: 210, duration: 0.09, gain: 0.04, type: "square", filterFreq: 1200, bus: this.sfxBus });
        this.playTone({ time: time + 0.24, frequency: 210, sweepTo: 210, duration: 0.09, gain: 0.04, type: "square", filterFreq: 1200, bus: this.sfxBus });
        break;
      case "gate-crush":
        this.playNoise({ time, duration: 0.22, gain: 0.05, filterType: "bandpass", filterFreq: 840, bus: this.sfxBus });
        this.playTone({ time, frequency: 170, sweepTo: 70, duration: 0.26, gain: 0.055, type: "sawtooth", filterFreq: 950, bus: this.sfxBus });
        break;
      case "penalty":
        this.playTone({ time, frequency: 260, sweepTo: 96, duration: 0.24, gain: 0.04, type: "triangle", filterFreq: 720, bus: this.sfxBus });
        this.playNoise({ time, duration: 0.09, gain: 0.022, filterType: "bandpass", filterFreq: 480, bus: this.sfxBus });
        break;
      default:
        break;
    }
  }

  playKick(time, gain) {
    this.playTone({
      time,
      frequency: 150,
      sweepTo: 44,
      duration: 0.22,
      gain,
      type: "sine",
      filterFreq: 900,
      bus: this.musicBus,
    });
  }

  playSnare(time, gain) {
    this.playNoise({
      time,
      duration: 0.13,
      gain,
      filterType: "highpass",
      filterFreq: 1500,
      bus: this.musicBus,
    });
    this.playTone({
      time,
      frequency: 210,
      sweepTo: 120,
      duration: 0.12,
      gain: gain * 0.55,
      type: "triangle",
      filterFreq: 1200,
      bus: this.musicBus,
    });
  }

  playHat(time, gain) {
    this.playNoise({
      time,
      duration: 0.055,
      gain,
      filterType: "highpass",
      filterFreq: 5800,
      bus: this.musicBus,
    });
  }

  playBass(time, midiNote, gain) {
    this.playTone({
      time,
      frequency: this.midiToFreq(midiNote),
      sweepTo: this.midiToFreq(midiNote) * 0.96,
      duration: 0.28,
      gain,
      type: "square",
      filterFreq: 520,
      bus: this.musicBus,
    });
  }

  playLead(time, midiNote, gain, type) {
    this.playTone({
      time,
      frequency: this.midiToFreq(midiNote),
      sweepTo: this.midiToFreq(midiNote) * 1.012,
      duration: 0.18,
      gain,
      type,
      filterFreq: 2400,
      bus: this.musicBus,
    });
  }

  playPad(time, chord, gain) {
    for (const note of chord) {
      this.playTone({
        time,
        frequency: this.midiToFreq(note),
        sweepTo: this.midiToFreq(note) * 1.005,
        duration: 0.72,
        gain,
        type: "sine",
        filterFreq: 1500,
        attack: 0.05,
        bus: this.musicBus,
      });
    }
  }

  playTone(options) {
    const {
      time,
      frequency,
      sweepTo,
      duration,
      gain,
      type,
      filterFreq = 1800,
      filterType = "lowpass",
      attack = 0.004,
      bus,
    } = options;

    const oscillator = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(30, frequency), time);
    if (typeof sweepTo === "number") {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), time + duration);
    }

    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, time);

    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(bus);

    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
  }

  playNoise(options) {
    const {
      time,
      duration,
      gain,
      filterType = "bandpass",
      filterFreq = 1400,
      attack = 0.002,
      bus,
    } = options;

    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();

    source.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, time);

    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    source.connect(filter);
    filter.connect(amp);
    amp.connect(bus);

    source.start(time);
    source.stop(time + duration + 0.03);
  }

  midiToFreq(note) {
    return 440 * 2 ** ((note - 69) / 12);
  }
}

const audioDirector = new AudioDirector();
window.starfoxAudioHooks = {
  on: audioDirector.on.bind(audioDirector),
  off: audioDirector.off.bind(audioDirector),
  getState: audioDirector.getState.bind(audioDirector),
  unlock: audioDirector.unlock.bind(audioDirector),
  suspend: audioDirector.suspend.bind(audioDirector),
  resume: audioDirector.resume.bind(audioDirector),
  setMuted: audioDirector.setMuted.bind(audioDirector),
  toggleMute: audioDirector.toggleMute.bind(audioDirector),
  setMusicMode: audioDirector.setMusicMode.bind(audioDirector),
  playSfx: audioDirector.playSfx.bind(audioDirector),
};
