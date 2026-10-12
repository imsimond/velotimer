import assert from "node:assert/strict";
import test from "node:test";

import { scheduleCountdown, stopScheduledAudio } from "./audio.js";

test("schedules the first beep at the output time for the displayed boundary", async () => {
  const originalWindow = globalThis.window;
  const oscillatorStartTimes = [];
  let outputPerformanceTime;
  let outputContextTime = 9.5;

  class FakeAudioContext {
    baseLatency = 0.1;
    currentTime = 10;
    destination = {};
    outputLatency = 0.4;
    state = "running";

    createGain() {
      return {
        connect() {},
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
        frequency: { value: 0 },
        Q: { value: 0 },
      };
    }

    createOscillator() {
      return {
        connect() {},
        frequency: { setValueAtTime() {} },
        start(when) {
          oscillatorStartTimes.push(when);
        },
        stop() {},
        type: "square",
      };
    }

    getOutputTimestamp() {
      outputPerformanceTime = performance.now();
      return {
        contextTime: outputContextTime,
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
    const expectedOutputTime =
      9.5 + (timerStartTime - outputPerformanceTime) / 1000;

    assert.ok(Math.abs(oscillatorStartTimes[0] - expectedOutputTime) < 0.001);
    assert.ok(oscillatorStartTimes[0] >= 10.12);

    stopScheduledAudio();
    oscillatorStartTimes.length = 0;
    outputContextTime = 0;
    await scheduleCountdown({
      countdownSeconds: 30,
      volume: 60,
      withEcho: false,
    });

    assert.ok(Math.abs(oscillatorStartTimes[0] - 10.12) < 0.01);
  } finally {
    stopScheduledAudio();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
