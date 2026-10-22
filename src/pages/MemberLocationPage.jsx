import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Popup, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FaDirections, FaPhoneAlt, FaEnvelope, FaMapPin } from "react-icons/fa";
import { getMemberName, getMemberPhone, getMemberEmail, parseMemberLatLong, pickMemberText } from "../utils/memberFields";
import OdooSearchBar from "../components/OdooSearchBar";
import OdooViewToolbar from "../components/OdooViewToolbar";
import FavoritesMenu from "../components/FavoritesMenu";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import { collection, db, getDocs } from "../firestoreClient";
import useMemberFilters, { MEMBER_GROUP_BY_OPTIONS, getGroupLabels } from "../hooks/useMemberFilters";

const DEFAULT_CENTER = { lat: 22.9734, lng: 78.6569 };
const CLUSTER_GRID_BASE_PX = 84;
const STATE_CLUSTER_ZOOM = 7;
const MEMBER_CLUSTER_ZOOM = 10;

const getWorldPoint = ({ lat, lng }) => {
  const siny = Math.sin((lat * Math.PI) / 180);
  const x = (lng + 180) / 360;
  const y = 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI);
  return { x, y };
};

// Inverse of getWorldPoint - turns a normalized world pixel back into lat/lng.
const getLatLngFromWorldPixel = (pixelX, pixelY, scale) => {
  const worldX = pixelX / scale;
  const worldY = pixelY / scale;
  const lng = worldX * 360 - 180;
  const lat = (Math.asin(Math.tanh((0.5 - worldY) * 2 * Math.PI)) * 180) / Math.PI;
  return { lat, lng };
};

// Minimum on-screen distance (px) between cluster pin centers before they're combined.
// Keeps neighboring bubbles from visually overlapping regardless of zoom/grouping mode.
const MIN_CLUSTER_SEPARATION_PX = 70;

// Collapse clusters that would still render close enough to overlap on screen.
const mergeCloseClusters = (clusters, zoom) => {
  const scale = 256 * Math.pow(2, zoom);
  let list = clusters.map((cluster) => {
    const world = getWorldPoint(cluster.position);
    return { ...cluster, _x: world.x * scale, _y: world.y * scale };
  });

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;

    for (let i = 0; i < list.length && !mergedAny; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const dx = list[i]._x - list[j]._x;
        const dy = list[i]._y - list[j]._y;
        if (Math.sqrt(dx * dx + dy * dy) >= MIN_CLUSTER_SEPARATION_PX) continue;

        const a = list[i];
        const b = list[j];
        const totalCount = a.count + b.count;
        const sameGroup = a.mode === b.mode && a.label === b.label;

        const merged = {
          mode: sameGroup ? a.mode : undefined,
          label: sameGroup ? a.label : undefined,
          count: totalCount,
          members: [...a.members, ...b.members],
          _x: (a._x * a.count + b._x * b.count) / totalCount,
          _y: (a._y * a.count + b._y * b.count) / totalCount,
        };

        list = list.filter((_, index) => index !== i && index !== j);
        list.push(merged);
        mergedAny = true;
        break;
      }
    }
  }

  return list.map(({ _x, _y, ...cluster }) => ({
    ...cluster,
    position: getLatLngFromWorldPixel(_x, _y, scale),
  }));
};

const getClusterGridSize = (zoom) => {
  if (zoom >= 15) return 36;
  if (zoom >= 13) return 48;
  if (zoom >= 11) return 60;
  if (zoom >= 9) return 72;
  return CLUSTER_GRID_BASE_PX;
};

const getClusterIcon = (count) =>
  L.divIcon({
    className: "loc-cluster-icon",
    html: `<span style="font-size:${Math.max(12, Math.min(18, 12 + Math.log10(count + 1) * 2))}px">${count.toLocaleString()}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

const memberIcon = L.divIcon({
  className: "loc-member-icon",
  html: "<span></span>",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Group nearby pins into grid-based clusters so the map stays readable at lower zoom.
const buildClusters = (members, zoom) => {
  const scale = 256 * Math.pow(2, zoom);
  const gridSize = getClusterGridSize(zoom);
  const buckets = new Map();

  members.forEach((member) => {
    const point = member.location_point;
    if (!point) return;

    const world = getWorldPoint(point);
    const pixelX = world.x * scale;
    const pixelY = world.y * scale;
    const key = `${Math.floor(pixelX / gridSize)}:${Math.floor(pixelY / gridSize)}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        latSum: 0,
        lngSum: 0,
        count: 0,
        members: [],
      });
    }

    const bucket = buckets.get(key);
    bucket.latSum += point.lat;
    bucket.lngSum += point.lng;
    bucket.count += 1;
    bucket.members.push(member);
  });

  return Array.from(buckets.values()).map((bucket) => ({
    count: bucket.count,
    members: bucket.members,
    position: {
      lat: bucket.latSum / bucket.count,
      lng: bucket.lngSum / bucket.count,
    },
  }));
};

