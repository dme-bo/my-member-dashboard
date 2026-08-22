// Drop-in replacement for the subset of the `firebase/firestore` client SDK
// this app uses. Firestore security rules were tightened to require a
// per-member Firebase Auth identity, which doesn't fit this internal admin
// dashboard's "read/write everything" access pattern — so instead of talking
// to Firestore directly from the browser, every call here goes through
// /api/firestore, which uses the Firebase Admin SDK server-side (bypassing
// rules entirely, the same way any trusted backend would).
//
// Call sites should only need to change their imports (from "firebase/firestore"
// and "../firebase") to this module — the function names and call shapes match.

const AUTO_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateAutoId = () => {
  let id = "";
  for (let i = 0; i < 20; i++) {
    id += AUTO_ID_CHARS.charAt(Math.floor(Math.random() * AUTO_ID_CHARS.length));
  }
  return id;
};

// Placeholder — real client code never needs to read this, it just gets
// threaded through collection()/doc() the same way the real `db` export did.
export const db = { __firestoreClientShim: true };

async function callApi(body) {
  const response = await fetch("/api/firestore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Firestore request failed (${response.status}).`);
  }
  return result;
}

// ---- Reference builders (pure, no network) ----
//
// Mirror the real SDK's ref.parent / ref.parent.parent chain (used e.g. to
// walk from an "interactions" doc back up to the owning user's id) instead of
// handing back flat path/id objects.

export function makeDocRef(path) {
  const segments = path.split("/");
  return {
    __type: "doc",
    path,
    id: segments[segments.length - 1],
    get parent() {
      return makeCollectionRef(segments.slice(0, -1).join("/"));
    },
  };
}

export function makeCollectionRef(path) {
  const segments = path.split("/");
  return {
    __type: "collection",
    path,
    id: segments[segments.length - 1],
    get parent() {
      return segments.length > 1 ? makeDocRef(segments.slice(0, -1).join("/")) : null;
    },
  };
}

export function collection(_db, path, ...segments) {
  return makeCollectionRef([path, ...segments].join("/"));
}

export function doc(refOrDb, ...rest) {
  if (refOrDb && refOrDb.__type === "collection") {
    if (rest.length === 0) return makeDocRef(`${refOrDb.path}/${generateAutoId()}`);
    return makeDocRef([refOrDb.path, ...rest].join("/"));
  }
  return makeDocRef(rest.join("/"));
}

export function collectionGroup(_db, id) {
  return { __type: "collectionGroup", id };
}

export function query(ref, ...constraints) {
  const merged = [...(ref.constraints || []), ...constraints];
  if (ref.__type === "collectionGroup" || ref.__type === "collectionGroupQuery") {
    return { __type: "collectionGroupQuery", id: ref.id, constraints: merged };
  }
  return { __type: "query", path: ref.path, constraints: merged };
}

export function where(field, op, value) {
  return { type: "where", field, op, value };
}

export function orderBy(field, dir = "asc") {
  return { type: "orderBy", field: field && field.__fieldPath ? field.__fieldPath : field, dir };
}

export function limit(n) {
  return { type: "limit", n };
}

export function startAfter(...values) {
  const resolved = values.map((v) => (v && v.__isDocSnapshot ? v.id : v));
  return { type: "startAfter", values: resolved };
}

export function documentId() {
  return { __fieldPath: "__name__" };
}

export function serverTimestamp() {
  return { __type: "serverTimestamp" };
}

export const Timestamp = {
  fromDate(date) {
    const ms = date.getTime();
    return { __type: "timestamp", seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
  },
  now() {
    return Timestamp.fromDate(new Date());
  },
};

// ---- Snapshot shaping ----

function reviveTimestamps(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (typeof value === "object") {
    if (value.__type === "timestamp") {
      const seconds = value.seconds;
      const nanoseconds = value.nanoseconds || 0;
      return {
        seconds,
        nanoseconds,
        toDate: () => new Date(seconds * 1000 + nanoseconds / 1e6),
        toMillis: () => seconds * 1000 + nanoseconds / 1e6,
      };
    }
    if (value.__type === "docref") {
      return makeDocRef(value.path);
    }
    const out = {};
    for (const key of Object.keys(value)) out[key] = reviveTimestamps(value[key]);
    return out;
  }
  return value;
}

function toDocSnapshot(rawDoc) {
  return {
    id: rawDoc.id,
    ref: makeDocRef(rawDoc.path),
    exists: () => true,
    data: () => reviveTimestamps(rawDoc.data),
    __isDocSnapshot: true,
  };
}

function buildQueryBody(ref) {
  if (ref.__type === "collectionGroup" || ref.__type === "collectionGroupQuery") {
    return { collectionGroup: ref.id, constraints: ref.constraints || [] };
  }
  return { path: ref.path, constraints: ref.constraints || [] };
}

// ---- Network operations ----

export async function getDocs(ref) {
  const result = await callApi({ action: "getDocs", ...buildQueryBody(ref) });
  const docs = result.docs.map(toDocSnapshot);
  return { docs, empty: result.empty, size: result.size, forEach: (fn) => docs.forEach(fn) };
}

export async function getDoc(ref) {
  const result = await callApi({ action: "getDoc", path: ref.path });
  const data = result.exists ? reviveTimestamps(result.data) : undefined;
  return { id: result.id, ref, exists: () => result.exists, data: () => data, __isDocSnapshot: true };
}

export async function addDoc(ref, data) {
  const result = await callApi({ action: "addDoc", path: ref.path, data });
  return makeDocRef(result.path);
}

export async function setDoc(ref, data, options) {
  await callApi({ action: "setDoc", path: ref.path, data, merge: !!options?.merge });
}

export async function updateDoc(ref, data) {
  await callApi({ action: "updateDoc", path: ref.path, data });
}

export async function deleteDoc(ref) {
  await callApi({ action: "deleteDoc", path: ref.path });
}

// ---- Batch writes ----

export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, options) {
      ops.push({ type: "set", path: ref.path, data, merge: !!options?.merge });
    },
    update(ref, data) {
      ops.push({ type: "update", path: ref.path, data });
    },
    delete(ref) {
      ops.push({ type: "delete", path: ref.path });
    },
    async commit() {
      await callApi({ action: "batchWrite", ops });
    },
  };
}

// ---- Real-time listeners, shimmed as polling ----
// A stateless API route can't push updates to the browser the way a direct
// Firestore subscription does, so this refetches on an interval instead.
// Fine for the "live-ish" dashboards this app uses it for; not true realtime.

const POLL_INTERVAL_MS = 10000;

export function onSnapshot(ref, onNext, onError) {
  let cancelled = false;
  let inFlight = false;

  const tick = async () => {
    // Skip while backgrounded — a hidden tab has no UI to update, so paying
    // for the network round trip (and the ~12k-doc "users"-scale payloads
    // some of these polls carry) is pure waste until the tab is visible again.
    if (typeof document !== "undefined" && document.hidden) return;
    if (inFlight) return;
    inFlight = true;
    try {
      const snap = await getDocs(ref);
      if (!cancelled) onNext(snap);
    } catch (error) {
      if (!cancelled && onError) onError(error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const interval = setInterval(tick, POLL_INTERVAL_MS);

  const onVisibilityChange = () => {
    if (!document.hidden) void tick();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    cancelled = true;
    clearInterval(interval);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
