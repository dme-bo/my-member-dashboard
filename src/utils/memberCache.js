// src/utils/memberCache.js
//
// Client-side cache for App.jsx's full "users" collection fetch (~14k docs,
// ~24MB raw) that feeds the Dashboard, Member List, and every other page that
// takes memberRecords as a prop. That size rules out localStorage/
// sessionStorage (typical 5-10MB quota) — this uses IndexedDB, which has no
// such ceiling in practice.
//
// Stale-while-revalidate, no TTL: a cached snapshot of any age is shown
// immediately on mount, while a full fetch always still runs in the
// background and overwrites it once complete. There's no freshness cutoff
// because showing slightly-stale data for the few seconds until that real
// fetch lands beats showing nothing, which is what happens on every cold
// load today.

const DB_NAME = "members-dashboard-cache";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const CACHE_KEY = "users-collection";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Returns { records, savedAt } or null — never throws, so a blocked/disabled/
// unavailable IndexedDB (private browsing, storage disabled, etc.) just means
// "no cache", falling back to the normal network fetch.
export async function readMemberCache() {
  try {
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (error) {
    console.warn("Member cache read failed (continuing without cache):", error);
    return null;
  }
}

// Non-fatal on failure — a caching layer should never be able to break the
// page it's trying to speed up.
export async function writeMemberCache(records) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ records, savedAt: Date.now() }, CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn("Member cache write failed (non-fatal):", error);
  }
}
