import { audioGraph, onSoundChange, setTick } from "@/components/sound";

/**
 * Game sound, on the site's mixer channels:
 * - Music: the driving track (public/music/chronos.mp3) while you're in a car, and a calm
 *   generated tune ("Island stroll") while you're on foot. They crossfade when you get
 *   in or out.
 * - Engine: a synthesised hum whose pitch and volume follow the car's speed (silent on foot).
 * Both duck while an event card is open, and everything follows the Sound toggle.
 */

const MUSIC_URL = "/music/chronos.mp3";
const DRIVE_GAIN = 0.32;
const WALK_GAIN = 0.5;
const DUCKED = 0.35;
const FADE = 1.6;

type Graph = NonNullable<ReturnType<typeof audioGraph>>;

/**
 * "Island stroll": an original, gently generated tune. Soft pad chords, a round bass, a
 * kalimba-like melody wandering a major pentatonic scale through a light echo, and the
 * odd bird call. Notes are scheduled a moment ahead on the audio clock, and nothing is
 * scheduled while it's faded out.
 */
function createStroll(g: Graph) {
  const { ctx } = g;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(g.music);

  // a soft echo for the melody and birds
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  echo.connect(tone).connect(fb).connect(echo);
  tone.connect(wet).connect(out);

  const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
  /**
   * The tune changes with the time of day on the island:
   * dawn  - unhurried, lots of birdsong
   * day   - bright and bouncy (D major)
   * dusk  - slower, warmer chords (G major), birds settling, the first crickets
   * night - soft and sparse in B minor, crickets and the odd owl, no birds
   */
  type Mood = { bpm: number; chords: number[][]; scale: number[]; density: number; pad: number; birds: [number, number] | null; crickets: number; owl: boolean };
  const D_MAJOR = [
    [50, 57, 62, 66, 69],
    [47, 54, 59, 62, 66],
    [43, 50, 55, 59, 62],
    [45, 52, 57, 61, 64],
  ];
  const MOODS: Record<"dawn" | "day" | "dusk" | "night", Mood> = {
    dawn: { bpm: 66, chords: D_MAJOR, scale: [62, 64, 66, 69, 71, 74, 76, 78], density: 0.7, pad: 750, birds: [1.5, 4], crickets: 0, owl: false },
    day: { bpm: 76, chords: D_MAJOR, scale: [62, 64, 66, 69, 71, 74, 76, 78, 81], density: 1, pad: 900, birds: [5, 12], crickets: 0, owl: false },
    dusk: {
      bpm: 64,
      chords: [
        [43, 50, 55, 59, 62],
        [40, 47, 52, 55, 59],
        [36, 43, 48, 52, 55],
        [38, 45, 50, 54, 57],
      ],
      scale: [55, 57, 59, 62, 64, 67, 69, 71],
      density: 0.65,
      pad: 700,
      birds: [10, 20],
      crickets: 0.4,
      owl: false,
    },
    night: {
      bpm: 56,
      chords: [
        [47, 54, 59, 62, 66],
        [43, 50, 55, 59, 62],
        [40, 47, 52, 55, 59],
        [42, 49, 54, 57, 61],
      ],
      scale: [59, 62, 64, 66, 69, 71, 74],
      density: 0.42,
      pad: 560,
      birds: null,
      crickets: 1,
      owl: true,
    },
  };
  let mood: Mood = MOODS.day;
  let beat = 60 / mood.bpm;

  const pad = (notes: number[], at: number, dur: number) => {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = mood.pad;
    const v = ctx.createGain();
    v.gain.setValueAtTime(0, at);
    v.gain.linearRampToValueAtTime(0.05, at + 1.2);
    v.gain.setValueAtTime(0.05, at + dur - 1.2);
    v.gain.linearRampToValueAtTime(0, at + dur + 0.4);
    f.connect(v).connect(out);
    for (const n of notes.slice(1)) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz(n);
        o.detune.value = detune;
        o.connect(f);
        o.start(at);
        o.stop(at + dur + 0.5);
      }
    }
  };
  const bass = (n: number, at: number) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(n - 12);
    const v = ctx.createGain();
    v.gain.setValueAtTime(0, at);
    v.gain.linearRampToValueAtTime(0.16, at + 0.04);
    v.gain.exponentialRampToValueAtTime(0.001, at + beat * 1.8);
    o.connect(v).connect(out);
    o.start(at);
    o.stop(at + beat * 2);
  };
  const pluck = (n: number, at: number, vel: number) => {
    // kalimba-ish: a sine with a quick bright overtone that fades first
    const v = ctx.createGain();
    v.gain.setValueAtTime(0, at);
    v.gain.linearRampToValueAtTime(0.11 * vel, at + 0.008);
    v.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(n);
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz(n) * 4.02;
    const v2 = ctx.createGain();
    v2.gain.setValueAtTime(0.25, at);
    v2.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    o.connect(v);
    o2.connect(v2).connect(v);
    v.connect(out);
    v.connect(echo);
    o.start(at);
    o2.start(at);
    o.stop(at + 1.5);
    o2.stop(at + 0.3);
  };
  const bird = (at: number) => {
    // two or three quick rising whistles
    const calls = 2 + Math.floor(Math.random() * 2);
    const base = 2600 + Math.random() * 1200;
    for (let i = 0; i < calls; i++) {
      const t = at + i * (0.14 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.08);
      const v = ctx.createGain();
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(0.025, t + 0.015);
      v.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      o.connect(v);
      v.connect(out);
      v.connect(echo);
      o.start(t);
      o.stop(t + 0.13);
    }
  };

  const cricket = (at: number, amt: number) => {
    // a quick pulsed trill, high and quiet
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 4300 + Math.random() * 500;
    const am = ctx.createGain();
    am.gain.value = 0;
    const pulses = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = at + i * 0.045;
      am.gain.setValueAtTime(0.012 * amt, t);
      am.gain.setValueAtTime(0, t + 0.022);
    }
    o.connect(am).connect(out);
    o.start(at);
    o.stop(at + pulses * 0.045 + 0.05);
  };
  const owl = (at: number) => {
    // a soft low hoo, then hoo-hoo
    [0, 0.55, 0.8].forEach((d, i) => {
      const t = at + d;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(i ? 360 : 380, t);
      o.frequency.linearRampToValueAtTime(i ? 330 : 350, t + 0.32);
      const v = ctx.createGain();
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(0.05, t + 0.06);
      v.gain.exponentialRampToValueAtTime(0.001, t + (i ? 0.25 : 0.4));
      o.connect(v);
      v.connect(out);
      v.connect(echo);
      o.start(t);
      o.stop(t + 0.45);
    });
  };

  let next = 0; // audio time of the next eighth note
  let nextCricket = 0;
  let nextOwl = 0;
  let step = 0; // eighth notes since start
  let note = 3; // where the melody is on the scale
  let nextBird = 0;
  let timer = 0;
  let level = 0; // where the fade is heading (0 = silent)
  let idleSince = 0;

  const schedule = () => {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (next < now) next = now + 0.05;
    while (next < now + 0.35) {
      const bar = Math.floor(step / 8);
      const chord = mood.chords[Math.floor(bar / 2) % mood.chords.length];
      const SCALE = mood.scale;
      const inBar = step % 8;
      if (inBar === 0 && bar % 2 === 0) pad(chord, next, beat * 8);
      if (inBar === 0 || inBar === 4) bass(chord[0], next);
      // melody: wander up and down the scale, resting now and then, landing on chord tones
      const play = (inBar === 0 ? 0.9 : inBar % 2 === 0 ? 0.6 : 0.32) * mood.density;
      if (Math.random() < play) {
        note = Math.max(0, Math.min(SCALE.length - 1, note + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        let n = SCALE[note];
        if (inBar === 0 && !chord.some((c) => (c - n) % 12 === 0)) n = chord[2 + Math.floor(Math.random() * 3)] + 12;
        pluck(n, next + (Math.random() - 0.5) * 0.012, inBar % 2 ? 0.7 : 1);
      }
      next += beat / 2;
      step++;
    }
    if (mood.birds && now > nextBird) {
      if (nextBird) bird(now + 0.1);
      nextBird = now + mood.birds[0] + Math.random() * (mood.birds[1] - mood.birds[0]);
    }
    if (mood.crickets > 0 && now > nextCricket) {
      cricket(now + 0.05, mood.crickets);
      nextCricket = now + 0.35 + Math.random() * (mood.crickets > 0.5 ? 0.9 : 2.4);
    }
    if (mood.owl && now > nextOwl) {
      if (nextOwl) owl(now + 0.1);
      nextOwl = now + 14 + Math.random() * 18;
    }
  };

  return {
    /** Pick the mood for an hour of the day (0-24); takes effect from the next notes. */
    setHour(h: number) {
      const pick = h >= 5 && h < 8 ? MOODS.dawn : h >= 8 && h < 17 ? MOODS.day : h >= 17 && h < 20 ? MOODS.dusk : MOODS.night;
      if (pick === mood) return;
      mood = pick;
      beat = 60 / mood.bpm;
      note = Math.min(note, mood.scale.length - 1);
    },
    /** Fade in (on foot) or out (in a car); the scheduler only runs while audible. */
    fade(to: number) {
      level = to;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(to, t + FADE);
      if (to > 0 && !timer) {
        timer = window.setInterval(schedule, 120);
        schedule();
      }
      idleSince = to > 0 ? 0 : performance.now();
    },
    /** Stop scheduling once it has faded out. */
    tick() {
      if (level === 0 && timer && idleSince && performance.now() - idleSince > FADE * 1000 + 300) {
        clearInterval(timer);
        timer = 0;
      }
    },
    stop() {
      clearInterval(timer);
      timer = 0;
      try {
        out.disconnect();
      } catch {}
    },
  };
}

export function startGameAudio() {
  setTick(false);
  let drive: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let stroll: ReturnType<typeof createStroll> | null = null;
  let hum: { oscA: OscillatorNode; oscB: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  let buffer: AudioBuffer | null | undefined;
  let duck = 1;
  let speed = 0;
  let walking = false;
  let alive = true;
  let hour = 12;

  let tries = 0;
  const build = async (): Promise<void> => {
    if (!alive) return;
    const g = audioGraph();
    if (!g) {
      // Sound was just switched on: the audio context appears a moment later.
      if (soundOn && tries++ < 20) window.setTimeout(() => void build(), 250);
      return;
    }
    tries = 0;
    const { ctx } = g;
    if (!hum) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 420;
      const oscA = ctx.createOscillator();
      oscA.type = "sawtooth";
      oscA.frequency.value = 48;
      const oscB = ctx.createOscillator();
      oscB.type = "square";
      oscB.frequency.value = 24;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      oscA.connect(filter);
      oscB.connect(subGain).connect(filter);
      filter.connect(gain).connect(g.engine);
      oscA.start();
      oscB.start();
      hum = { oscA, oscB, filter, gain };
    }
    if (!stroll) {
      stroll = createStroll(g);
      stroll.setHour(hour);
    }
    if (buffer === undefined) {
      try {
        const res = await fetch(MUSIC_URL);
        buffer = res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : null;
      } catch {
        buffer = null;
      }
    }
    if (buffer && !drive && alive && audioGraph()) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain).connect(g.music);
      src.start();
      drive = { src, gain };
      gain.gain.linearRampToValueAtTime(walking ? 0 : DRIVE_GAIN * duck, ctx.currentTime + 2);
    }
    stroll.fade(walking ? WALK_GAIN * duck : 0);
    apply();
  };

  const teardown = () => {
    try {
      drive?.src.stop();
      hum?.oscA.stop();
      hum?.oscB.stop();
    } catch {}
    drive?.gain.disconnect();
    hum?.gain.disconnect();
    stroll?.stop();
    drive = null;
    hum = null;
    stroll = null;
  };

  const apply = () => {
    const g = audioGraph();
    if (!g) return;
    const t = g.ctx.currentTime;
    if (hum) {
      hum.oscA.frequency.setTargetAtTime(46 + speed * 70, t, 0.08);
      hum.oscB.frequency.setTargetAtTime(23 + speed * 35, t, 0.08);
      hum.filter.frequency.setTargetAtTime(380 + speed * 900, t, 0.1);
      hum.gain.gain.setTargetAtTime(walking ? 0 : (0.025 + speed * 0.09) * (0.5 + duck * 0.5), t, walking ? 0.3 : 0.1);
    }
    stroll?.tick();
  };
  const crossfade = () => {
    const g = audioGraph();
    if (!g) return;
    const t = g.ctx.currentTime;
    if (drive) {
      drive.gain.gain.cancelScheduledValues(t);
      drive.gain.gain.setValueAtTime(drive.gain.gain.value, t);
      drive.gain.gain.linearRampToValueAtTime(walking ? 0 : DRIVE_GAIN * duck, t + FADE);
    }
    stroll?.fade(walking ? WALK_GAIN * duck : 0);
  };

  let soundOn = !!audioGraph();
  const off = onSoundChange((on) => {
    soundOn = on;
    if (on) void build();
    else teardown();
  });
  void build();

  return {
    /** Rover speed, 0 (still) to 1 (boost). */
    setSpeed(v: number) {
      speed = Math.max(0, Math.min(1, v));
      apply();
    },
    setDuck(on: boolean) {
      const was = duck;
      duck = on ? DUCKED : 1;
      if (was !== duck) crossfade();
      apply();
    },
    /** The island's hour, so the on-foot tune matches dawn, day, dusk or night. */
    setHour(h: number) {
      hour = h;
      stroll?.setHour(h);
    },
    /** In a car: the driving track and engine. On foot: the calm tune. */
    setMode(mode: "drive" | "walk") {
      const w = mode === "walk";
      if (w === walking) return;
      walking = w;
      crossfade();
      apply();
    },
    stop() {
      alive = false;
      off();
      teardown();
      setTick(true);
    },
  };
}
