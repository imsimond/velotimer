import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw, Settings2, Square, X } from "lucide-react";
import {
  ActionIcon,
  Button,
  Drawer,
  MantineProvider,
  NumberInput,
  Slider,
  Switch,
  Table,
  createTheme,
} from "@mantine/core";
import "@mantine/core/styles.css";
import {
  scheduleCountdown,
  setAudioVolume,
  stopScheduledAudio,
} from "./audio.js";
import {
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
import "./styles/main.scss";

const SETTINGS_KEY = "velodrome-timer-settings";

function loadSettings() {
  try {
    return JSON.parse(sessionStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function requestPortraitOrientationLock() {
  const orientation = window.screen?.orientation;
  if (typeof orientation?.lock !== "function") return;

  try {
    orientation.lock("portrait").catch(() => {});
  } catch {
    // The API is optional and may be unavailable in browser tabs.
  }
}

function useScreenWakeLock(active) {
  const wakeLock = useRef(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;

    let disposed = false;
    const request = async () => {
      if (
        disposed ||
        wakeLock.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (disposed) {
          await sentinel.release();
          return;
        }
        wakeLock.current = sentinel;
        sentinel.addEventListener("release", () => {
          wakeLock.current = null;
        });
      } catch {
        wakeLock.current = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") request();
    };

    request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [active]);
}

function formatAnnouncement(display) {
  if (display.phase === "countdown")
    return `${display.seconds} seconds remaining`;
  if (display.phase === "ready") return `Ready, ${display.seconds} seconds`;
  const minutes = display.minutes ? `${display.minutes} minutes, ` : "";
  return `${minutes}${display.seconds}.${display.tenths} seconds`;
}

function ClockDigits({ display, fontReady }) {
  const isStopwatch = display.phase === "stopwatch";

  return (
    <div
      className={`clock-digits ${isStopwatch ? "is-stopwatch" : ""} ${fontReady ? "is-font-ready" : ""}`}
    >
      <span className="clock-minute-group" aria-hidden="true">
        {isStopwatch && display.minutes && (
          <>
            <span className="clock-small-group clock-minute-slot">
              <span className="clock-ghost clock-small-ghost">88</span>
              <span className="clock-small-value">{display.minutes}</span>
            </span>
            <span className="clock-minute-colon">:</span>
          </>
        )}
      </span>
      <span className="clock-large-group" aria-hidden="true">
        <span className="clock-ghost">88</span>
        <span className="clock-large-value">{display.seconds}</span>
      </span>
      <span
        className="clock-small-group clock-fraction-slot"
        aria-hidden="true"
      >
        {isStopwatch && (
          <>
            <span className="clock-ghost clock-small-ghost">.8</span>
            <span className="clock-small-value">.{display.tenths}</span>
          </>
        )}
      </span>
    </div>
  );
}

function LapTable({ laps, scrollRef, visible }) {
  return (
    <div className="lap-reserved">
      {visible && (
        <section className="lap-section" aria-label="Lap times">
          <div className="lap-scroll" ref={scrollRef}>
            <Table
              className="lap-table"
              horizontalSpacing={6}
              layout="fixed"
              stickyHeader
              verticalSpacing={0}
              withColumnBorders={false}
              withRowBorders={false}
              withTableBorder={false}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">Lap</Table.Th>
                  <Table.Th scope="col">Split</Table.Th>
                  <Table.Th scope="col">Diff</Table.Th>
                  <Table.Th scope="col">Elapsed</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {laps.map((lap, index) => {
                  const differenceClass =
                    lap.diffMs === null
                      ? ""
                      : lap.diffMs < 0
                        ? "faster"
                        : lap.diffMs > 0
                          ? "slower"
                          : "even";
                  const showSplit = laps.length > 1 && index > 0;
                  return (
                    <Table.Tr
                      key={`${lap.lapNumber}-${lap.elapsedMs}-${index}`}
                      className={lap.lapNumber === "END" ? "end-row" : ""}
                    >
                      <Table.Td>{lap.lapNumber}</Table.Td>
                      <Table.Td>
                        {showSplit ? formatLapTime(lap.splitMs) : ""}
                      </Table.Td>
                      <Table.Td className={differenceClass}>
                        {lap.diffMs === null ? "" : formatDiff(lap.diffMs)}
                      </Table.Td>
                      <Table.Td>{formatLapTime(lap.elapsedMs)}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsDialog({ settings, onSettingChange, open, onClose }) {
  return (
    <Drawer
      classNames={{
        content: "settings-drawer-content",
        header: "settings-drawer-header",
        title: "settings-drawer-title",
        body: "settings-drawer-body",
      }}
      closeButtonProps={{
        "aria-label": "Close settings",
        icon: <X aria-hidden="true" />,
      }}
      onClose={onClose}
      opened={open}
      overlayProps={{ backgroundOpacity: 0.6, blur: 2 }}
      position="right"
      size="min(90vw, 420px)"
      title="Settings"
    >
      <div className="settings-fields">
        <NumberInput
          allowDecimal={false}
          allowNegative={false}
          classNames={{
            root: "countdown-setting",
            label: "setting-label",
            input: "countdown-input",
          }}
          label="Countdown seconds"
          max={99}
          min={1}
          value={settings.countdownSeconds}
          hideControls
          clampBehavior="strict"
          onChange={(value) => {
            if (typeof value === "number" && Number.isInteger(value)) {
              onSettingChange({ countdownSeconds: value });
            }
          }}
        />
        <Switch
          checked={settings.withEcho}
          className="setting-toggle"
          color="red"
          label="Echo"
          onChange={(event) =>
            onSettingChange({ withEcho: event.currentTarget.checked })
          }
        />
        <div className="volume-setting">
          <div className="setting-row">
            <span className="setting-label">Volume</span>
            <output htmlFor="timer-volume">{settings.volume}%</output>
          </div>
          <Slider
            aria-label="Volume"
            className="volume-range"
            color="red"
            max={100}
            min={0}
            thumbLabel="Volume"
            value={settings.volume}
            onChange={(volume) => onSettingChange({ volume })}
          />
        </div>
      </div>
    </Drawer>
  );
}

function TimerApp() {
  const [timer, setTimer] = useState(() => createTimer(loadSettings()));
  const [now, setNow] = useState(() => performance.now());
  const [displayFontReady, setDisplayFontReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(false);
  const startPending = useRef(false);
  const lapScrollRef = useRef(null);
  const isRunning = timer.phase === "countdown" || timer.phase === "stopwatch";
  useScreenWakeLock(isRunning);

  useEffect(() => {
    let active = true;
    const showDigits = () => {
      if (active) setDisplayFontReady(true);
    };
    const fontSet = document.fonts;

    if (typeof fontSet?.load !== "function") {
      showDigits();
      return () => {
        active = false;
      };
    }

    try {
      fontSet
        .load('italic 700 11rem "DSEG7ClassicMini"', "88")
        .then(showDigits, showDigits);
    } catch {
      showDigits();
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(timer.settings));
    } catch {
      setNotice("Settings could not be saved for this tab.");
    }
  }, [timer.settings]);

  useEffect(() => {
    if (!isRunning) {
      setNow(performance.now());
      return undefined;
    }

    let frame = 0;
    const tick = () => {
      const sampledAt = performance.now();
      setNow(sampledAt);
      setTimer((current) => advanceTimer(current, sampledAt));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isRunning]);

  useEffect(() => {
    const container = lapScrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [timer.laps.length]);

  useEffect(() => {
    if (!isRunning) stopScheduledAudio();
  }, [isRunning]);

  const display = getDisplay(timer, now);
  const changeSettings = (patch) => {
    setTimer((current) =>
      updateSettings(current, { ...current.settings, ...patch }),
    );
    if (patch.volume !== undefined) setAudioVolume(patch.volume);
  };

  const start = async () => {
    if (startPending.current) return;
    requestPortraitOrientationLock();
    startPending.current = true;
    setStarting(true);
    setNotice("");
    let startsAt = performance.now();
    try {
      startsAt = await scheduleCountdown(timer.settings);
    } catch {
      setNotice("Sound could not start. The timer will run silently.");
      startsAt = performance.now();
    }
    setTimer((current) => startCountdown(current, startsAt));
    startPending.current = false;
    setStarting(false);
  };

  const reset = () => {
    stopScheduledAudio();
    setNotice("");
    setTimer((current) => resetTimer(current));
  };

  const lap = () => {
    const sampledAt = performance.now();
    setNow(sampledAt);
    setTimer((current) => recordLap(current, sampledAt));
  };

  const stop = () => {
    const sampledAt = performance.now();
    setNow(sampledAt);
    stopScheduledAudio();
    setTimer((current) => stopTimer(current, sampledAt));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <h1>Velodrome Timer</h1>
        </div>
        <ActionIcon
          type="button"
          aria-label="Open settings"
          title="Settings"
          className="settings-trigger"
          color="white"
          disabled={timer.phase !== "ready"}
          onClick={() => setSettingsOpen(true)}
          size={42}
          variant="subtle"
        >
          <Settings2 aria-hidden="true" />
        </ActionIcon>
      </header>

      <section className="timer-stage" aria-label="Timer">
        <div className="clock-frame">
          <ClockDigits display={display} fontReady={displayFontReady} />
          <output className="visually-hidden" aria-live="off">
            {formatAnnouncement(display)}
          </output>
        </div>
      </section>

      <p className="status-notice" role="status">
        {notice}
      </p>

      <LapTable
        laps={timer.laps}
        scrollRef={lapScrollRef}
        visible={timer.phase === "ended" || timer.laps.length > 0}
      />

      <footer className={`action-dock phase-${timer.phase}`}>
        {timer.phase === "ready" && (
          <Button
            type="button"
            className="action-button action-primary"
            disabled={starting}
            fullWidth
            onClick={start}
          >
            Start
          </Button>
        )}
        {timer.phase === "countdown" && (
          <Button
            type="button"
            className="action-button action-primary"
            fullWidth
            leftSection={<RotateCcw aria-hidden="true" />}
            onClick={reset}
          >
            Reset
          </Button>
        )}
        {timer.phase === "stopwatch" && (
          <div className="split-actions">
            <Button
              type="button"
              className="action-button action-lap"
              fullWidth
              onClick={lap}
            >
              Lap
            </Button>
            <Button
              type="button"
              className="action-button action-stop"
              fullWidth
              leftSection={<Square aria-hidden="true" fill="currentColor" />}
              onClick={stop}
            >
              Stop
            </Button>
          </div>
        )}
        {timer.phase === "ended" && (
          <Button
            type="button"
            className="action-button action-primary"
            fullWidth
            leftSection={<RotateCcw aria-hidden="true" />}
            onClick={reset}
          >
            Reset
          </Button>
        )}
      </footer>

      <SettingsDialog
        settings={timer.settings}
        onSettingChange={changeSettings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const serviceWorkerUrl = new URL("sw.js", document.baseURI);
  const scope = new URL(".", document.baseURI).pathname;
  navigator.serviceWorker.register(serviceWorkerUrl, { scope }).catch(() => {});
}

const theme = createTheme({
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  primaryColor: "red",
});

createRoot(document.getElementById("root")).render(
  <MantineProvider forceColorScheme="dark" theme={theme}>
    <TimerApp />
  </MantineProvider>,
);

registerServiceWorker();
