import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  ClipboardPen,
  Copy,
  RotateCcw,
  Settings2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  ActionIcon,
  Autocomplete,
  Button,
  Checkbox,
  Drawer,
  MantineProvider,
  Modal,
  NumberInput,
  Select,
  Slider,
  Switch,
  Tabs,
  Table,
  createTheme,
} from "@mantine/core";
import "@mantine/core/styles.css";
import {
  getTimerTime,
  getTimingDiagnostics,
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
import {
  deleteRide,
  filterRides,
  getSavedRiderNames,
  getSavedRides,
  saveRide,
} from "./rides.js";
import "./styles/main.scss";

const SETTINGS_KEY = "velotimer-settings";

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

function LapTable({ laps, scrollRef, visible, className = "" }) {
  return (
    <div className={`lap-reserved ${className}`}>
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

function formatRideDate(completedAt) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(completedAt));
}

function formatRideDateCompact(completedAt) {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  }).format(new Date(completedAt));
}

function formatDistance(distanceMeters) {
  return new Intl.NumberFormat().format(distanceMeters);
}

function RideComparisonTable({ rides, mode }) {
  const [leftRide, rightRide] = rides;
  const lapNumbers = [
    ...new Set(rides.flatMap((ride) => ride.laps.map((lap) => lap.lapNumber))),
  ].sort((left, right) => {
    if (left === "END") return 1;
    if (right === "END") return -1;
    return left - right;
  });
  const comparisonRows = lapNumbers.map((lapNumber) => {
    const leftLap = leftRide.laps.find((item) => item.lapNumber === lapNumber);
    const rightLap = rightRide.laps.find(
      (item) => item.lapNumber === lapNumber,
    );
    const leftValue = leftLap
      ? mode === "overall"
        ? leftLap.elapsedMs
        : leftLap.splitMs
      : null;
    const rightValue = rightLap
      ? mode === "overall"
        ? rightLap.elapsedMs
        : rightLap.splitMs
      : null;
    const difference =
      leftValue === null || rightValue === null ? null : leftValue - rightValue;

    return { lapNumber, leftValue, rightValue, difference };
  });
  const maxAbsoluteGap = Math.max(
    0,
    ...comparisonRows.map(({ difference }) => Math.abs(difference ?? 0)),
  );

  return (
    <div className="history-compare-scroll">
      <Table
        className="history-compare-table"
        layout="fixed"
        stickyHeader
        verticalSpacing={0}
        withColumnBorders={false}
        withRowBorders={false}
        withTableBorder={false}
      >
        <colgroup>
          <col className="history-compare-lap-column" />
          <col />
          <col />
          <col />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">Lap</Table.Th>
            <Table.Th scope="col">
              <span className="history-compare-rider">
                {leftRide.riderName}
              </span>
              <span className="history-compare-context">
                {formatRideDateCompact(leftRide.completedAt)}
              </span>
              <strong>{formatLapTime(leftRide.elapsedMs)}</strong>
            </Table.Th>
            <Table.Th className="history-compare-gap-heading" scope="col">
              Gap
            </Table.Th>
            <Table.Th scope="col">
              <span className="history-compare-rider">
                {rightRide.riderName}
              </span>
              <span className="history-compare-context">
                {formatRideDateCompact(rightRide.completedAt)}
              </span>
              <strong>{formatLapTime(rightRide.elapsedMs)}</strong>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {comparisonRows.map(
            ({ lapNumber, leftValue, rightValue, difference }) => {
              const leftIsFaster = difference < 0;
              const rightIsFaster = difference > 0;
              const fasterRider = leftIsFaster ? leftRide : rightRide;
              const barWidth = maxAbsoluteGap
                ? (Math.abs(difference ?? 0) / maxAbsoluteGap) * 50
                : 0;
              const patternId = `history-compare-bars-${mode}-${lapNumber}`;

              return (
                <Table.Tr key={lapNumber}>
                  <Table.Th scope="row">
                    <svg
                      aria-hidden="true"
                      className="history-compare-row-bar"
                      focusable="false"
                    >
                      <defs>
                        <pattern
                          id={patternId}
                          height="8"
                          patternTransform="rotate(45)"
                          patternUnits="userSpaceOnUse"
                          width="8"
                        >
                          <rect width="8" height="8" fill="#363530" />
                          <path
                            d="M0 0V8"
                            fill="none"
                            stroke="#49443b"
                            strokeWidth="2"
                          />
                        </pattern>
                      </defs>
                      {barWidth > 0 && (
                        <rect
                          fill={`url(#${patternId})`}
                          height="100%"
                          width={`${barWidth}%`}
                          x={`${difference < 0 ? 50 - barWidth : 50}%`}
                          y="0"
                        />
                      )}
                    </svg>
                    {lapNumber}
                  </Table.Th>
                  <Table.Td className="history-compare-split">
                    {leftValue === null ? "—" : formatLapTime(leftValue)}
                  </Table.Td>
                  <Table.Td
                    aria-label={
                      difference === null
                        ? "No comparison available"
                        : difference === 0
                          ? "Tied at zero seconds"
                          : `${fasterRider.riderName} ${mode === "overall" ? "leads by" : "is faster on this split by"} ${(Math.abs(difference) / 1000).toFixed(3)} seconds`
                    }
                    className="history-compare-gap"
                  >
                    {difference === null ? (
                      "—"
                    ) : difference === 0 ? (
                      <span className="history-compare-even">0.000</span>
                    ) : (
                      <div className="history-compare-lead">
                        <span
                          className={`history-compare-arrow ${leftIsFaster ? "is-faster" : "is-slower"}`}
                          aria-hidden="true"
                        >
                          <ArrowLeft />
                        </span>
                        <strong>
                          {(Math.abs(difference) / 1000).toFixed(3)}
                        </strong>
                        <span
                          className={`history-compare-arrow ${rightIsFaster ? "is-faster" : "is-slower"}`}
                          aria-hidden="true"
                        >
                          <ArrowRight />
                        </span>
                      </div>
                    )}
                  </Table.Td>
                  <Table.Td className="history-compare-split">
                    {rightValue === null ? "—" : formatLapTime(rightValue)}
                  </Table.Td>
                </Table.Tr>
              );
            },
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}

function RideComparisonTabs({ rides }) {
  return (
    <Tabs
      classNames={{
        root: "history-compare-tabs",
        list: "history-compare-tabs-list",
        tab: "history-compare-tab",
        panel: "history-compare-tab-panel",
      }}
      defaultValue="overall"
    >
      <Tabs.List grow>
        <Tabs.Tab value="overall">Overall</Tabs.Tab>
        <Tabs.Tab value="splits">Splits</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel keepMounted={false} value="overall">
        <RideComparisonTable mode="overall" rides={rides} />
      </Tabs.Panel>
      <Tabs.Panel keepMounted={false} value="splits">
        <RideComparisonTable mode="splits" rides={rides} />
      </Tabs.Panel>
    </Tabs>
  );
}

function SavedRidesDrawer({
  rides,
  selectedRide,
  onSelect,
  onBack,
  onDelete,
  error,
  open,
  onClose,
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRideIds, setSelectedRideIds] = useState([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [riderFilter, setRiderFilter] = useState(null);
  const [distanceFilter, setDistanceFilter] = useState(null);
  const riderOptions = [
    ...new Map(
      rides.map((ride) => [
        ride.riderName.trim().toLocaleLowerCase(),
        ride.riderName.trim(),
      ]),
    ).values(),
  ].sort((left, right) => left.localeCompare(right));
  const distanceOptions = [...new Set(rides.map((ride) => ride.distanceMeters))]
    .sort((left, right) => left - right)
    .map((distance) => ({
      value: String(distance),
      label: formatDistance(distance),
    }));
  const visibleRides = filterRides(rides, {
    riderName: riderFilter,
    distanceMeters: distanceFilter === null ? null : Number(distanceFilter),
  });
  const comparisonRides = rides.filter((ride) =>
    selectedRideIds.includes(ride.id),
  );
  const toggleRideSelection = (rideId) => {
    setSelectedRideIds((current) =>
      current.includes(rideId)
        ? current.filter((id) => id !== rideId)
        : [...current, rideId],
    );
  };

  return (
    <>
      <Drawer
        classNames={{
          content: "history-drawer-content",
          header: "history-drawer-header",
          title: "history-drawer-title",
          body: "history-drawer-body",
        }}
        closeButtonProps={{
          "aria-label": "Close ride history",
          icon: <X aria-hidden="true" />,
        }}
        onClose={() => {
          setComparisonOpen(false);
          setSelectedRideIds([]);
          onClose();
        }}
        opened={open}
        overlayProps={{ backgroundOpacity: 0.6, blur: 2 }}
        position="right"
        size="min(94vw, 480px)"
        title={
          selectedRide
            ? selectedRide.riderName
            : comparisonOpen
              ? "Compare rides"
              : "Ride History"
        }
      >
        {error && (
          <p className="ride-form-error" role="alert">
            {error}
          </p>
        )}
        {selectedRide ? (
          <div className="history-detail">
            <Button
              className="history-back"
              leftSection={<ArrowLeft aria-hidden="true" />}
              onClick={onBack}
              variant="subtle"
            >
              All rides
            </Button>
            <div className="history-detail-meta">
              <span>{formatRideDate(selectedRide.completedAt)}</span>
              <span>
                {new Intl.NumberFormat().format(selectedRide.distanceMeters)} m
              </span>
              <strong>{formatLapTime(selectedRide.elapsedMs)}</strong>
            </div>
            <LapTable
              className="history-lap-reserved"
              laps={selectedRide.laps}
              visible
            />
            <Button
              className="history-delete"
              leftSection={<Trash2 aria-hidden="true" />}
              onClick={() => setDeleteOpen(true)}
              variant="default"
            >
              Delete ride
            </Button>
          </div>
        ) : comparisonOpen ? (
          <div className="history-detail history-comparison-detail">
            <Button
              className="history-back"
              leftSection={<ArrowLeft aria-hidden="true" />}
              onClick={() => setComparisonOpen(false)}
              variant="subtle"
            >
              All rides
            </Button>
            <RideComparisonTabs rides={comparisonRides} />
          </div>
        ) : rides.length ? (
          <div className="history-browser">
            <div className="history-filters">
              <Select
                classNames={{
                  input: "history-filter-input",
                  label: "history-filter-label",
                }}
                clearable
                data={riderOptions}
                label="Rider"
                placeholder="All riders"
                value={riderFilter}
                onChange={setRiderFilter}
              />
              <Select
                classNames={{
                  input: "history-filter-input",
                  label: "history-filter-label",
                }}
                clearable
                data={distanceOptions}
                label="Distance"
                placeholder="All distances"
                value={distanceFilter}
                onChange={setDistanceFilter}
              />
            </div>
            {visibleRides.length ? (
              <div className="history-list-scroll">
                <div className="history-list-header" aria-hidden="true">
                  <span />
                  <span>Rider</span>
                  <span>Date</span>
                  <span>Dist</span>
                  <span>Total</span>
                </div>
                <ul className="history-list" aria-label="Saved rides">
                  {visibleRides.map((ride) => (
                    <li className="history-ride-row" key={ride.id}>
                      <Checkbox
                        aria-label={`Select ${ride.riderName}, ${formatRideDate(ride.completedAt)} for comparison`}
                        checked={selectedRideIds.includes(ride.id)}
                        className="history-ride-checkbox"
                        disabled={
                          !selectedRideIds.includes(ride.id) &&
                          selectedRideIds.length >= 2
                        }
                        onChange={() => toggleRideSelection(ride.id)}
                      />
                      <button
                        aria-label={`Open ${ride.riderName}, ${formatRideDate(ride.completedAt)}, ${formatDistance(ride.distanceMeters)} metres, ${formatLapTime(ride.elapsedMs)}`}
                        className="history-ride"
                        type="button"
                        onClick={() => onSelect(ride)}
                      >
                        <span className="history-ride-name">
                          {ride.riderName}
                        </span>
                        <time
                          dateTime={ride.completedAt}
                          title={formatRideDate(ride.completedAt)}
                        >
                          {formatRideDateCompact(ride.completedAt)}
                        </time>
                        <span className="history-ride-distance">
                          {formatDistance(ride.distanceMeters)}
                        </span>
                        <strong className="history-ride-time">
                          {formatLapTime(ride.elapsedMs)}
                        </strong>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="history-empty">No rides match these filters.</p>
            )}
            {selectedRideIds.length > 0 && (
              <div className="history-compare-footer">
                <Button
                  className="history-compare-action"
                  disabled={comparisonRides.length < 2}
                  fullWidth
                  onClick={() => setComparisonOpen(true)}
                >
                  Compare
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="history-empty">No saved rides yet.</p>
        )}
      </Drawer>

      <Modal
        centered
        classNames={{
          content: "history-confirm-content",
          header: "history-confirm-header",
          title: "history-confirm-title",
          body: "history-confirm-body",
        }}
        onClose={() => setDeleteOpen(false)}
        opened={deleteOpen}
        overlayProps={{ backgroundOpacity: 0.7, blur: 2 }}
        title="Delete this ride?"
      >
        <p className="history-confirm-copy">
          {selectedRide?.riderName} ·{" "}
          {formatLapTime(selectedRide?.elapsedMs ?? 0)}
        </p>
        <div className="history-confirm-actions">
          <Button onClick={() => setDeleteOpen(false)} variant="default">
            Cancel
          </Button>
          <Button
            color="red"
            leftSection={<Trash2 aria-hidden="true" />}
            onClick={() => {
              if (onDelete()) setDeleteOpen(false);
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
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

function TimingDiagnostics({ frameMetrics, fontReady, settings }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const sample = () =>
      setSnapshot({
        ...getTimingDiagnostics(),
        ...frameMetrics.current,
        visibility: document.visibilityState,
      });
    sample();
    const interval = setInterval(sample, 500);
    return () => clearInterval(interval);
  }, [open, frameMetrics]);

  const milliseconds = (value) =>
    Number.isFinite(value) ? `${value.toFixed(1)} ms` : "Not sampled";
  const rows = snapshot
    ? [
        ["Audio", snapshot.audioState],
        ["Clock", snapshot.clockSource],
        ["Startup wait", milliseconds(snapshot.startupDurationMs)],
        ["Output latency", milliseconds(snapshot.outputLatencyMs)],
        ["Timestamp age", milliseconds(snapshot.timestampAgeMs)],
        ["Clock correction", milliseconds(snapshot.clockOffsetMs)],
        ["Last digit lateness", milliseconds(snapshot.lastBoundaryLateMs)],
        ["Worst digit lateness", milliseconds(snapshot.maxBoundaryLateMs)],
        ["Longest frame gap", milliseconds(snapshot.maxFrameGapMs)],
        ["Worst React commit", milliseconds(snapshot.maxCommitMs)],
        ["Page", snapshot.visibility],
        ["Digit font", fontReady ? "Ready" : "Loading"],
      ]
    : [];

  const copyDiagnostics = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const report = {
      version: "audio-clock-v1",
      capturedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      visibility: document.visibilityState,
      fontReady,
      settings,
      ...getTimingDiagnostics(),
      ...frameMetrics.current,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable; take a screenshot instead.");
    }
  };

  return (
    <details
      className="timing-diagnostics"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Timing diagnostics
        <button
          type="button"
          aria-label="Copy timing diagnostics"
          title="Copy timing diagnostics"
          onClick={copyDiagnostics}
        >
          <Copy size={16} aria-hidden="true" />
        </button>
      </summary>
      {open && (
        <div className="timing-diagnostics-panel">
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {snapshot?.startupError && <p>{snapshot.startupError}</p>}
          {copyStatus && <p role="status">{copyStatus}</p>}
        </div>
      )}
    </details>
  );
}

function TimerApp() {
  const [timer, setTimer] = useState(() => createTimer(loadSettings()));
  const [now, setNow] = useState(() => performance.now());
  const [displayFontReady, setDisplayFontReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [rides, setRides] = useState(() => getSavedRides());
  const [riderName, setRiderName] = useState("");
  const [distanceMeters, setDistanceMeters] = useState("");
  const [rideSaved, setRideSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(false);
  const startPending = useRef(false);
  const frameMetrics = useRef({});
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
    let active = true;
    let previousDisplay = "";
    let previousFrameAt = null;
    let nextBoundary = null;
    const tick = () => {
      if (!active) return;
      const frameAt = performance.now();
      const sampledAt = getTimerTime(frameAt);
      if (previousFrameAt !== null) {
        frameMetrics.current.maxFrameGapMs = Math.max(
          frameMetrics.current.maxFrameGapMs ?? 0,
          frameAt - previousFrameAt,
        );
      }
      previousFrameAt = frameAt;
      const currentDisplay = getDisplay(timer, sampledAt);
      const displayKey = `${currentDisplay.phase}:${currentDisplay.minutes}:${currentDisplay.seconds}:${currentDisplay.tenths}`;
      if (displayKey !== previousDisplay) {
        previousDisplay = displayKey;
        const commitStartedAt = performance.now();
        flushSync(() => {
          setNow(sampledAt);
          setTimer((current) => advanceTimer(current, sampledAt));
        });
        const commitMs = performance.now() - commitStartedAt;
        frameMetrics.current.maxCommitMs = Math.max(
          frameMetrics.current.maxCommitMs ?? 0,
          commitMs,
        );
        if (nextBoundary !== null) {
          const lateMs = Math.max(0, sampledAt - nextBoundary) + commitMs;
          frameMetrics.current.lastBoundaryLateMs = lateMs;
          frameMetrics.current.maxBoundaryLateMs = Math.max(
            frameMetrics.current.maxBoundaryLateMs ?? 0,
            lateMs,
          );
        }
        nextBoundary =
          currentDisplay.phase === "countdown"
            ? timer.countdownDeadline -
              (Number(currentDisplay.seconds) - 1) * 1000
            : timer.countdownDeadline +
              (Math.floor((sampledAt - timer.countdownDeadline) / 100) + 1) *
                100;
      }
      if (active) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [isRunning, timer]);

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
    frameMetrics.current = {};
    try {
      const startsAt = await scheduleCountdown(timer.settings);
      setNow(getTimerTime());
      setTimer((current) => startCountdown(current, startsAt));
    } catch {
      stopScheduledAudio();
      setNotice(
        "Sound is not ready. Check audio output and press Start again.",
      );
    } finally {
      startPending.current = false;
      setStarting(false);
    }
  };

  const reset = () => {
    stopScheduledAudio();
    setNotice("");
    setRideSaved(false);
    setTimer((current) => resetTimer(current));
  };

  const openSaveDialog = () => {
    setRiderName("");
    setDistanceMeters("");
    setSaveError("");
    setSaveOpen(true);
  };

  const submitRide = (event) => {
    event.preventDefault();
    if (rideSaved || timer.phase !== "ended") return;

    try {
      saveRide({
        riderName,
        distanceMeters,
        completedAt: timer.completedAt,
        elapsedMs: timer.elapsedMs,
        laps: timer.laps,
      });
      setRides(getSavedRides());
      setRideSaved(true);
      setSaveOpen(false);
      setSaveError("");
      setNotice("");
    } catch (error) {
      setSaveError(error.message || "Ride could not be saved.");
    }
  };

  const openHistory = () => {
    setRides(getSavedRides());
    setSelectedRide(null);
    setHistoryError("");
    setHistoryOpen(true);
  };

  const removeSelectedRide = () => {
    if (!selectedRide) return false;
    try {
      const removed = deleteRide(selectedRide.id);
      if (!removed) {
        setHistoryError("This ride is no longer in local storage.");
        setRides(getSavedRides());
        return false;
      }
      setRides(getSavedRides());
      setSelectedRide(null);
      setHistoryError("");
      return true;
    } catch (error) {
      setHistoryError(error.message || "Ride could not be deleted.");
      return false;
    }
  };

  const lap = () => {
    const sampledAt = getTimerTime();
    setNow(sampledAt);
    setTimer((current) => recordLap(current, sampledAt));
  };

  const stop = () => {
    const sampledAt = getTimerTime();
    setNow(sampledAt);
    stopScheduledAudio();
    setTimer((current) => stopTimer(current, sampledAt));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <h1>VeloTimer</h1>
        </div>
        <div className="header-actions">
          <ActionIcon
            type="button"
            aria-label="Open ride history"
            title="Ride history"
            className="settings-trigger"
            color="white"
            onClick={openHistory}
            size={42}
            variant="subtle"
          >
            <ClipboardList aria-hidden="true" />
          </ActionIcon>
          <ActionIcon
            type="button"
            aria-label="Open settings"
            title="Settings"
            className="settings-trigger"
            color="white"
            disabled={timer.phase !== "ready" || starting}
            onClick={() => setSettingsOpen(true)}
            size={42}
            variant="subtle"
          >
            <Settings2 aria-hidden="true" />
          </ActionIcon>
        </div>
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
        <TimingDiagnostics
          frameMetrics={frameMetrics}
          fontReady={displayFontReady}
          settings={timer.settings}
        />
        {timer.phase === "ready" && (
          <Button
            type="button"
            className="action-button action-primary"
            disabled={starting || !displayFontReady}
            loading={starting}
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
          <div className="end-actions">
            <Button
              type="button"
              className="action-button action-primary"
              disabled={rideSaved}
              leftSection={<ClipboardPen aria-hidden="true" />}
              onClick={openSaveDialog}
            >
              {rideSaved ? "Saved" : "Save"}
            </Button>
            <Button
              type="button"
              className="action-button action-reset"
              leftSection={<RotateCcw aria-hidden="true" />}
              onClick={reset}
            >
              Reset
            </Button>
          </div>
        )}
      </footer>

      <Modal
        centered
        classNames={{
          content: "save-modal-content",
          header: "save-modal-header",
          title: "save-modal-title",
          body: "save-modal-body",
        }}
        onClose={() => setSaveOpen(false)}
        opened={saveOpen}
        overlayProps={{ backgroundOpacity: 0.7, blur: 2 }}
        title="Save ride"
      >
        <form className="save-form" onSubmit={submitRide}>
          <Autocomplete
            autoComplete="off"
            classNames={{ input: "save-input", label: "save-label" }}
            data={getSavedRiderNames()}
            label="Rider Name"
            maxDropdownHeight={220}
            required
            value={riderName}
            onChange={setRiderName}
          />
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            classNames={{ input: "save-input", label: "save-label" }}
            clampBehavior="strict"
            label="Distance"
            min={0}
            required
            suffix=" m"
            thousandSeparator=","
            value={distanceMeters}
            onChange={setDistanceMeters}
          />
          {saveError && (
            <p className="ride-form-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="save-form-actions">
            <Button onClick={() => setSaveOpen(false)} variant="default">
              Cancel
            </Button>
            <Button
              leftSection={<ClipboardPen aria-hidden="true" />}
              type="submit"
            >
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <SettingsDialog
        settings={timer.settings}
        onSettingChange={changeSettings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <SavedRidesDrawer
        rides={rides}
        selectedRide={selectedRide}
        onSelect={setSelectedRide}
        onBack={() => setSelectedRide(null)}
        onDelete={removeSelectedRide}
        error={historyError}
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setSelectedRide(null);
        }}
      />
    </main>
  );
}

function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production") return;
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
