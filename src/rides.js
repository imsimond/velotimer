const RIDES_KEY = "velodrome-timer-rides";
const STORAGE_VERSION = 1;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
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

export function deleteRide(rideId, storage) {
  const rides = readRides(storage);
  const remainingRides = rides.filter((ride) => ride.id !== rideId);
  if (remainingRides.length === rides.length) return false;
  writeRides(remainingRides, storage);
  return true;
}
