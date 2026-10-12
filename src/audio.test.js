import assert from "node:assert/strict";
import test from "node:test";

import {
  getTimerTime,
  getTimingDiagnostics,
  scheduleCountdown,
  stopScheduledAudio,
} from "./audio.js";

test("waits for output readiness, aligns cues, and keeps stopwatch timing monotonic", async () => {
  const originalWindow = globalThis.window;
  const oscillatorStartTimes = [];
  let outputPerformanceTime;
  let timestampMode = "warming";
  const createdAt = performance.now();
  let timestampCalls = 0;
  let clockShift = 0;
  let audioState = "suspended";
  let resumeBlocked = false;

  class FakeAudioContext {
    baseLatency = 0.1;
    get currentTime() {
      return 10 + (performance.now() - createdAt) / 1000;
    }
    destination = {};
    outputLatency = 0.4;
    get state() {
      return audioState;
    }

    constructor(options) {
      assert.equal(options.latencyHint, "interactive");
    }

    async resume() {
      if (resumeBlocked) return new Promise(() => {});
      audioState = "running";
    }

    createGain() {
      return {
        connect() {},
        disconnect() {},
        gain: {
          linearRampToValueAtTime() {},
          setTargetAtTime() {},
          setValueAtTime() {},
          value: 1,
        },
      };
    }

    createBiquadFilter() {
      return {
        connect() {},
        disconnect() {},
        frequency: { value: 0 },
        Q: { value: 0 },
      };
    }

    createOscillator() {
      return {
        connect() {},
        disconnect() {},
        frequency: { setValueAtTime() {} },
        start(when) {
          if (when !== undefined) oscillatorStartTimes.push(when);
        },
        stop() {},
        type: "square",
      };
    }

    getOutputTimestamp() {
      timestampCalls += 1;
      outputPerformanceTime =
        performance.now() - (timestampMode === "stale" ? 200 : 40);
      return {
        contextTime:
          timestampMode === "invalid" ||
          (timestampMode === "warming" && timestampCalls < 4)
            ? 0
            : timestampMode === "frozen"
              ? 9.5
              : 9.5 + (outputPerformanceTime - createdAt) / 1000 + clockShift,
        performanceTime: outputPerformanceTime,
      };
    }
  }

  globalThis.window = { AudioContext: FakeAudioContext };
  try {
    const timerStartTime = await scheduleCountdown({
      countdownSeconds: 30,
      volume: 60,
      withEcho: false,
    });
    const expectedOutputTime = 9.5 + (timerStartTime - createdAt) / 1000;

    assert.ok(Math.abs(oscillatorStartTimes[0] - expectedOutputTime) < 0.001);
    assert.ok(timestampCalls >= 7);
    assert.ok(timerStartTime > performance.now() + 500);
    assert.ok(Math.abs(getTimerTime() - performance.now()) < 2);
    assert.equal(getTimingDiagnostics().clockSource, "Output timestamp");
    assert.ok(Math.abs(getTimingDiagnostics().outputLatencyMs - 500) < 2);
    assert.ok(getTimingDiagnostics().startupDurationMs >= 100);
    assert.equal(oscillatorStartTimes.length, 8);
    const offsets = [0, 20, 25, 26, 27, 28, 29, 30];
    for (let index = 1; index < oscillatorStartTimes.length; index += 1) {
      assert.ok(
        Math.abs(
          oscillatorStartTimes[index] -
            oscillatorStartTimes[0] -
            offsets[index],
        ) < 0.001,
      );
    }

    clockShift = 0.05;
    assert.ok(Math.abs(getTimerTime() - performance.now() - 50) < 2);
    timestampMode = "invalid";
    assert.ok(Math.abs(getTimerTime() - performance.now() - 50) < 2);
    timestampMode = "ready";
    const afterGo = timerStartTime + 30_001;
    assert.ok(Math.abs(getTimerTime(afterGo) - afterGo - 50) < 2);
    clockShift = -0.2;
    assert.ok(Math.abs(getTimerTime(afterGo + 100) - afterGo - 150) < 2);
    clockShift = 0;

    stopScheduledAudio();
    oscillatorStartTimes.length = 0;
    for (const mode of ["invalid", "stale", "frozen"]) {
      timestampMode = mode;
      await assert.rejects(
        scheduleCountdown({
          countdownSeconds: 30,
          volume: 60,
          withEcho: false,
        }),
        /did not become ready/,
      );
    }

    assert.equal(oscillatorStartTimes.length, 0);
    assert.match(getTimingDiagnostics().startupError, /did not become ready/);
    const sampledAt = performance.now();
    assert.equal(getTimerTime(sampledAt), sampledAt);

    audioState = "suspended";
    resumeBlocked = true;
    await assert.rejects(
      scheduleCountdown({ countdownSeconds: 1, volume: 60, withEcho: false }),
      /could not resume/,
    );
    assert.equal(oscillatorStartTimes.length, 0);
    resumeBlocked = false;

    timestampMode = "ready";
    FakeAudioContext.prototype.getOutputTimestamp = undefined;
    const fallbackStart = await scheduleCountdown({
      countdownSeconds: 1,
      volume: 60,
      withEcho: false,
    });
    assert.ok(
      Math.abs(
        oscillatorStartTimes[0] - (9.5 + (fallbackStart - createdAt) / 1000),
      ) < 0.001,
    );
    assert.equal(getTimingDiagnostics().clockSource, "Latency estimates");
  } finally {
    stopScheduledAudio();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
