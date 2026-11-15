import { initStrudel, evaluate, samples, hush, soundMap, loadBuffer, getAudioContext } from '@strudel/web';

let repl;

export async function initMuxAudio() {
  // initStrudel sets up the audio context and registers globals like s(), n(), sound(), etc.
  // It resolves to the repl, which we keep so we can reach the scheduler.
  repl = await initStrudel({
    prebake: () => samples('github:tidalcycles/Dirt-samples'),
  });
}

/**
 * Download + decode every sample used by the given pattern strings, so the first
 * time a room is entered the audio is already in memory. Without this, the sample is
 * fetched when its first event fires; that takes longer than the scheduler's lookahead,
 * so Strudel logs "loading sound ... took too long" and drops the event.
 */
export function preloadAmbient(patternStrings) {
  const ac = getAudioContext();
  const sounds = soundMap.get();
  const urls = new Set();

  for (const code of patternStrings) {
    if (!code) continue;
    // grab the quoted content of s("...") / sound("...") and split into names
    for (const [, body] of code.matchAll(/\b(?:s|sound)\(\s*["'`]([^"'`]*)["'`]/g)) {
      for (const token of body.split(/[^\w:]+/)) {
        const name = token.split(':')[0].toLowerCase();
        const bank = sounds[name]?.data?.samples;
        if (!bank) continue; // synth (sine, sawtooth, ...) or unknown: nothing to load
        const list = Array.isArray(bank)
          ? bank
          : Object.entries(bank).filter(([k]) => !k.startsWith('_')).flatMap(([, v]) => v);
        list.forEach((url) => urls.add(url));
      }
    }
  }

  return Promise.allSettled([...urls].map((url) => loadBuffer(url, ac)));
}

/**
 * Switch the ambient pattern.
 *
 * Strudel only triggers events whose *onset* lies in the upcoming time window. A new
 * pattern is queried from the current global cycle, so e.g. `s("birds")` (one event
 * per cycle) or anything with `.slow(n)` would stay silent until the next cycle
 * boundary - up to 2s per cycle at the default tempo (and `slow(6)` = up to 12s).
 * Shifting the pattern with `.late(position)` makes its cycle 0 start right now.
 */
export async function playSound(patternString) {
  try {
    const pattern = await evaluate(patternString, false);
    if (!pattern) return; // evaluation error was already logged by Strudel
    const now = repl.scheduler.lastEnd ?? 0; // start of the next query window
    await repl.setPattern(pattern.late(now), true);
  } catch (err) {
    console.error("Strudel evaluation error:", err);
  }
}

export function stopAudio() {
  hush(); // also stops the scheduler
}
