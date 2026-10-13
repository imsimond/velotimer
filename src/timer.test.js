import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_STOPWATCH_MS,
  advanceTimer,
  createTimer,
  formatDiff,
  formatLapTime,
  getDisplay,
  recordLap,
  resetTimer,
  startCountdown,
  stopTimer,
  updateSettings,
} from "./timer.js";

test("countdown hands off at its deadline, independent of delayed updates", () => {
  const started = startCountdown(createTimer(), 500);
  const delayed = advanceTimer(started, 13_745);

  assert.equal(delayed.phase, "stopwatch");
  assert.equal(delayed.stopwatchStartedAt, 12_500);
  assert.deepEqual(getDisplay(delayed, 13_745), {
    phase: "stopwatch",
    minutes: null,
    seconds: "01",
    tenths: "2",
  });
});

test("countdown display never exceeds its configured start value", () => {
  const started = startCountdown(createTimer(), 120);

  assert.deepEqual(getDisplay(started, 0), {
    phase: "countdown",
    seconds: "12",
  });
});

test("each cue boundary changes the digit exactly at the scheduled time", () => {
  for (const countdownSeconds of [1, 5, 12, 30, 99]) {
    const startsAt = 750.25;
    const timer = startCountdown(createTimer({ countdownSeconds }), startsAt);
    for (const number of [30, 10, 5, 4, 3, 2, 1, 0]) {
      if (number >= countdownSeconds) continue;
      const boundary = startsAt + (countdownSeconds - number) * 1000;
      assert.equal(
        getDisplay(timer, boundary - 0.01).seconds,
        String(number + 1).padStart(2, "0"),
      );
      assert.equal(
        getDisplay(timer, boundary).seconds,
        String(number).padStart(2, "0"),
      );
      assert.equal(
        getDisplay(timer, boundary).phase,
        number === 0 ? "stopwatch" : "countdown",
      );
    }
  }
});

test("countdown reset returns to ready and retains settings", () => {
  const configured = updateSettings(createTimer(), {
    countdownSeconds: 37,
    beepPattern: "Test velodrome",
    withEcho: false,
    volume: 42,
  });
  const reset = resetTimer(startCountdown(configured, 0));

  assert.equal(reset.phase, "ready");
  assert.deepEqual(reset.settings, {
    countdownSeconds: 37,
    beepPattern: "Test velodrome",
    withEcho: false,
    volume: 42,
  });
  assert.deepEqual(getDisplay(reset, 0), { phase: "ready", seconds: "37" });
});

test("audio pattern defaults to Standard for old or invalid settings", () => {
  for (const beepPattern of [undefined, null, "", "  ", 123]) {
    assert.equal(createTimer({ beepPattern }).settings.beepPattern, "standard");
  }
});

test("laps record elapsed, split, and adjacent-split difference", () => {
  const started = startCountdown(createTimer({ countdownSeconds: 1 }), 0);
  const firstLap = recordLap(started, 12_345.678);
  const secondLap = recordLap(firstLap, 20_000);

  assert.equal(firstLap.phase, "stopwatch");
  assert.equal(firstLap.laps[0].lapNumber, 1);
  assert.equal(firstLap.laps[0].elapsedMs, 11_346);
  assert.equal(firstLap.laps[0].splitMs, 11_346);
  assert.equal(firstLap.laps[0].diffMs, null);
  assert.equal(secondLap.laps[1].splitMs, 7_654);
  assert.equal(secondLap.laps[1].diffMs, -3_692);
});

test("Stop appends an END row with the final split", () => {
  const started = startCountdown(createTimer({ countdownSeconds: 1 }), 0);
  const firstLap = recordLap(started, 5_234.567);
  const ended = stopTimer(firstLap, 8_765.432);

  assert.equal(ended.phase, "ended");
  assert.equal(Number.isFinite(Date.parse(ended.completedAt)), true);
  assert.deepEqual(ended.laps.at(-1), {
    lapNumber: "END",
    splitMs: 3_530,
    diffMs: -705,
    elapsedMs: 7_765,
  });
});

test("automatic end records the exact 99:59.999 limit once", () => {
  const started = startCountdown(createTimer({ countdownSeconds: 1 }), 0);
  const ended = advanceTimer(started, 1_000 + MAX_STOPWATCH_MS + 2_000);

  assert.equal(ended.phase, "ended");
  assert.equal(ended.elapsedMs, MAX_STOPWATCH_MS);
  assert.equal(Number.isFinite(Date.parse(ended.completedAt)), true);
  assert.equal(ended.laps.at(-1).lapNumber, "END");
  assert.equal(ended.laps.at(-1).elapsedMs, MAX_STOPWATCH_MS);
});

test("display changes to minute digits at one minute and stays within limit", () => {
  const started = advanceTimer(
    startCountdown(createTimer({ countdownSeconds: 1 }), 0),
    1_000,
  );

  assert.deepEqual(getDisplay(started, 61_000), {
    phase: "stopwatch",
    minutes: "01",
    seconds: "00",
    tenths: "0",
  });
  assert.deepEqual(
    getDisplay({ ...started, phase: "ended", elapsedMs: MAX_STOPWATCH_MS }, 0),
    {
      phase: "stopwatch",
      minutes: "99",
      seconds: "59",
      tenths: "9",
    },
  );
  assert.equal(formatLapTime(MAX_STOPWATCH_MS), "99:59.999");
});

test("lap time formatting rounds to milliseconds and shows signed differences", () => {
  assert.equal(formatLapTime(12_345.67), "12.346");
  assert.equal(formatLapTime(65_432.1), "1:05.432");
  assert.equal(formatDiff(-3_691.356), "−3.691");
  assert.equal(formatDiff(0), "0.000");
});
