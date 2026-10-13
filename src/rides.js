const RIDES_KEY = "velotimer-rides";
const STORAGE_VERSION = 1;
export const MAX_RIDE_NOTES_LENGTH = 1000;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function stripHtmlTags(value) {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").slice(0, MAX_RIDE_NOTES_LENGTH);
}

function isLap(lap) {
  return (
    lap !== null &&
    typeof lap === "object" &&
    (typeof lap.lapNumber === "number" || lap.lapNumber === "END") &&
    Number.isFinite(lap.splitMs) &&
    lap.splitMs >= 0 &&
    (lap.diffMs === null || Number.isFinite(lap.diffMs)) &&
    Number.isFinite(lap.elapsedMs) &&
    lap.elapsedMs >= 0
  );
}

function isRide(ride) {
  return (
    ride !== null &&
    typeof ride === "object" &&
    typeof ride.id === "string" &&
    typeof ride.riderName === "string" &&
    ride.riderName.trim().length > 0 &&
    Number.isFinite(ride.distanceMeters) &&
    ride.distanceMeters >= 0 &&
    typeof ride.completedAt === "string" &&
    Number.isFinite(Date.parse(ride.completedAt)) &&
    Number.isFinite(ride.elapsedMs) &&
    ride.elapsedMs >= 0 &&
    (ride.notes === undefined || typeof ride.notes === "string") &&
    Array.isArray(ride.laps) &&
    ride.laps.every(isLap)
  );
}

function readRides(storage) {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return [];

  try {
    const value = resolvedStorage.getItem(RIDES_KEY);
    if (!value) return [];
    const collection = JSON.parse(value);
    if (
      collection?.version !== STORAGE_VERSION ||
      !Array.isArray(collection.rides)
    ) {
      return [];
    }
    return collection.rides
      .filter(isRide)
      .map((ride) => ({ ...ride, notes: stripHtmlTags(ride.notes ?? "") }))
      .sort(
        (left, right) =>
          Date.parse(right.completedAt) - Date.parse(left.completedAt),
      );
  } catch {
    return [];
  }
}

function writeRides(rides, storage) {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) throw new Error("Local storage is unavailable.");

  try {
    resolvedStorage.setItem(
      RIDES_KEY,
      JSON.stringify({ version: STORAGE_VERSION, rides }),
    );
  } catch {
    throw new Error("Ride could not be saved to local storage.");
  }
}

function createRideId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getSavedRides(storage) {
  return readRides(storage);
}

function formatElapsedTime(milliseconds) {
  const roundedMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(roundedMilliseconds / 60_000);
  const seconds = String(Math.floor(roundedMilliseconds / 1000) % 60).padStart(
    2,
    "0",
  );
  const fractionalMilliseconds = String(roundedMilliseconds % 1000).padStart(
    3,
    "0",
  );
  return `${minutes}:${seconds}.${fractionalMilliseconds}`;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function ridesToCsv(rides) {
  const maxSplitCount = Math.max(0, ...rides.map((ride) => ride.laps.length));
  const splitColumns = Array.from(
    { length: maxSplitCount },
    (_, index) => `lap${index + 1}_splitMs`,
  );

  const rows = [
    [
      "riderName",
      "completedAt",
      "distanceMetres",
      "elapsedTime",
      "notes",
      "splitCount",
      ...splitColumns,
    ],
    ...rides.map((ride) => [
      ride.riderName,
      ride.completedAt,
      ride.distanceMeters,
      formatElapsedTime(ride.elapsedMs),
      ride.notes,
      ride.laps.length,
      ...splitColumns.map((_, index) => ride.laps[index]?.splitMs ?? ""),
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function getSavedRiderNames(storage) {
  const names = new Map();
  for (const ride of readRides(storage)) {
    const key = ride.riderName.trim().toLocaleLowerCase();
    if (!names.has(key)) names.set(key, ride.riderName);
  }
  return [...names.values()];
}

export function filterRides(
  rides,
  { riderName = null, distanceMeters = null } = {},
) {
  return rides.filter((ride) => {
    const matchesRider =
      riderName === null ||
      ride.riderName.trim().toLocaleLowerCase() ===
        riderName.trim().toLocaleLowerCase();
    const matchesDistance =
      distanceMeters === null || ride.distanceMeters === distanceMeters;
    return matchesRider && matchesDistance;
  });
}

export function saveRide(ride, storage) {
  const riderName = ride.riderName.trim();
  const savedRide = {
    id: createRideId(),
    riderName,
    distanceMeters: Number(ride.distanceMeters),
    completedAt: ride.completedAt ?? new Date().toISOString(),
    elapsedMs: ride.elapsedMs,
    laps: ride.laps.map((lap) => ({ ...lap })),
    notes: stripHtmlTags(ride.notes ?? ""),
  };

  if (!isRide(savedRide)) throw new Error("Enter a valid rider and ride.");

  const rides = readRides(storage);
  rides.push(savedRide);
  rides.sort(
    (left, right) =>
      Date.parse(right.completedAt) - Date.parse(left.completedAt),
  );
  writeRides(rides, storage);
  return savedRide;
}

export function updateRideNotes(rideId, notes, storage) {
  const rides = readRides(storage);
  let found = false;
  const updatedRides = rides.map((ride) => {
    if (ride.id !== rideId) return ride;
    found = true;
    return { ...ride, notes: stripHtmlTags(notes) };
  });
  if (!found) return false;
  writeRides(updatedRides, storage);
  return true;
}

export function deleteRide(rideId, storage) {
  const rides = readRides(storage);
  const remainingRides = rides.filter((ride) => ride.id !== rideId);
  if (remainingRides.length === rides.length) return false;
  writeRides(remainingRides, storage);
  return true;
}
