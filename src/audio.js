import standardPattern from "./beeps/standard.json" with { type: "json" };

const SCHEDULE_LEAD_SECONDS = 0.12;
const MAX_OUTPUT_TIMESTAMP_AGE_MS = 100;
const AUDIO_READY_TIMEOUT_MS = 1000;
const CLOCK_SAMPLE_INTERVAL_MS = 20;
const CLOCK_STABILITY_MS = 5;
const ECHO_REFLECTIONS = [
  { position: 0.25, level: 0.5 },
  { position: 0.5, level: 0.3 },
  { position: 0.75, level: 0.17 },
  { position: 1, level: 0.08 },
];

const scheduledOscillators = [];
const echoTapsByDuration = new Map();
let audioContext;
let masterGain;
let echoFilter;
let echoGain;
let countdownClock;
let startupDurationMs = null;
let startupError = null;

function getEvents(countdownSeconds, pattern) {
  if (
    !["square", "sine", "sawtooth", "triangle"].includes(
      pattern.type ?? "square",
    ) ||
    !Array.isArray(pattern.events) ||
    pattern.events.some(
      (event) =>
        !event ||
        !Number.isFinite(event.seconds) ||
        event.seconds < 0 ||
        !Number.isFinite(event.frequency) ||
        event.frequency <= 0 ||
        !Number.isFinite(event.duration) ||
        event.duration <= 0,
    )
  ) {
    throw new Error(`Invalid audio pattern: ${pattern.name ?? "Unnamed"}.`);
  }
  return pattern.events
    .filter((event) => event.seconds <= countdownSeconds)
    .sort((left, right) => right.seconds - left.seconds);
}

function ensureEchoTaps(duration) {
  if (!audioContext || echoTapsByDuration.has(duration)) return;
  const echoWindow = duration * 0.9;
  const taps = ECHO_REFLECTIONS.map(({ position, level }) => {
    const delayNode = audioContext.createDelay(echoWindow);
    const tapGain = audioContext.createGain();
    delayNode.delayTime.value = echoWindow * position;
    tapGain.gain.value = level;
    delayNode.connect(tapGain);
    tapGain.connect(echoFilter);
    return delayNode;
  });
  echoTapsByDuration.set(duration, taps);
}

