// Fun submit sounds — client-side WebAudio only, no audio files needed.
// Success = happy chime, rejection = low buzz. Respects prefers-reduced-motion
// for the visual side (handled in CSS); sound only plays on user action.

function tone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.12
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  return new AC();
}

/** Happy ascending chime for an accepted submission. */
export function playChime() {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, 523.25, now, 0.18); // C5
    tone(ctx, 659.25, now + 0.1, 0.18); // E5
    tone(ctx, 783.99, now + 0.2, 0.3); // G5
    tone(ctx, 1046.5, now + 0.3, 0.35); // C6
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // Sound is a nice-to-have; never break the submit flow.
  }
}

/** Low buzz for a rejected / not-accepted submission. */
export function playBuzz() {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, 160, now, 0.28, "sawtooth", 0.08);
    tone(ctx, 110, now + 0.16, 0.35, "sawtooth", 0.08);
    setTimeout(() => void ctx.close(), 700);
  } catch {
    // Sound is a nice-to-have; never break the submit flow.
  }
}
