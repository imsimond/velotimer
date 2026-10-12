import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteRide,
  filterRides,
  getSavedRiderNames,
  getSavedRides,
  saveRide,
} from "./rides.js";

const STORAGE_KEY = "velodrome-timer-rides";

function createStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, STORAGE_KEY);
      value = nextValue;
    },
  };
}

function ride(overrides = {}) {
  return {
    riderName: "Rider One",
    distanceMeters: 250,
    completedAt: "2026-10-12T12:00:00.000Z",
    elapsedMs: 12_345,
    laps: [
      { lapNumber: 1, splitMs: 6_000, diffMs: null, elapsedMs: 6_000 },
      { lapNumber: "END", splitMs: 6_345, diffMs: 345, elapsedMs: 12_345 },
    ],
    ...overrides,
  };
}

test("saved ride keeps numeric lap data and returns newest rides first", () => {
  const storage = createStorage();
  const olderRide = saveRide(ride(), storage);
  const newerRide = saveRide(
    ride({ riderName: "Rider Two", completedAt: "2026-10-12T13:00:00.000Z" }),
    storage,
  );

  assert.equal(typeof olderRide.distanceMeters, "number");
  assert.equal(olderRide.elapsedMs, 12_345);
  assert.deepEqual(olderRide.laps.at(-1), {
    lapNumber: "END",
    splitMs: 6_345,
    diffMs: 345,
    elapsedMs: 12_345,
  });
  assert.deepEqual(
    getSavedRides(storage).map(({ id }) => id),
    [newerRide.id, olderRide.id],
  );
});

test("rider suggestions are unique without case sensitivity", () => {
  const storage = createStorage();
  saveRide(ride({ riderName: "Rider One" }), storage);
  saveRide(
    ride({ riderName: "rider one", completedAt: "2026-10-12T13:00:00.000Z" }),
    storage,
  );
  saveRide(
    ride({ riderName: "Rider Two", completedAt: "2026-10-12T14:00:00.000Z" }),
    storage,
  );

  assert.deepEqual(getSavedRiderNames(storage), ["Rider Two", "rider one"]);
});

test("ride filters combine case-insensitive rider and exact distance", () => {
  const rides = [
    { id: "a", riderName: "Rider One", distanceMeters: 250 },
    { id: "b", riderName: "rider one", distanceMeters: 500 },
    { id: "c", riderName: "Rider Two", distanceMeters: 250 },
  ];

  assert.deepEqual(
    filterRides(rides, { riderName: "RIDER ONE", distanceMeters: 250 }),
    [rides[0]],
  );
  assert.deepEqual(filterRides(rides), rides);
});

test("corrupt storage reads as empty and can be replaced by a new save", () => {
  const storage = createStorage("not valid json");
  assert.deepEqual(getSavedRides(storage), []);

  const savedRide = saveRide(ride(), storage);
  assert.deepEqual(getSavedRides(storage), [savedRide]);
});

test("delete removes an existing ride and reports missing IDs", () => {
  const storage = createStorage();
  const savedRide = saveRide(ride(), storage);

  assert.equal(deleteRide(savedRide.id, storage), true);
  assert.deepEqual(getSavedRides(storage), []);
  assert.equal(deleteRide(savedRide.id, storage), false);
});

test("unavailable storage is reported when saving", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.throws(
    () => saveRide(ride(), unavailableStorage),
    /could not be saved/,
  );
});