async function ensureAudio(settings) {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio is unavailable in this browser.");
    }

    audioContext = new AudioContextClass({ latencyHint: "interactive" });
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);

    echoFilter = audioContext.createBiquadFilter();
    echoFilter.type = "lowpass";
    echoFilter.frequency.value = 1300;
    echoFilter.Q.value = 0.7;
    echoGain = audioContext.createGain();
    echoGain.gain.value = 0.3;
    echoFilter.connect(echoGain);
    echoGain.connect(masterGain);
  }

  masterGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.015);
  if (audioContext.state !== "running") {
    let timeout;
    try {
      await Promise.race([
        audioContext.resume(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Audio could not resume.")),
            AUDIO_READY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function makeTone(when, frequency, duration, withEcho, type) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);

  const peak = 0.75;
  envelope.gain.setValueAtTime(0, when);
  envelope.gain.linearRampToValueAtTime(
    peak,
    when + Math.min(0.008, duration / 2),
  );
  envelope.gain.setValueAtTime(
    peak,
    when + duration - Math.min(0.025, duration / 2),
  );
  envelope.gain.linearRampToValueAtTime(0, when + duration);

  oscillator.connect(envelope);
  envelope.connect(masterGain);
  if (withEcho) {
    ensureEchoTaps(duration);
    (echoTapsByDuration.get(duration) || []).forEach((delayNode) =>
      envelope.connect(delayNode),
    );
  }

  oscillator.start(when);
  oscillator.stop(when + duration + 0.01);
  scheduledOscillators.push(oscillator);
}

function getOutputClock() {
  const now = performance.now();
  try {
    const timestamp = audioContext.getOutputTimestamp?.();
    const timestampAge = now - timestamp?.performanceTime;
    if (
      timestamp &&
      timestamp.contextTime > 0 &&
      Number.isFinite(timestamp.contextTime) &&
      Number.isFinite(timestamp.performanceTime) &&
      timestamp.performanceTime > 0 &&
      timestamp.contextTime <= audioContext.currentTime &&
      timestampAge >= 0 &&
      timestampAge <= MAX_OUTPUT_TIMESTAMP_AGE_MS
    ) {
      const contextTime = timestamp.contextTime + timestampAge / 1000;
      return {
        contextTime,
        sampledContextTime: timestamp.contextTime,
        performanceTime: now,
        latency: Math.max(0, audioContext.currentTime - contextTime),
        source: "Output timestamp",
        timestampAgeMs: timestampAge,
      };
    }
    if (typeof audioContext.getOutputTimestamp === "function") return null;
  } catch {
    // Fall back to the latency estimates when output timestamps are unavailable.
  }

  const baseLatency = Number.isFinite(audioContext.baseLatency)
    ? audioContext.baseLatency
    : 0;
  const outputLatency = Number.isFinite(audioContext.outputLatency)
    ? audioContext.outputLatency
    : 0;
  return {
    contextTime: audioContext.currentTime - baseLatency - outputLatency,
    sampledContextTime: audioContext.currentTime,
    performanceTime: now,
    latency: baseLatency + outputLatency,
    source: "Latency estimates",
    timestampAgeMs: null,
  };
}

async function waitForOutputClock() {
  const deadline = performance.now() + AUDIO_READY_TIMEOUT_MS;
  const oscillator = audioContext.createOscillator();
  const silence = audioContext.createGain();
  silence.gain.value = 0;
  oscillator.connect(silence);
  silence.connect(audioContext.destination);
  oscillator.start();
  let previousClock;
  let stableSamples = 0;
  try {
    while (performance.now() < deadline) {
      const clock = getOutputClock();
      if (audioContext.state === "running" && clock && previousClock) {
        const clockDrift =
          (clock.contextTime - previousClock.contextTime) * 1000 -
          (clock.performanceTime - previousClock.performanceTime);
        stableSamples =
          clock.sampledContextTime > previousClock.sampledContextTime &&
          Math.abs(clockDrift) <= CLOCK_STABILITY_MS
            ? stableSamples + 1
            : 0;
        if (stableSamples >= 3) return clock;
      } else {
        stableSamples = 0;
      }
      previousClock = clock;
      await new Promise((resolve) =>
        setTimeout(resolve, CLOCK_SAMPLE_INTERVAL_MS),
      );
    }
    throw new Error("Audio output clock did not become ready.");
  } finally {
    oscillator.stop();
    oscillator.disconnect();
    silence.disconnect();
  }
}

export async function scheduleCountdown(settings, pattern = standardPattern) {
  const requestedAt = performance.now();
  startupDurationMs = null;
  startupError = null;
  stopScheduledAudio();
  let outputClock;
  let events;
  try {
    events = getEvents(settings.countdownSeconds, pattern);
    await ensureAudio(settings);
    outputClock = await waitForOutputClock();
  } catch (error) {
    startupDurationMs = performance.now() - requestedAt;
    startupError = error.message;
    throw error;
  }
  startupDurationMs = performance.now() - requestedAt;
  const firstEventOffset = Math.min(
    settings.countdownSeconds,
    ...events.map((event) => settings.countdownSeconds - event.seconds),
  );
  const leadSeconds = Math.max(
    SCHEDULE_LEAD_SECONDS,
    outputClock.latency - firstEventOffset + SCHEDULE_LEAD_SECONDS,
  );
  const timerStartTime = outputClock.performanceTime + leadSeconds * 1000;
  const contextStartTime = outputClock.contextTime + leadSeconds;
  events.forEach((event) => {
    const offset = settings.countdownSeconds - event.seconds;
    makeTone(
      outputClock.contextTime +
        (timerStartTime + offset * 1000 - outputClock.performanceTime) / 1000,
      event.frequency,
      event.duration,
      settings.withEcho,
      pattern.type ?? "square",
    );
  });

  countdownClock = {
    contextStartTime,
    timerStartTime,
    countdownSeconds: settings.countdownSeconds,
    lastOffsetMs: 0,
    stopwatchPerformanceTime: null,
  };
  return timerStartTime;
}

export function getTimerTime(now = performance.now()) {
  if (!countdownClock) return now;
  const deadline =
    countdownClock.timerStartTime + countdownClock.countdownSeconds * 1000;
  if (countdownClock.stopwatchPerformanceTime !== null) {
    return deadline + now - countdownClock.stopwatchPerformanceTime;
  }
  if (audioContext?.state !== "running")
    return now + countdownClock.lastOffsetMs;
  const clock = getOutputClock();
  if (!clock) return now + countdownClock.lastOffsetMs;
  const timerTime =
    countdownClock.timerStartTime +
    (clock.contextTime +
      (now - clock.performanceTime) / 1000 -
      countdownClock.contextStartTime) *
      1000;
  countdownClock.lastOffsetMs = timerTime - now;
  if (timerTime >= deadline) {
    countdownClock.stopwatchPerformanceTime = now - (timerTime - deadline);
  }
  return timerTime;
}

export function getTimingDiagnostics() {
  const clock = audioContext ? getOutputClock() : null;
  return {
    audioState: audioContext?.state ?? "Not initialized",
    clockSource: clock?.source ?? "Waiting for output clock",
    outputLatencyMs: clock ? clock.latency * 1000 : null,
    timestampAgeMs: clock?.timestampAgeMs ?? null,
    startupDurationMs,
    clockOffsetMs:
      countdownClock && clock
        ? countdownClock.timerStartTime +
          (clock.contextTime - countdownClock.contextStartTime) * 1000 -
          clock.performanceTime
        : null,
    startupError,
  };
}

export function stopScheduledAudio() {
  countdownClock = null;
  scheduledOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // An oscillator may have completed before the next session starts.
    }
  });
  scheduledOscillators.length = 0;
}
