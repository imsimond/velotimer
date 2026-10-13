export const DEFAULT_SETTINGS = Object.freeze({
  countdownSeconds: 12,
  beepPattern: "standard",
  withEcho: true,
  volume: 60,
});

export const MIN_COUNTDOWN_SECONDS = 1;
export const MAX_COUNTDOWN_SECONDS = 99;
export const MAX_STOPWATCH_MS = 5_999_999;

export function normalizeSettings(settings = {}) {
  const countdownSeconds = Number(settings.countdownSeconds);
  const volume = Number(settings.volume);

  return {
    countdownSeconds:
      Number.isInteger(countdownSeconds) &&
      countdownSeconds >= MIN_COUNTDOWN_SECONDS &&
      countdownSeconds <= MAX_COUNTDOWN_SECONDS
        ? countdownSeconds
        : DEFAULT_SETTINGS.countdownSeconds,
    beepPattern:
      typeof settings.beepPattern === "string" && settings.beepPattern.trim()
        ? settings.beepPattern
        : DEFAULT_SETTINGS.beepPattern,
    withEcho:
      typeof settings.withEcho === "boolean"
        ? settings.withEcho
        : DEFAULT_SETTINGS.withEcho,
    volume: Number.isFinite(volume)
      ? Math.min(100, Math.max(0, Math.round(volume)))
      : DEFAULT_SETTINGS.volume,
  };
}

export function createTimer(settings) {
  return {
    phase: "ready",
    settings: normalizeSettings(settings),
    countdownDeadline: null,
    stopwatchStartedAt: null,
    elapsedMs: 0,
    completedAt: null,
    laps: [],
  };
}

export function updateSettings(timer, settings) {
  if (timer.phase !== "ready") return timer;
  return { ...timer, settings: normalizeSettings(settings) };
}

export function startCountdown(timer, now) {
  if (timer.phase !== "ready") return timer;
  return {
    ...timer,
    phase: "countdown",
    countdownDeadline: now + timer.settings.countdownSeconds * 1000,
  };
}

export function resetTimer(timer) {
  return createTimer(timer.settings);
}

function addEndRow(timer, elapsedMs) {
  const previousLap = timer.laps.at(-1);
  const splitMs = elapsedMs - (previousLap?.elapsedMs ?? 0);
  const diffMs = previousLap ? splitMs - previousLap.splitMs : null;

  return {
    ...timer,
    phase: "ended",
    elapsedMs,
    completedAt: new Date().toISOString(),
    laps: [
      ...timer.laps,
      {
        lapNumber: "END",
        splitMs,
        diffMs,
        elapsedMs,
      },
    ],
  };
}

export function advanceTimer(timer, now) {
  if (timer.phase === "countdown") {
    if (now < timer.countdownDeadline) return timer;
    return advanceTimer(
      {
        ...timer,
        phase: "stopwatch",
        stopwatchStartedAt: timer.countdownDeadline,
      },
      now,
    );
  }

  if (timer.phase !== "stopwatch") return timer;

  const elapsedMs = Math.max(0, now - timer.stopwatchStartedAt);
  if (elapsedMs >= MAX_STOPWATCH_MS) {
    return addEndRow(timer, MAX_STOPWATCH_MS);
  }
  return timer;
}

export function recordLap(timer, now) {
  const current = advanceTimer(timer, now);
  if (current.phase !== "stopwatch") return current;

  const elapsedMs = Math.min(
    MAX_STOPWATCH_MS,
    Math.round(Math.max(0, now - current.stopwatchStartedAt)),
  );
  const previousLap = current.laps.at(-1);
  const splitMs = elapsedMs - (previousLap?.elapsedMs ?? 0);
  const diffMs = previousLap ? splitMs - previousLap.splitMs : null;

  return {
    ...current,
    laps: [
      ...current.laps,
      {
        lapNumber: current.laps.length + 1,
        splitMs,
        diffMs,
        elapsedMs,
      },
    ],
  };
}

export function stopTimer(timer, now) {
  const current = advanceTimer(timer, now);
  if (current.phase !== "stopwatch") return current;

  const elapsedMs = Math.min(
    MAX_STOPWATCH_MS,
    Math.round(Math.max(0, now - current.stopwatchStartedAt)),
  );
  return addEndRow(current, elapsedMs);
}

function stopwatchDisplay(elapsedMs) {
  const totalTenths = Math.floor(
    Math.min(MAX_STOPWATCH_MS, Math.max(0, elapsedMs)) / 100,
  );
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor(totalTenths / 10) % 60;

  return {
    phase: "stopwatch",
    minutes: minutes > 0 ? String(minutes).padStart(2, "0") : null,
    seconds: String(seconds).padStart(2, "0"),
    tenths: String(totalTenths % 10),
  };
}

export function getDisplay(timer, now) {
  if (timer.phase === "countdown") {
    const remainingMs = timer.countdownDeadline - now;
    if (remainingMs <= 0) {
      return stopwatchDisplay(-remainingMs);
    }
    return {
      phase: "countdown",
      seconds: String(
        Math.min(
          timer.settings.countdownSeconds,
          Math.ceil(remainingMs / 1000),
        ),
      ).padStart(2, "0"),
    };
  }

  if (timer.phase === "stopwatch" || timer.phase === "ended") {
    const elapsedMs =
      timer.phase === "ended"
        ? timer.elapsedMs
        : now - timer.stopwatchStartedAt;
    return stopwatchDisplay(elapsedMs);
  }

  return {
    phase: "ready",
    seconds: String(timer.settings.countdownSeconds).padStart(2, "0"),
  };
}

export function formatLapTime(milliseconds) {
  const roundedMilliseconds = Math.round(milliseconds);
  const wholeSeconds = Math.floor(roundedMilliseconds / 1000);
  const fractionalMilliseconds = String(roundedMilliseconds % 1000).padStart(
    3,
    "0",
  );
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = String(wholeSeconds % 60).padStart(2, "0");
  const time = `${minutes > 0 ? `${minutes}:` : ""}${seconds}.${fractionalMilliseconds}`;
  return milliseconds < 0 ? `-${time}` : time;
}

export function formatDiff(milliseconds) {
  if (milliseconds === null) return "—";
  const sign = milliseconds > 0 ? "+" : milliseconds < 0 ? "−" : "";
  const absoluteMilliseconds = Math.round(Math.abs(milliseconds));
  const wholeSeconds = Math.floor(absoluteMilliseconds / 1000);
  const fractionalMilliseconds = String(absoluteMilliseconds % 1000).padStart(
    3,
    "0",
  );
  const time =
    wholeSeconds < 60
      ? `${wholeSeconds}.${fractionalMilliseconds}`
      : formatLapTime(absoluteMilliseconds);
  return `${sign}${time}`;
}
