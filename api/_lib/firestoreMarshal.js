import { Timestamp, FieldValue } from "firebase-admin/firestore";

const isTimestampLike = (value) =>
  value && typeof value === "object" && typeof value.toDate === "function" && typeof value.seconds === "number";

const isGeoPointLike = (value) =>
  value && typeof value === "object" && typeof value.latitude === "number" && typeof value.longitude === "number" && typeof value.isEqual === "function";

const isDocRefLike = (value) =>
  value && typeof value === "object" && typeof value.path === "string" && typeof value.id === "string" && value.firestore && typeof value.get === "function";

// Admin SDK reads -> JSON-safe values the browser can consume.
export function marshalForClient(value) {
  if (value === null || value === undefined) return value;
  if (isTimestampLike(value)) {
    return { __type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (isGeoPointLike(value)) {
    return { __type: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (isDocRefLike(value)) {
    return { __type: "docref", path: value.path };
  }
  if (Array.isArray(value)) return value.map(marshalForClient);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = marshalForClient(value[key]);
    return out;
  }
  return value;
}

// Browser-sent payloads -> Admin SDK sentinel values for writes.
export function unmarshalFromClient(value, db) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => unmarshalFromClient(item, db));
  if (typeof value === "object") {
    if (value.__type === "serverTimestamp") return FieldValue.serverTimestamp();
    if (value.__type === "delete") return FieldValue.delete();
    if (value.__type === "timestamp") return new Timestamp(value.seconds, value.nanoseconds || 0);
    if (value.__type === "docref") return db.doc(value.path);

    const out = {};
    for (const key of Object.keys(value)) out[key] = unmarshalFromClient(value[key], db);
    return out;
  }
  return value;
}