const normalizeStateLabel = (value) => String(value || "").trim().replace(/\s+/g, " ");

// State clusters are used when the map is zoomed out to a regional view.
const buildStateClusters = (members) => {
  const buckets = new Map();

  members.forEach((member) => {
    const state = normalizeStateLabel(member.state) || "Unknown state";
    if (!buckets.has(state)) {
      buckets.set(state, {
        state,
        latSum: 0,
        lngSum: 0,
        count: 0,
        members: [],
      });
    }

    const bucket = buckets.get(state);
    bucket.latSum += member.location_point.lat;
    bucket.lngSum += member.location_point.lng;
    bucket.count += 1;
    bucket.members.push(member);
  });

  return Array.from(buckets.values()).map((bucket) => ({
    mode: "state",
    label: bucket.state,
    count: bucket.count,
    members: bucket.members,
    position: {
      lat: bucket.latSum / bucket.count,
      lng: bucket.lngSum / bucket.count,
    },
  }));
};

// Expand into individual member markers once the user zooms in far enough.
const buildMemberMarkers = (members) =>
  Array.from(
    members.reduce((groups, member) => {
      const point = member.location_point;
      if (!point) return groups;

      const key = `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          count: 0,
          members: [],
          position: point,
        });
      }

      const group = groups.get(key);
      group.count += 1;
      group.members.push(member);
      return groups;
    }, new Map()).values()
  ).map((bucket) => ({
    mode: "member",
    count: bucket.count,
    members: bucket.members,
    position: bucket.position,
  }));

const normalizeCityLabel = (value) =>
  String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

const isUsableLocationPoint = (point) =>
  Boolean(point) && !(Number(point.lat) === 0 && Number(point.lng) === 0);

// Training-establishment collections drawn on the map alongside members.
// Each has its own marker colour; records carry city / state / lat / lng.
const CENTRE_LAYERS = [
  { key: "regimental", label: "Regimental Centres", collection: "regimentalcentermaster", nameField: "center", color: "#2f4a22" },
  { key: "corps", label: "Corps Centres / Institutions", collection: "corpscentermaster", nameField: "name", color: "#c2410c" },
  { key: "school", label: "Schools of Instruction", collection: "schoolinstructionmaster", nameField: "name", color: "#7c3aed" },
  { key: "academy", label: "Academies", collection: "academymaster", nameField: "name", color: "#0d9488" },
];
const CENTRE_LAYER_BY_KEY = Object.fromEntries(CENTRE_LAYERS.map((l) => [l.key, l]));
const MIXED_CENTRE_COLOR = "#334155";

const centreIcon = (color, count) =>
  L.divIcon({
    className: "loc-centre-icon",
    html: `<span style="background:${color}"><b>${count > 1 ? count : ""}</b></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

// One marker per location; centres sharing a city stack into one marker
// whose popup lists them all.
const CentreMarkers = ({ groups }) =>
  groups.map((group) => {
    const layers = new Set(group.items.map((c) => c.layer));
    const color = layers.size === 1 ? CENTRE_LAYER_BY_KEY[group.items[0].layer].color : MIXED_CENTRE_COLOR;
    const first = group.items[0];
    return (
      <Marker key={group.key} position={[group.lat, group.lng]} icon={centreIcon(color, group.items.length)} zIndexOffset={1000}>
        <Tooltip direction="top" offset={[0, -12]}>
          {group.items.length === 1 ? first.name : `${group.items.length} centres · ${first.city}`}
        </Tooltip>
        <Popup maxWidth={320}>
          <div className="loc-centre-popup">
            <div className="loc-centre-popup-place">{[first.city, first.state].filter(Boolean).join(", ")}</div>
            {group.items.map((c) => (
              <div key={c.id} className="loc-centre-popup-item">
                <span className="loc-centre-swatch" style={{ background: CENTRE_LAYER_BY_KEY[c.layer].color }} aria-hidden="true" />
                <div>
                  <strong>{c.name}</strong>
                  <span>{CENTRE_LAYER_BY_KEY[c.layer].label}{c.tagged ? ` · ${c.tagged} tagged member${c.tagged === 1 ? "" : "s"}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </Popup>
      </Marker>
    );
  });

const MapClusters = ({ members, focusBounds, recenterKey, onSelectCluster, onSelectMember, onClear }) => {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  const fittedRef = useRef(false);

  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    click: onClear,
  });

  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);

  const fitAll = () => {
    if (!members.length) return;
    map.fitBounds(L.latLngBounds(members.map((m) => [m.location_point.lat, m.location_point.lng])), { padding: [48, 48] });
  };

  useEffect(() => {
    fittedRef.current = false;
  }, [members]);
  useEffect(() => {
    if (fittedRef.current || !members.length) return;
    fittedRef.current = true;
    fitAll();
  }, [members]);
  useEffect(() => {
    if (recenterKey) fitAll();
  }, [recenterKey]);
  useEffect(() => {
    if (focusBounds?.points?.length) map.fitBounds(L.latLngBounds(focusBounds.points), { padding: [48, 48] });
  }, [focusBounds]);

  const clusters = useMemo(() => {
    const zoom = Math.max(view.zoom, 3);
    // Zoomed in, only a small region is visible: skip off-screen members.
    const inView = zoom >= STATE_CLUSTER_ZOOM
      ? members.filter((m) => view.bounds.contains([m.location_point.lat, m.location_point.lng]))
      : members;
    const raw = zoom < STATE_CLUSTER_ZOOM
      ? buildStateClusters(members)
      : zoom < MEMBER_CLUSTER_ZOOM
        ? buildClusters(inView, zoom)
        : buildMemberMarkers(inView);
    return zoom < MEMBER_CLUSTER_ZOOM ? mergeCloseClusters(raw, zoom) : raw;
  }, [members, view]);

  return clusters.map((cluster) => {
    const isSingle = cluster.count === 1 && cluster.mode === "member";
    const member = cluster.members[0];
    return (
      <Marker
        key={`${cluster.position.lat.toFixed(5)}:${cluster.position.lng.toFixed(5)}:${cluster.count}`}
        position={[cluster.position.lat, cluster.position.lng]}
        icon={isSingle ? memberIcon : getClusterIcon(cluster.count)}
        zIndexOffset={isSingle ? 0 : cluster.count}
        eventHandlers={{
          click: (e) => {
            L.DomEvent.stopPropagation(e);
            if (!isSingle) {
              onSelectCluster(cluster);
              const zoom = map.getZoom();
              map.flyTo([cluster.position.lat, cluster.position.lng], cluster.mode === "state" ? Math.min(zoom + 2, MEMBER_CLUSTER_ZOOM) : Math.min(zoom + 1, 16));
            } else {
              onSelectMember(member);
            }
          },
        }}
      >
        <Tooltip direction="top" offset={[0, -36]}>
          {cluster.mode === "state" ? `${cluster.label}: ${cluster.count} members` : isSingle ? member.name : `${cluster.count} members`}
        </Tooltip>
      </Marker>
    );
  });
};

export default function MemberLocationPage({ memberRecords = [], membersLoading = false }) {
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [focusBounds, setFocusBounds] = useState(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const bodyRef = useRef(null);

  // Centres from the four training-establishment collections, and which map
  // layers are switched on ("members" plus each CENTRE_LAYERS key).
  const [centres, setCentres] = useState([]);
  const [hiddenLayers, setHiddenLayers] = useState(() => new Set());
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CENTRE_LAYERS.map((layer) =>
        getDocs(collection(db, layer.collection))
          .then((snap) =>
            snap.docs.map((d) => {
              const row = d.data() || {};
              return {
                id: `${layer.key}/${d.id}`,
                layer: layer.key,
                name: String(row[layer.nameField] || "Unnamed"),
                city: row.city || row.location || "",
                state: row.state || "",
                lat: Number(row.lat),
                lng: Number(row.lng),
                tagged: (row.taggedMemberIds || []).length,
              };
            })
          )
          .catch((err) => {
            console.error(`Error loading ${layer.collection}:`, err);
            return [];
          })
      )
    ).then((lists) => {
      if (!cancelled) setCentres(lists.flat().filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)));
    });
    return () => { cancelled = true; };
  }, []);
  const toggleLayer = (key) =>
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const centreCounts = useMemo(() => {
    const counts = {};
    centres.forEach((c) => { counts[c.layer] = (counts[c.layer] || 0) + 1; });
    return counts;
  }, [centres]);
  const centreGroups = useMemo(() => {
    const groups = new Map();
    centres.forEach((c) => {
      if (hiddenLayers.has(c.layer)) return;
      const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, { key, lat: c.lat, lng: c.lng, items: [] });
      groups.get(key).items.push(c);
    });
    return [...groups.values()];
  }, [centres, hiddenLayers]);

  // Same search / Filters / Group By / Favorites state as the Members list page
  // (shared hook), applied to the same already-normalized records from App.jsx's
  // Layout — no second fetch of the ~15k-doc "users" collection.
  const {
    searchTerm,
    setSearchTerm,
    groupBy,
    setGroupBy,
    filterOptions,
    filteredMembers,
    quickFilters,
    filterChips,
    advancedFiltersPanel,
    favorites,
    applyFavorite,
    deleteFavorite,
    saveCurrentAsFavorite,
    clearFilters,
  } = useMemberFilters(Array.isArray(memberRecords) ? memberRecords : []);

  // Filtered members that actually have a usable map position.
  const mapMembers = useMemo(() => {
    const result = [];
    for (const raw of filteredMembers) {
      const location_point = raw.location_point || parseMemberLatLong(raw);
      if (!isUsableLocationPoint(location_point)) continue;
      result.push({
        id: raw.id,
        name: raw.__name || getMemberName(raw),
        phone: raw.phone_number || getMemberPhone(raw),
        email: raw.email || getMemberEmail(raw),
        city: raw.city || pickMemberText(raw, ["city", "City"]),
        state: raw.state || pickMemberText(raw, ["state", "State"]),
        category: raw.category || pickMemberText(raw, ["category", "Category", "organization", "Organization"]),
        location_point,
        source: raw,
      });
    }
    return result;
  }, [filteredMembers]);



  // Totals over every member matching the filters, including the few with no
  // map coordinates (they are counted but cannot be drawn as pins).
  const totalCityCount = useMemo(() => {
    const keys = new Set();
    filteredMembers.forEach((member) => {
      const key = normalizeCityLabel(member.city || pickMemberText(member, ["city", "City"]));
      if (key) keys.add(key);
    });
    return keys.size;
  }, [filteredMembers]);

  // Group By: one row per group with its member count; clicking a row zooms the
  // map to that group's members and lists them in the details card.
  const groupedMapMembers = useMemo(() => {
    if (!groupBy) return null;
    const experienceBuckets = filterOptions.Experience || [];
    const groups = new Map();
    for (const member of mapMembers) {
      for (const label of getGroupLabels(member.source, groupBy, experienceBuckets)) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(member);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, mapMembers, filterOptions]);

  const focusGroup = (label, groupMembers) => {
    setSelectedMember(null);
    setSelectedCluster({ mode: "group", label, count: groupMembers.length, members: groupMembers });
    setFocusBounds({ points: groupMembers.map((m) => [m.location_point.lat, m.location_point.lng]) });
  };

  const toggleFullscreen = () => {
    const node = bodyRef.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else node.requestFullscreen?.();
  };


  useEffect(() => {
    setSelectedCluster(null);
    setSelectedMember(null);
  }, [filteredMembers, groupBy]);

  return (
    <div
      style={{
        padding: 0,
        width: "100%",
        maxWidth: "none",
        margin: 0,
        flex: 1,
        minWidth: 0,
        minHeight: "calc(100vh - 64px)",
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .location-page {
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
          min-height: 0;
          width: 100%;
        }
        .location-header {
          background: #fff;
          padding: 32px 32px 16px;
          width: 100%;
          box-sizing: border-box;
        }
        .location-title-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .location-title {
          display: flex;
          align-items: baseline;
          gap: 12px;
        }
        .location-title h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.01em;
        }
        .location-title span {
          font-size: 14px;
          color: #64748b;
        }
        .location-outline-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          padding: 0 11px;
          background: #fff;
          border: 1px solid #dde1e7;
          border-radius: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 400;
          cursor: pointer;
          white-space: nowrap;
        }
        .location-controls-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        .member-toolbar-group {
          border: 1px solid #dde1e7;
          border-left: none;
          border-radius: 6px;
          background: #fff;
          display: flex;
          align-items: stretch;
          margin-left: auto;
        }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button {
          border: none !important;
          border-left: 1px solid #dde1e7 !important;
          border-radius: 0 !important;
          height: 32px !important;
        }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .member-date-range-wrapper { width: 100%; }
        .member-date-range-input {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #fff;
          font-size: 12px;
          color: #111827;
          outline: none;
          font-family: inherit;
        }
        .member-date-range-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        #member-date-range-portal { position: relative; z-index: 10200; }
        .member-date-range-popper { z-index: 10200; }
        .group-panel {
          position: absolute;
          left: 16px;
          top: 16px;
          z-index: 5;
          width: 260px;
          max-height: calc(100% - 32px);
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #dde1e7;
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
          overflow: hidden;
        }
        .group-panel-title {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          color: #111827;
          border-bottom: 1px solid #dde1e7;
          background: #f6f5f1;
        }
        .group-panel-list { overflow-y: auto; }
        .group-panel-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          padding: 9px 14px;
          border: none;
          border-bottom: 1px solid #eef1f4;
          background: #fff;
          font: inherit;
          font-size: 13px;
          color: #334155;
          text-align: left;
          cursor: pointer;
        }
        .group-panel-item:hover { background: #e3f2fd; color: #1565c0; }
        .group-panel-item span:last-child { font-size: 12px; color: #64748b; flex-shrink: 0; }
        .location-meta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 34px;
        }
        .location-status { font-size: 12px; color: #64748b; }
        .location-count { font-size: 13px; font-weight: 600; color: #111827; }
        .location-body {
          flex: 1;
          min-height: 520px;
          background: #fff;
          border-top: 1px solid #dde1e7;
          overflow: hidden;
          position: relative;
          width: 100%;
          align-self: stretch;
        }
        .layer-panel {
          position: absolute;
          left: 16px;
          bottom: 24px;
          z-index: 1000;
          margin: 0;
          padding: 10px 14px 12px;
          min-width: 0;
          border: 1px solid #dde1e7;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
          font-size: 12px;
          color: #334155;
        }
        .layer-panel legend { padding: 0; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #111827; float: left; width: 100%; }
        .layer-panel label { clear: both; display: flex; align-items: center; gap: 7px; height: 24px; cursor: pointer; white-space: nowrap; }
        .layer-panel input { margin: 0; accent-color: #1976d2; cursor: pointer; }
        .layer-count { margin-left: auto; padding-left: 10px; color: #64748b; font-variant-numeric: tabular-nums; }
        .layer-swatch { width: 10px; height: 10px; flex-shrink: 0; }
        .layer-swatch.members { border-radius: 50%; background: #1976d2; }
        .layer-swatch.centre { transform: rotate(45deg); border-radius: 2px; }
        .loc-centre-icon span {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          margin: 3px;
          transform: rotate(45deg);
          border: 2px solid #fff;
          border-radius: 3px;
          box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
          box-sizing: border-box;
        }
        .loc-centre-icon b { transform: rotate(-45deg); color: #fff; font-size: 10px; font-weight: 700; line-height: 1; }
        .loc-centre-popup { font-family: inherit; min-width: 200px; }
        .loc-centre-popup-place { margin-bottom: 8px; font-size: 12px; font-weight: 600; color: #64748b; }
        .loc-centre-popup-item { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; }
        .loc-centre-popup-item + .loc-centre-popup-item { border-top: 1px solid #eef1f4; }
        .loc-centre-popup-item strong { display: block; font-size: 13px; color: #111827; }
        .loc-centre-popup-item span { font-size: 12px; color: #64748b; }
        .loc-centre-swatch { width: 9px; height: 9px; margin-top: 4px; flex-shrink: 0; transform: rotate(45deg); border-radius: 2px; }
        .map-ctl {
          position: absolute;
          z-index: 1000;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: 0;
          border-radius: 4px;
          background: #fff;
          color: #3c4047;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          padding: 0;
        }
        .map-ctl:hover { background: #f6f8fa; }
        .loc-cluster-icon span {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #1976d2;
          color: #fff;
          font-weight: 700;
          border: 3px solid rgba(255, 255, 255, 0.9);
          box-shadow: 0 2px 8px rgba(25, 118, 210, 0.45);
        }
        .loc-member-icon span {
          display: block;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #1976d2;
          border: 3px solid #fff;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
        }
        .location-body .leaflet-container { font-family: inherit; }
        .map-canvas {
          width: 100%;
          height: 100%;
          min-height: 520px;
          background: #f1f5f9;
        }
        .loading-card,
        .error-card {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          color: #475569;
          z-index: 6;
          background: rgba(248, 250, 252, 0.9);
          backdrop-filter: blur(4px);
        }
        .loading-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .map-legend {
          position: absolute;
          left: 16px;
          top: 16px;
          z-index: 5;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 300px;
          pointer-events: none;
        }
        .legend-card {
          pointer-events: auto;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 16px;
          padding: 12px 14px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
        }
        .legend-title {
          margin: 0 0 6px 0;
          color: #0f172a;
          font-size: 13px;
          font-weight: 800;
        }
        .legend-text {
          margin: 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
        }
        .legend-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          color: #334155;
          font-size: 12px;
          font-weight: 600;
        }
        .legend-dot {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          flex: 0 0 auto;
        }
        .legend-dot.single {
          background: linear-gradient(180deg, #38bdf8 0%, #2563eb 100%);
        }
        .legend-dot.cluster {
          background: linear-gradient(180deg, #60a5fa 0%, #1d4ed8 100%);
        }
        .member-contact-card {
          position: absolute;
          right: 16px;
          bottom: 16px;
          z-index: 6;
          width: min(360px, calc(100% - 32px));
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 20px;
          box-shadow: 0 20px 46px rgba(15, 23, 42, 0.14);
          overflow: hidden;
        }
        .member-contact-card__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 16px 12px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.95);
        }
        .member-contact-card__title {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .member-avatar {
          width: 44px;
          height: 44px;
          border-radius: 999px;
          background: linear-gradient(135deg, #2563eb 0%, #38bdf8 100%);
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          flex: 0 0 auto;
          box-shadow: 0 10px 18px rgba(37, 99, 235, 0.22);
        }
        .member-name-block {
          min-width: 0;
        }
        .member-name-block h3 {
          margin: 0;
          font-size: 16px;
          color: #0f172a;
          line-height: 1.25;
        }
        .member-name-block p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .member-contact-close {
          border: 1px solid rgba(37, 99, 235, 0.16);
          background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
          color: #1d4ed8;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.14);
        }
        .member-contact-card__body {
          padding: 14px 16px 16px;
          display: grid;
          gap: 10px;
        }
        .member-contact-row {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #334155;
          font-size: 13px;
          line-height: 1.4;
        }
        .member-contact-row svg {
          color: #2563eb;
          flex: 0 0 auto;
        }
        .member-contact-actions {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }
        .member-contact-actions a {
          flex: 1;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 700;
        }
        .member-contact-actions .primary {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #fff;
          box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
        }
        .member-contact-actions .secondary {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .cluster-details-card {
          position: absolute;
          left: 16px;
          right: 16px;
          bottom: 16px;
          z-index: 6;
          max-width: 520px;
          margin-left: auto;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 20px;
          box-shadow: 0 20px 46px rgba(15, 23, 42, 0.14);
          overflow: hidden;
        }
        .cluster-details-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.95);
        }
        .cluster-details-header h3 {
          margin: 0;
          font-size: 16px;
          color: #0f172a;
        }
        .cluster-details-header p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #64748b;
        }
        .cluster-details-close {
          border: none;
          background: #eff6ff;
          color: #1d4ed8;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }
        .cluster-details-list {
          max-height: 280px;
          overflow: auto;
          padding: 10px 8px 14px 8px;
        }
        .cluster-member-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 12px;
          align-items: start;
          padding: 10px 10px;
          border-radius: 14px;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          cursor: pointer;
          font: inherit;
        }
        .cluster-member-item + .cluster-member-item {
          margin-top: 4px;
        }
        .cluster-member-item:hover {
          background: #f8fafc;
        }
        .empty-results-card {
          position: absolute;
          inset: 16px;
          z-index: 6;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          pointer-events: none;
        }
        .empty-results-card > div {
          pointer-events: auto;
          width: min(100%, 420px);
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 18px;
          box-shadow: 0 20px 46px rgba(15, 23, 42, 0.14);
          padding: 20px 18px;
        }
        .empty-results-card h3 {
          margin: 0 0 8px;
          color: #0f172a;
          font-size: 16px;
        }
        .empty-results-card p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.55;
        }
        .cluster-member-item strong {
          display: block;
          font-size: 13px;
          color: #0f172a;
          margin-bottom: 2px;
        }
        .cluster-member-item span {
          font-size: 12px;
          color: #64748b;
        }
        .cluster-member-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(180deg, #38bdf8 0%, #2563eb 100%);
          margin-top: 5px;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
        }
      `}</style>

      <div className="location-page">
        <div className="location-header page-header-band">
          {/* Row 1: title + count, Reset Filters */}
          <div className="location-title-row">
            <div className="location-title">
              <h1>Members Location</h1>
              {/* Every member matching the filters, including those with no map location. */}
              <span>{filteredMembers.length.toLocaleString()} Members</span>
            </div>
            <button type="button" className="location-outline-btn" onClick={clearFilters}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Reset Filters
            </button>
          </div>

          {/* Row 2: search, Filters / Group By / Favorites (same as the Members list) */}
          <div className="location-controls-row">
            <OdooSearchBar
              variant="boxed"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, mobile, email..."
              chips={filterChips}
            />

            <div className="member-toolbar-group">
              <OdooViewToolbar
                variant="boxed"
                quickFilters={quickFilters}
                advancedContent={advancedFiltersPanel}
                groupByOptions={MEMBER_GROUP_BY_OPTIONS}
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
                showViewToggle={false}
              />
              <FavoritesMenu
                favorites={favorites}
                onApply={applyFavorite}
                onDelete={deleteFavorite}
                onSave={saveCurrentAsFavorite}
              />
            </div>
          </div>

          {/* Row 3: grouping state, counts */}
          <div className="location-meta-row">
            <span className="location-status">
              {groupBy
                ? `Grouped by ${MEMBER_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy}`
                : ""}
            </span>
            <span className="location-count">
              {totalCityCount.toLocaleString()} cities · {filteredMembers.length.toLocaleString()} members
            </span>
          </div>
        </div>

        <div className="location-body" ref={bodyRef}>
          <MapContainer
            center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
            zoom={5}
            minZoom={3}
            zoomControl={false}
            className="map-canvas"
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ZoomControl position="topright" />
            <CentreMarkers groups={centreGroups} />
            <MapClusters
              members={hiddenLayers.has("members") ? [] : mapMembers}
              focusBounds={focusBounds}
              recenterKey={recenterKey}
              onSelectCluster={(c) => { setSelectedCluster(c); setSelectedMember(null); }}
              onSelectMember={(m) => { setSelectedCluster(null); setSelectedMember(m); }}
              onClear={() => { setSelectedCluster(null); setSelectedMember(null); }}
            />
          </MapContainer>
          <fieldset className="layer-panel">
            <legend>Show on map</legend>
            <label>
              <input type="checkbox" checked={!hiddenLayers.has("members")} onChange={() => toggleLayer("members")} />
              <span className="layer-swatch members" aria-hidden="true" />
              Members <span className="layer-count">{mapMembers.length.toLocaleString()}</span>
            </label>
            {CENTRE_LAYERS.map((layer) => (
              <label key={layer.key}>
                <input type="checkbox" checked={!hiddenLayers.has(layer.key)} onChange={() => toggleLayer(layer.key)} />
                <span className="layer-swatch centre" style={{ background: layer.color }} aria-hidden="true" />
                {layer.label} <span className="layer-count">{(centreCounts[layer.key] || 0).toLocaleString()}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="map-ctl" aria-label="Full screen" onClick={toggleFullscreen} style={{ top: 12, right: 56 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
          <button type="button" className="map-ctl" aria-label="Recenter map" onClick={() => setRecenterKey((k) => k + 1)} style={{ bottom: 16, right: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l3 3h-6zM12 21l-3-3h6zM3 12l3-3v6zM21 12l-3 3V9z" /></svg>
          </button>

          {groupedMapMembers && (
            <div className="group-panel">
              <div className="group-panel-title">
                {MEMBER_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy} · {groupedMapMembers.length.toLocaleString()} groups
              </div>
              <div className="group-panel-list">
                {groupedMapMembers.map(([label, groupMembers]) => (
                  <button key={label} type="button" className="group-panel-item" onClick={() => focusGroup(label, groupMembers)}>
                    <span>{label}</span>
                    <span>{groupMembers.length.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* <div className="map-legend">
            <div className="legend-card">
              <div className="legend-title">How to read the map</div>
              <p className="legend-text">
                At low zoom, the map groups members by state. Zoom in to see smaller clusters and then individual member pins.
              </p>
              <div className="legend-row">
                <span className="legend-dot single" />
                Single member
              </div>
              <div className="legend-row">
                <span className="legend-dot cluster" />
                Clustered members
              </div>
            </div>
          </div> */}

          {selectedMember && (
            <div className="member-contact-card">
              <div className="member-contact-card__header">
                <div className="member-contact-card__title">
                  <div className="member-avatar">
                    {getMemberName(selectedMember).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="member-name-block">
                    <h3>{getMemberName(selectedMember)}</h3>
                    <p>{selectedMember.category || "Member"}</p>
                  </div>
                </div>
                <button type="button" className="member-contact-close" onClick={() => setSelectedMember(null)} aria-label="Close member card">
                  ×
                </button>
              </div>
              <div className="member-contact-card__body">
                <div className="member-contact-row">
                  <FaMapPin />
                  <span>
                    {selectedMember.city || "-"}
                    {selectedMember.state ? `, ${selectedMember.state}` : ""}
                  </span>
                </div>
                {selectedMember.phone ? (
                  <div className="member-contact-row">
                    <FaPhoneAlt />
                    <span>{selectedMember.phone}</span>
                  </div>
                ) : null}
                {selectedMember.email ? (
                  <div className="member-contact-row">
                    <FaEnvelope />
                    <span>{selectedMember.email}</span>
                  </div>
                ) : null}
                <div className="member-contact-actions">
                  <a
                    className="secondary"
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedMember.location_point.lat},${selectedMember.location_point.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FaDirections />
                    Open in Maps
                  </a>
                </div>
              </div>
            </div>
          )}

          {selectedCluster && !selectedMember && (
            <div className="cluster-details-card">
              <div className="cluster-details-header">
                <div>
                  <h3>
                    {(selectedCluster.mode === "state" || selectedCluster.mode === "group") && selectedCluster.label
                      ? `${selectedCluster.label} - `
                      : ""}
                    {selectedCluster.count.toLocaleString()} members
                  </h3>
                  <p>Click a member row to inspect or use the search box to narrow the map.</p>
                </div>
                <button
                  type="button"
                  className="cluster-details-close"
                  onClick={() => setSelectedCluster(null)}
                  aria-label="Close cluster list"
                >
                  ×
                </button>
              </div>
              <div className="cluster-details-list">
                {selectedCluster.members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="cluster-member-item"
                    onClick={() => {
                      setSelectedMember(member);
                      setSelectedCluster(null);
                    }}
                  >
                    <div className="cluster-member-dot" />
                    <div>
                      <strong>{member.name}</strong>
                      <span>
                        {member.city || "-"}
                        {member.state ? `, ${member.state}` : ""}
                        {member.category ? ` • ${member.category}` : ""}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {membersLoading && memberRecords.length === 0 && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1000, display: "flex" }}>
              <TableLoadingSpinner label="Loading members…" />
            </div>
          )}

          {!(membersLoading && memberRecords.length === 0) && mapMembers.length === 0 && (
            <div className="empty-results-card">
              <div>
                <h3>No locations found</h3>
                <p>
                  No members match the current search and filters, or none of them have a map location. Adjust the filters to see pins.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

