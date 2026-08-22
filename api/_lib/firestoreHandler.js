import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";
import { marshalForClient, unmarshalFromClient } from "./firestoreMarshal.js";

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function resolveBaseRef(db, body) {
  if (body.collectionGroup) return db.collectionGroup(body.collectionGroup);
  if (!body.path) throw badRequest("Missing path.");
  return db.collection(body.path);
}

function applyConstraints(ref, constraints, db) {
  let query = ref;
  for (const c of constraints || []) {
    if (c.type === "where") {
      query = query.where(c.field, c.op, unmarshalFromClient(c.value, db));
    } else if (c.type === "orderBy") {
      const field = c.field === "__name__" ? FieldPath.documentId() : c.field;
      query = query.orderBy(field, c.dir === "desc" ? "desc" : "asc");
    } else if (c.type === "limit") {
      query = query.limit(c.n);
    } else if (c.type === "startAfter") {
      query = query.startAfter(...(c.values || []));
    } else {
      throw badRequest(`Unknown query constraint type: ${c.type}`);
    }
  }
  return query;
}

function serializeSnapshot(snap) {
  return {
    docs: snap.docs.map((d) => ({ id: d.id, path: d.ref.path, data: marshalForClient(d.data()) })),
    empty: snap.empty,
    size: snap.size,
  };
}

// ---- Short-lived in-memory cache for getDocs reads ----
//
// The browser lost its IndexedDB persistence when reads moved off the direct
// client SDK (see firestoreClient.js), so repeat page loads/tab switches used
// to be near-instant and now aren't. This doesn't bring that back exactly,
// but it means concurrent staff sessions and quick reloads share one
// Firestore read instead of each re-paying the ~12k-doc "users" pagination
// cost. Kept short so writes elsewhere don't feel stale for long.
const GET_DOCS_CACHE_TTL_MS = 20_000;
const getDocsCache = new Map();

function cacheKeyFor(body) {
  return JSON.stringify({
    collectionGroup: body.collectionGroup || null,
    path: body.path || null,
    constraints: body.constraints || [],
  });
}

function invalidateCacheForPath(path) {
  const segments = path.split("/");
  const topLevelCollection = segments[0];
  const immediateCollection = segments.length >= 2 ? segments[segments.length - 2] : null;

  for (const key of getDocsCache.keys()) {
    const parsed = JSON.parse(key);
    const matchesTopLevel = parsed.path && parsed.path.split("/")[0] === topLevelCollection;
    const matchesGroup = immediateCollection && parsed.collectionGroup === immediateCollection;
    if (matchesTopLevel || matchesGroup) getDocsCache.delete(key);
  }
}

export async function handleFirestoreRequest(body, env) {
  const db = getAdminDb(env);
  const action = body?.action;

  switch (action) {
    case "getDocs": {
      const cacheKey = cacheKeyFor(body);
      const cached = getDocsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < GET_DOCS_CACHE_TTL_MS) {
        return cached.result;
      }

      const ref = applyConstraints(resolveBaseRef(db, body), body.constraints, db);
      const result = serializeSnapshot(await ref.get());
      getDocsCache.set(cacheKey, { timestamp: Date.now(), result });
      return result;
    }
    case "getDoc": {
      if (!body.path) throw badRequest("Missing path.");
      const snap = await db.doc(body.path).get();
      return {
        exists: snap.exists,
        id: snap.id,
        path: snap.ref.path,
        data: snap.exists ? marshalForClient(snap.data()) : null,
      };
    }
    case "addDoc": {
      if (!body.path) throw badRequest("Missing path.");
      const ref = await db.collection(body.path).add(unmarshalFromClient(body.data || {}, db));
      invalidateCacheForPath(ref.path);
      return { id: ref.id, path: ref.path };
    }
    case "setDoc": {
      if (!body.path) throw badRequest("Missing path.");
      await db.doc(body.path).set(unmarshalFromClient(body.data || {}, db), body.merge ? { merge: true } : {});
      invalidateCacheForPath(body.path);
      return { ok: true };
    }
    case "updateDoc": {
      if (!body.path) throw badRequest("Missing path.");
      await db.doc(body.path).update(unmarshalFromClient(body.data || {}, db));
      invalidateCacheForPath(body.path);
      return { ok: true };
    }
    case "deleteDoc": {
      if (!body.path) throw badRequest("Missing path.");
      await db.doc(body.path).delete();
      invalidateCacheForPath(body.path);
      return { ok: true };
    }
    case "batchWrite": {
      const batch = db.batch();
      for (const op of body.ops || []) {
        if (!op.path) throw badRequest("Batch op missing path.");
        if (op.type === "set") batch.set(db.doc(op.path), unmarshalFromClient(op.data || {}, db), op.merge ? { merge: true } : {});
        else if (op.type === "update") batch.update(db.doc(op.path), unmarshalFromClient(op.data || {}, db));
        else if (op.type === "delete") batch.delete(db.doc(op.path));
        else throw badRequest(`Unknown batch op type: ${op.type}`);
      }
      await batch.commit();
      for (const op of body.ops || []) invalidateCacheForPath(op.path);
      return { ok: true, count: (body.ops || []).length };
    }
    case "newDocId": {
      if (!body.path) throw badRequest("Missing path.");
      const ref = db.collection(body.path).doc();
      return { id: ref.id, path: ref.path };
    }
    default:
      throw badRequest(`Unknown Firestore action: ${action}`);
  }
}
