export type WorkspaceSoundEffect =
  | "digit-correct"
  | "digit-error"
  | "step-lock-in"
  | "problem-complete"
  | "ui-click";

interface ToneSpec {
  /** Oscillator frequency in Hz at note start. */
  frequency: number;
  /** Optional frequency to glide toward by note end. */
  glideToFrequency?: number;
  /** Seconds after the effect starts before this note begins. */
  startOffsetSeconds: number;
  durationSeconds: number;
  oscillatorType: OscillatorType;
  peakGain: number;
}

const SOUND_EFFECT_TONES: Record<WorkspaceSoundEffect, readonly ToneSpec[]> = {
  "digit-correct": [
    {
      frequency: 660,
      glideToFrequency: 880,
      startOffsetSeconds: 0,
      durationSeconds: 0.07,
      oscillatorType: "sine",
      peakGain: 0.085,
    },
  ],
  "digit-error": [
    {
      frequency: 180,
      glideToFrequency: 120,
      startOffsetSeconds: 0,
      durationSeconds: 0.2,
      oscillatorType: "square",
      peakGain: 0.05,
    },
    {
      frequency: 92,
      startOffsetSeconds: 0,
      durationSeconds: 0.2,
      oscillatorType: "sawtooth",
      peakGain: 0.035,
    },
  ],
  "step-lock-in": [
    {
      frequency: 523.25,
      startOffsetSeconds: 0,
      durationSeconds: 0.11,
      oscillatorType: "triangle",
      peakGain: 0.09,
    },
    {
      frequency: 783.99,
      startOffsetSeconds: 0.09,
      durationSeconds: 0.16,
      oscillatorType: "triangle",
      peakGain: 0.09,
    },
  ],
  "problem-complete": [
    {
      frequency: 523.25,
      startOffsetSeconds: 0,
      durationSeconds: 0.14,
      oscillatorType: "triangle",
      peakGain: 0.095,
    },
    {
      frequency: 659.25,
      startOffsetSeconds: 0.11,
      durationSeconds: 0.14,
      oscillatorType: "triangle",
      peakGain: 0.095,
    },
    {
      frequency: 783.99,
      startOffsetSeconds: 0.22,
      durationSeconds: 0.14,
      oscillatorType: "triangle",
      peakGain: 0.095,
    },
    {
      frequency: 1046.5,
      startOffsetSeconds: 0.33,
      durationSeconds: 0.34,
      oscillatorType: "triangle",
      peakGain: 0.1,
    },
  ],
  "ui-click": [
    {
      frequency: 950,
      glideToFrequency: 700,
      startOffsetSeconds: 0,
      durationSeconds: 0.045,
      oscillatorType: "sine",
      peakGain: 0.055,
    },
  ],
};

const GAIN_ATTACK_SECONDS = 0.008;

interface BrowserAudioRuntime {
  context: AudioContext;
  masterGain: GainNode;
}

let cachedAudioRuntime: BrowserAudioRuntime | null = null;
let audioRuntimeUnavailable = false;

function resolveAudioRuntime(): BrowserAudioRuntime | null {
  if (audioRuntimeUnavailable) {
    return null;
  }

  if (cachedAudioRuntime) {
    return cachedAudioRuntime;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    audioRuntimeUnavailable = true;
    return null;
  }

  try {
    const context = new AudioContextConstructor();
    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);
    cachedAudioRuntime = { context, masterGain };
    return cachedAudioRuntime;
  } catch {
    audioRuntimeUnavailable = true;
    return null;
  }
}

function scheduleTone(runtime: BrowserAudioRuntime, tone: ToneSpec): void {
  const { context, masterGain } = runtime;
  const startTime = context.currentTime + tone.startOffsetSeconds;
  const endTime = startTime + tone.durationSeconds;

  const oscillator = context.createOscillator();
  oscillator.type = tone.oscillatorType;
  oscillator.frequency.setValueAtTime(tone.frequency, startTime);
  if (typeof tone.glideToFrequency === "number") {
    oscillator.frequency.exponentialRampToValueAtTime(tone.glideToFrequency, endTime);
  }

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(tone.peakGain, startTime + GAIN_ATTACK_SECONDS);
  envelope.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(envelope);
  envelope.connect(masterGain);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
  oscillator.addEventListener("ended", () => {
    oscillator.disconnect();
    envelope.disconnect();
  });
}

/**
 * Plays a synthesized workspace sound effect via the Web Audio API. Safe to
 * call anywhere: it is a no-op during SSR, in test environments, or when the
 * browser blocks audio. Audio contexts suspended by autoplay policy resume on
 * the first user-gesture-driven call.
 */
export function playWorkspaceSoundEffect(effect: WorkspaceSoundEffect): void {
  const runtime = resolveAudioRuntime();
  if (!runtime) {
    return;
  }

  try {
    if (runtime.context.state === "suspended") {
      void runtime.context.resume();
    }

    for (const tone of SOUND_EFFECT_TONES[effect]) {
      scheduleTone(runtime, tone);
    }
  } catch {
    // Audio output is a progressive enhancement; never let it break input handling.
  }
}
