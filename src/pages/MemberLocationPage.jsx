import { useEffect, useMemo, useRef, useState } from "react";
import { collection, documentId, getDocs, limit, orderBy, query, startAfter } from "firebase/firestore";
import { FaMapMarkedAlt, FaSpinner, FaDirections, FaTimes, FaPhoneAlt, FaEnvelope, FaMapPin } from "react-icons/fa";
import { db } from "../firebase";
import { getMemberName, getMemberPhone, getMemberEmail, parseMemberLatLong, pickMemberText } from "../utils/memberFields";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js";
const DEFAULT_CENTER = { lat: 22.9734, lng: 78.6569 };
const CLUSTER_GRID_BASE_PX = 84;
const STATE_CLUSTER_ZOOM = 7;
const MEMBER_CLUSTER_ZOOM = 10;

const createSvgDataUrl = (svg) =>
  "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());

// Load Google Maps once and reuse the same script instance across renders.
const loadGoogleMaps = (apiKey) =>
  new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (typeof previousAuthFailure === "function") {
        previousAuthFailure();
      }
      reject(new Error("Google Maps authorization failed"));
    };

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      const onLoad = () => resolve(window.google.maps);
      const onError = () => reject(new Error("Failed to load Google Maps"));
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

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

const getClusterIcon = (count) => {
  const width = 54;
  const height = 72;
  const centerX = width / 2;
  return {
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="clusterGlow" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="1" />
            <stop offset="100%" stop-color="#2563eb" stop-opacity="1" />
          </linearGradient>
          <filter id="clusterShadow" x="-20%" y="-20%" width="160%" height="160%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#1e3a8a" flood-opacity="0.22" />
          </filter>
        </defs>
        <path
          d="M ${centerX} 3
             C 39 3, 51 15, 51 29
             C 51 45, 37 56, ${centerX} 69
             C 17 56, 3 45, 3 29
             C 3 15, 15 3, ${centerX} 3 Z"
          fill="url(#clusterGlow)"
          stroke="#1d4ed8"
          stroke-width="1.5"
          filter="url(#clusterShadow)"
        />
        <circle cx="${centerX}" cy="27" r="14" fill="rgba(255,255,255,0.15)" />
        <text
          x="${centerX}"
          y="32"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-size="${Math.max(12, Math.min(20, 13 + Math.log10(count + 1) * 2))}"
          font-weight="700"
          fill="#ffffff"
        >${count}</text>
      </svg>
    `),
    scaledSize: new window.google.maps.Size(width, height),
    anchor: new window.google.maps.Point(centerX, height - 2),
  };
};

const getMemberIcon = () => ({
  url: createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="50" viewBox="0 0 36 50">
      <defs>
        <linearGradient id="pinFill" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
        <filter id="pinShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.18" />
        </filter>
      </defs>
      <path d="M18 2C10.27 2 4 8.27 4 16c0 10.25 14 32 14 32s14-21.75 14-32C32 8.27 25.73 2 18 2z" fill="url(#pinFill)" stroke="#1d4ed8" stroke-width="1.6" filter="url(#pinShadow)"/>
      <circle cx="18" cy="16" r="6.5" fill="#ffffff" opacity="0.95"/>
      <circle cx="18" cy="16" r="3" fill="#1d4ed8"/>
    </svg>
  `),
  scaledSize: new window.google.maps.Size(36, 50),
  anchor: new window.google.maps.Point(18, 50),
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

// Use the most specific available address component when reverse-geocoding a city.
const extractGeocodedCity = (result) => {
  const components = result?.address_components || [];
  const preferredTypes = ["locality", "sublocality", "administrative_area_level_2", "administrative_area_level_1"];

  for (const type of preferredTypes) {
    const match = components.find((component) => component.types?.includes(type) && component.long_name);
    if (match?.long_name) return match.long_name;
  }

  return "";
};

export default function MemberLocationPage() {
  const [members, setMembers] = useState([]);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [locationSearchTerm, setLocationSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("All Cities");
  const [searchStatus, setSearchStatus] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const geocoderRef = useRef(null);
  const markersRef = useRef([]);
  const fitOnceRef = useRef(false);
  const renderFrameRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const rows = [];
        let totalCount = 0;
        let lastDoc = null;
        const pageSize = 500;

        while (!cancelled) {
          const baseQuery = query(collection(db, "users"), orderBy(documentId()), limit(pageSize));
          const pageQuery = lastDoc ? query(collection(db, "users"), orderBy(documentId()), startAfter(lastDoc), limit(pageSize)) : baseQuery;
          const snapshot = await getDocs(pageQuery);
          if (cancelled) return;
          totalCount += snapshot.docs.length;

          const chunk = snapshot.docs
            .map((doc) => {
              const raw = doc.data();
              const location_point = parseMemberLatLong(raw);
              if (!location_point) return null;

              return {
                id: doc.id,
                name: getMemberName(raw),
                phone: getMemberPhone(raw),
                email: getMemberEmail(raw),
                city: pickMemberText(raw, ["city", "City"]),
                state: pickMemberText(raw, ["state", "State"]),
                organization: pickMemberText(raw, ["organization", "Organization", "category", "Category"]),
                location_point,
              };
            })
            .filter(Boolean);

          rows.push(...chunk);
          setMembers([...rows]);

          if (snapshot.docs.length < pageSize) break;
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        if (!cancelled) {
          setTotalUsersCount(totalCount);
        }
      } catch (error) {
        console.error("Error loading members for map:", error);
        if (!cancelled) setMapError("Unable to load member data.");
      }
    };

    const initMap = async () => {
      if (!GOOGLE_MAPS_API_KEY) {
        setMapError("Missing Google Maps API key. Set VITE_GOOGLE_MAPS_API_KEY in your deployment environment and redeploy.");
        setMapLoading(false);
        return;
      }

      try {
        await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
        if (cancelled || !mapNodeRef.current) return;

        mapRef.current = new window.google.maps.Map(mapNodeRef.current, {
          center: DEFAULT_CENTER,
          zoom: 5,
          minZoom: 3,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#f8fafc" }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "poi.business", stylers: [{ visibility: "off" }] },
            { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d6e2ef" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d8e1eb" }] },
            { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#dceeff" }] },
          ],
        });
        geocoderRef.current = new window.google.maps.Geocoder();
        setMapLoading(false);
        setMapReady(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMapError(error?.message === "Google Maps authorization failed"
            ? "Google Maps API authorization failed. Check the key restrictions and billing settings."
            : "Google Maps failed to load.");
          setMapLoading(false);
        }
      }
    };

    loadData();
    initMap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google || !mapNodeRef.current) return;

    const map = mapRef.current;
    const triggerResize = () => {
      window.google.maps.event.trigger(map, "resize");
      map.setCenter(map.getCenter() || DEFAULT_CENTER);
    };

    triggerResize();

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    resizeObserverRef.current = new ResizeObserver(() => {
      window.requestAnimationFrame(triggerResize);
    });
    resizeObserverRef.current.observe(mapNodeRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [mapReady]);

  const membersWithLocation = useMemo(
    () => members.filter((member) => member.location_point),
    [members]
  );

  const membersWithUsableLocation = useMemo(
    () => membersWithLocation.filter((member) => isUsableLocationPoint(member.location_point)),
    [membersWithLocation]
  );

  const cityOptions = useMemo(() => {
    const values = new Map();

    membersWithUsableLocation.forEach((member) => {
      const label = String(member.city || "").trim().replace(/\s+/g, " ");
      if (!label) return;
      const key = normalizeCityLabel(label);
      if (!values.has(key)) {
        values.set(key, label);
      }
    });

    return ["All Cities", ...Array.from(values.values()).sort((a, b) => a.localeCompare(b))];
  }, [membersWithUsableLocation]);

  const filteredMembersForMap = useMemo(() => {
    if (cityFilter === "All Cities") {
      return membersWithUsableLocation;
    }

    const selectedKey = normalizeCityLabel(cityFilter);
    return membersWithUsableLocation.filter((member) => normalizeCityLabel(member.city) === selectedKey);
  }, [cityFilter, membersWithUsableLocation]);

  const totalCityCount = Math.max(cityOptions.length - 1, 0);
  const visibleMemberCount = cityFilter === "All Cities" ? totalUsersCount : filteredMembersForMap.length;

  const handleCityChange = (nextCity) => {
    setCityFilter(nextCity);
    setSelectedCluster(null);
    setSelectedMember(null);
    setSearchStatus("");

    if (!mapRef.current) return;

    if (nextCity === "All Cities") {
      mapRef.current.setCenter(DEFAULT_CENTER);
      mapRef.current.setZoom(5);
      return;
    }

    if (!window.google?.maps || !geocoderRef.current) return;

    geocoderRef.current.geocode({ address: nextCity }, (results, status) => {
      if (status === "OK" && results?.[0]?.geometry?.location && mapRef.current) {
        const result = results[0];
        const map = mapRef.current;
        if (result.geometry.viewport) {
          map.fitBounds(result.geometry.viewport);
        } else {
          map.setCenter(result.geometry.location);
          map.setZoom(9);
        }
      }
    });
  };

  useEffect(() => {
    if (!mapRef.current || !window.google || !filteredMembersForMap.length) return;

    const map = mapRef.current;
    const google = window.google;
    fitOnceRef.current = false;

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };

    const clickListener = map.addListener("click", () => {
      setSelectedMember(null);
      setSelectedCluster(null);
    });

    const renderClusters = () => {
      if (!mapRef.current) return;

      clearMarkers();

      const zoom = Math.max(map.getZoom() || 5, 3);
      const rawClusters =
        zoom < STATE_CLUSTER_ZOOM
          ? buildStateClusters(filteredMembersForMap)
          : zoom < MEMBER_CLUSTER_ZOOM
            ? buildClusters(filteredMembersForMap, zoom)
            : buildMemberMarkers(filteredMembersForMap);
      const clusters = zoom < MEMBER_CLUSTER_ZOOM ? mergeCloseClusters(rawClusters, zoom) : rawClusters;
      const bounds = new google.maps.LatLngBounds();

      clusters.forEach((cluster) => {
        const isSingle = cluster.count === 1 && cluster.mode === "member";
        const isGroupedSameSpot = cluster.mode === "member" && cluster.count > 1;
        const member = cluster.members[0];
        const title = cluster.mode === "state"
          ? `${cluster.label}: ${cluster.count} member${cluster.count === 1 ? "" : "s"}`
          : isSingle
            ? member.name
            : isGroupedSameSpot
              ? `${cluster.count} members at the same location`
              : `${cluster.count} members`;

        const marker = new google.maps.Marker({
          position: cluster.position,
          map,
          title,
          zIndex: isSingle ? 10 : 20 + cluster.count,
          icon: isSingle ? getMemberIcon() : getClusterIcon(cluster.count),
          label: undefined,
        });

        marker.addListener("click", () => {
          if (cluster.mode !== "member" || cluster.count > 1) {
            setSelectedCluster(cluster);
            setSelectedMember(null);
            map.panTo(cluster.position);
            const nextZoom = cluster.mode === "state" ? Math.min((map.getZoom() || 5) + 2, MEMBER_CLUSTER_ZOOM) : Math.min((map.getZoom() || 5) + 1, 16);
            map.setZoom(nextZoom);
            return;
          }

          setSelectedCluster(null);
          setSelectedMember(member);
        });

        markersRef.current.push(marker);
        bounds.extend(cluster.position);
      });

      if (!fitOnceRef.current && clusters.length) {
        map.fitBounds(bounds, 48);
        fitOnceRef.current = true;
      }
    };

    const scheduleRender = () => {
      if (renderFrameRef.current) {
        window.cancelAnimationFrame(renderFrameRef.current);
      }
      renderFrameRef.current = window.requestAnimationFrame(renderClusters);
    };

    const idleListener = map.addListener("idle", scheduleRender);
    scheduleRender();

    return () => {
      google.maps.event.removeListener(idleListener);
      google.maps.event.removeListener(clickListener);
      if (renderFrameRef.current) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      clearMarkers();
    };
  }, [filteredMembersForMap, mapReady]);

  useEffect(() => {
    setSelectedCluster(null);
    setSelectedMember(null);
  }, [locationSearchTerm]);

  const handleSearchLocation = () => {
    const query = locationSearchTerm.trim();
    if (!query) {
      setSearchStatus("");
      setCityFilter("All Cities");
      if (mapRef.current) {
        mapRef.current.setCenter(DEFAULT_CENTER);
        mapRef.current.setZoom(5);
      }
      return;
    }

    if (!window.google?.maps || !geocoderRef.current) {
      setSearchStatus("Maps are still loading.");
      return;
    }

    setSearchStatus("Searching map...");
    geocoderRef.current.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results?.[0]?.geometry?.location && mapRef.current) {
        const result = results[0];
        const map = mapRef.current;
        const geocodedCity = extractGeocodedCity(result);
        const matchedCity = cityOptions.find(
          (option) => option !== "All Cities" && normalizeCityLabel(option) === normalizeCityLabel(geocodedCity)
        );
        if (matchedCity) {
          setCityFilter(matchedCity);
        }
        if (result.geometry.viewport) {
          map.fitBounds(result.geometry.viewport);
        } else {
          map.setCenter(result.geometry.location);
          map.setZoom(11);
        }
        setSearchStatus(`Showing ${result.formatted_address || query}`);
        setSelectedCluster(null);
        setSelectedMember(null);
        return;
      }

      setSearchStatus("Place not found on map.");
    });
  };

  const clearSearch = () => {
    setLocationSearchTerm("");
    setSearchStatus("");
    setCityFilter("All Cities");
    if (mapRef.current) {
      mapRef.current.setCenter(DEFAULT_CENTER);
      mapRef.current.setZoom(5);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
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
          gap: 16px;
          height: 100%;
          min-height: 0;
          width: 100%;
        }
        .location-header {
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 18px;
          padding: 18px 20px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          width: 100%;
        }
        .location-header-main {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          flex: 1 1 320px;
        }
        .location-city-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          width: 100%;
        }
        .location-city-label {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
        .location-city-select {
          min-width: 180px;
          min-height: 42px;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #0f172a;
          padding: 0 12px;
          font-size: 14px;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }
        .location-city-select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
        }
        .location-header h1 {
          margin: 0;
          font-size: 26px;
          color: #0f172a;
          letter-spacing: -0.02em;
        }
        .location-header p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 14px;
        }
        .location-body {
          flex: 1;
          min-height: 0;
          background: #fff;
          border-radius: 22px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
          border: 1px solid rgba(148, 163, 184, 0.16);
          overflow: hidden;
          position: relative;
          width: 100%;
          align-self: stretch;
        }
        .map-canvas {
          width: 100%;
          height: 100%;
          min-height: 0;
          background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
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
        .map-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          border-radius: 999px;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
        }
        .location-stat-group {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .location-stat-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          border-radius: 999px;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          color: #0f172a;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
        }
        .location-search {
          width: min(100%, 520px);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .location-search-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
        }
        .location-search-input-wrap {
          flex: 1 1 auto;
          min-width: 0;
          position: relative;
        }
        .location-search-inline-clear {
          flex: 0 0 auto;
          border: 1px solid rgba(37, 99, 235, 0.18);
          background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
          color: #1d4ed8;
          border-radius: 999px;
          padding: 0 14px;
          min-height: 46px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
          white-space: nowrap;
        }
        .location-search-inline-clear:disabled {
          cursor: not-allowed;
          opacity: 0.45;
          box-shadow: none;
          filter: grayscale(0.2);
        }
        .location-search-inline-search {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          min-height: 36px;
          border-radius: 12px;
          border: 1px solid rgba(37, 99, 235, 0.18);
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #fff;
          padding: 0 12px;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
          z-index: 2;
        }
        .location-search input {
          width: 100%;
          min-height: 46px;
          padding: 12px 120px 12px 14px;
          border-radius: 16px;
          border: 1px solid #cbd5e1;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          color: #0f172a;
          font-size: 14px;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }
        .location-search input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
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
        <div className="location-header">
          <div className="location-header-main">
            <div>
              <h1>Member Location</h1>
              <p>Search a place to focus the map. Click a cluster to see the members inside it.</p>
            </div>
            <div className="location-city-row">
              <label className="location-city-label" htmlFor="location-city-filter">
                City
              </label>
              <select
                id="location-city-filter"
                className="location-city-select"
                value={cityFilter}
                onChange={(e) => handleCityChange(e.target.value)}
              >
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
            <div className="location-search">
              <div className="location-search-wrap">
                <div className="location-search-input-wrap">
                  <input
                    type="text"
                    value={locationSearchTerm}
                    onChange={(e) => setLocationSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchLocation();
                      }
                    }}
                  placeholder="Search a place on the map..."
                />
                  <button
                    type="button"
                    className="location-search-inline-search"
                    onClick={handleSearchLocation}
                    aria-label="Search map"
                  >
                    <FaMapMarkedAlt size={12} />
                    <span>Search</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="location-search-inline-clear"
                  onClick={clearSearch}
                  disabled={!locationSearchTerm}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              </div>
            </div>
            {searchStatus ? <p style={{ margin: 0, color: "#2563eb", fontSize: "12px" }}>{searchStatus}</p> : null}
          </div>
          <div className="location-stat-group">
            <div className="location-stat-badge">
              <FaMapMarkedAlt />
              <span>{totalCityCount.toLocaleString()} cities</span>
            </div>
            <div className="map-badge">
              <FaMapMarkedAlt />
              <span>
                {visibleMemberCount.toLocaleString()} members
              </span>
            </div>
          </div>
        </div>

        <div className="location-body">
          <div ref={mapNodeRef} className="map-canvas" />

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
                    <p>{selectedMember.organization || "Member"}</p>
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
                    {selectedCluster.mode === "state" && selectedCluster.label
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
                        {member.organization ? ` • ${member.organization}` : ""}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {locationSearchTerm && membersWithUsableLocation.length === 0 && !mapLoading && !mapError && (
            <div className="empty-results-card">
              <div>
                <h3>No locations found</h3>
                <p>
                  Try a different city, state, name, or organization. The map only shows members that match your search.
                </p>
              </div>
            </div>
          )}

        {mapLoading && !mapError && (
            <div className="loading-card">
              <div className="loading-inner">
                <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                  <FaSpinner size={38} color="#2563eb" style={{ animation: "spin 1s linear infinite", flex: "0 0 auto" }} />
                  <div style={{ flex: "1 1 auto" }}>
                    <div style={{
                      height: "18px",
                      width: "42%",
                      marginBottom: "10px",
                      borderRadius: "999px",
                      background: "#dbeafe",
                    }} />
                    <div style={{
                      height: "12px",
                      width: "78%",
                      marginBottom: "8px",
                      borderRadius: "999px",
                      background: "#e2e8f0",
                    }} />
                    <div style={{
                      height: "12px",
                      width: "64%",
                      borderRadius: "999px",
                      background: "#eef2f7",
                    }} />
                  </div>
                </div>
                <div style={{
                  width: "100%",
                  height: "min(58vh, 520px)",
                  borderRadius: "20px",
                  background: "linear-gradient(135deg, #eef2f7 0%, #f8fafc 45%, #e2e8f0 100%)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.6)",
                }} />
              </div>
            </div>
          )}

          {mapError && <div className="error-card">{mapError}</div>}
        </div>
      </div>
    </div>
  );
}

