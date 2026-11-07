import { audioGraph, onSoundChange, setTick } from "@/components/sound";

/**
 * Game sound: a looping music track (public/music/chronos.mp3, skipped if missing) and
 * a synthesised engine hum whose pitch and volume follow the rover's speed. Both duck
 * while an event card is open. Everything follows the site's Sound toggle.
 */

const MUSIC_URL = "/music/chronos.mp3";
const MUSIC_GAIN = 0.32;
const DUCKED = 0.35;

export function startGameAudio() {
  setTick(false);
  let music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let hum: { oscA: OscillatorNode; oscB: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  let buffer: AudioBuffer | null | undefined;
  let duck = 1;
  let speed = 0;
  let alive = true;

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
    const { ctx, master } = g;
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
      filter.connect(gain).connect(master);
      oscA.start();
      oscB.start();
      hum = { oscA, oscB, filter, gain };
    }
    if (buffer === undefined) {
      try {
        const res = await fetch(MUSIC_URL);
        buffer = res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : null;
      } catch {
        buffer = null;
      }
    }
    if (buffer && !music && alive && audioGraph()) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(MUSIC_GAIN * duck, ctx.currentTime + 2);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain).connect(master);
      src.start();
      music = { src, gain };
    }
    apply();
  };

  const teardown = () => {
    try {
      music?.src.stop();
      hum?.oscA.stop();
      hum?.oscB.stop();
    } catch {}
    music?.gain.disconnect();
    hum?.gain.disconnect();
    music = null;
    hum = null;
  };

  const apply = () => {
    const g = audioGraph();
    if (!g) return;
    const t = g.ctx.currentTime;
    if (hum) {
      hum.oscA.frequency.setTargetAtTime(46 + speed * 70, t, 0.08);
      hum.oscB.frequency.setTargetAtTime(23 + speed * 35, t, 0.08);
      hum.filter.frequency.setTargetAtTime(380 + speed * 900, t, 0.1);
      hum.gain.gain.setTargetAtTime((0.025 + speed * 0.09) * (0.5 + duck * 0.5), t, 0.1);
    }
    if (music) music.gain.gain.setTargetAtTime(MUSIC_GAIN * duck, t, 0.25);
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
      duck = on ? DUCKED : 1;
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
