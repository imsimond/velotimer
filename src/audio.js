const BASE_FREQUENCY = 488;
const BASE_DURATION = 0.33;
const SCHEDULE_LEAD_SECONDS = 0.12;
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

function getEvents(countdownSeconds) {
  return [
    { number: 30, frequency: BASE_FREQUENCY, duration: BASE_DURATION * 2 },
    { number: 10, frequency: BASE_FREQUENCY, duration: BASE_DURATION * 2 },
    { number: 5, frequency: BASE_FREQUENCY, duration: BASE_DURATION },
    { number: 4, frequency: BASE_FREQUENCY, duration: BASE_DURATION },
    { number: 3, frequency: BASE_FREQUENCY, duration: BASE_DURATION },
    { number: 2, frequency: BASE_FREQUENCY, duration: BASE_DURATION },
    { number: 1, frequency: BASE_FREQUENCY, duration: BASE_DURATION },
    { number: 0, frequency: BASE_FREQUENCY * 2, duration: BASE_DURATION * 3 },
  ].filter((event) => countdownSeconds - event.number >= 0);
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

    audioContext = new AudioContextClass();
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

  masterGain.gain.setTargetAtTime(
    settings.volume / 100,
    audioContext.currentTime,
    0.015,
  );
  if (audioContext.state !== "running") await audioContext.resume();
}

function makeTone(when, frequency, duration, withEcho) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, when);

  const peak = 0.75;
  envelope.gain.setValueAtTime(0, when);
  envelope.gain.linearRampToValueAtTime(peak, when + 0.008);
  envelope.gain.setValueAtTime(peak, when + duration - 0.025);
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

export async function scheduleCountdown(settings) {
  await ensureAudio(settings);
  stopScheduledAudio();

  const audioStartTime = audioContext.currentTime + SCHEDULE_LEAD_SECONDS;
  const timerStartTime = performance.now() + SCHEDULE_LEAD_SECONDS * 1000;
  getEvents(settings.countdownSeconds).forEach((event) => {
    const offset = settings.countdownSeconds - event.number;
    makeTone(
      audioStartTime + offset,
      event.frequency,
      event.duration,
      settings.withEcho,
    );
  });

  return timerStartTime;
}

export function setAudioVolume(volume) {
  if (!masterGain || !audioContext) return;
  masterGain.gain.setTargetAtTime(
    volume / 100,
    audioContext.currentTime,
    0.015,
  );
}

export function stopScheduledAudio() {
  scheduledOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // An oscillator may have completed before the next session starts.
    }
  });
  scheduledOscillators.length = 0;
}
