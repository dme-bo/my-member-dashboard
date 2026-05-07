import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { FaMapMarkedAlt, FaSpinner, FaDirections, FaTimes, FaPhoneAlt, FaEnvelope, FaMapPin } from "react-icons/fa";
import { db } from "../firebase";
import { getMemberName, getMemberPhone, getMemberEmail, parseMemberLatLong, pickMemberText } from "../utils/memberFields";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js";
const DEFAULT_CENTER = { lat: 22.9734, lng: 78.6569 };
const CLUSTER_GRID_BASE_PX = 84;

const createSvgDataUrl = (svg) =>
  "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());

const loadGoogleMaps = (apiKey) =>
  new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

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

const getClusterGridSize = (zoom) => {
  if (zoom >= 15) return 36;
  if (zoom >= 13) return 48;
  if (zoom >= 11) return 60;
  if (zoom >= 9) return 72;
  return CLUSTER_GRID_BASE_PX;
};

const getClusterIcon = (count) => {
  const size = Math.min(84, 38 + Math.log10(count + 1) * 18);
  const radius = size / 2;
  return {
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs>
          <radialGradient id="clusterGlow" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#60a5fa" stop-opacity="1" />
            <stop offset="100%" stop-color="#1d4ed8" stop-opacity="1" />
          </radialGradient>
          <filter id="clusterShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#1e3a8a" flood-opacity="0.22" />
          </filter>
        </defs>
        <circle cx="${radius}" cy="${radius}" r="${radius - 2}" fill="url(#clusterGlow)" filter="url(#clusterShadow)" />
        <circle cx="${radius}" cy="${radius}" r="${radius - 9}" fill="rgba(255,255,255,0.16)" />
        <circle cx="${radius}" cy="${radius}" r="${radius - 14}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" />
      </svg>
    `),
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(radius, radius),
    labelOrigin: new window.google.maps.Point(radius, radius + 1),
  };
};

const getMemberIcon = () => ({
  url: createSvgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">
      <defs>
        <linearGradient id="pinFill" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
        <filter id="pinShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.18" />
        </filter>
      </defs>
      <path d="M17 1C9.82 1 4 6.82 4 14c0 9.5 13 31 13 31s13-21.5 13-31C30 6.82 24.18 1 17 1z" fill="url(#pinFill)" stroke="#1d4ed8" stroke-width="1.5" filter="url(#pinShadow)"/>
      <circle cx="17" cy="14" r="6" fill="#ffffff" opacity="0.92"/>
      <circle cx="17" cy="14" r="2.8" fill="#1d4ed8"/>
    </svg>
  `),
  scaledSize: new window.google.maps.Size(34, 46),
  anchor: new window.google.maps.Point(17, 46),
});

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

export default function MemberLocationPage() {
  const [members, setMembers] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [locationSearchTerm, setLocationSearchTerm] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const markersRef = useRef([]);
  const fitOnceRef = useRef(false);
  const renderFrameRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const snapshot = await getDocs(collection(db, "users"));
        if (cancelled) return;

        const rows = snapshot.docs
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

        setMembers(rows);
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
        setMapLoading(false);
        setMapReady(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMapError("Google Maps failed to load.");
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

  const filteredMembers = useMemo(() => {
    const query = locationSearchTerm.trim().toLowerCase();
    if (!query) return members;

    return members.filter((member) => {
      const haystack = [
        member.name,
        member.phone,
        member.email,
        member.city,
        member.state,
        member.organization,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [members, locationSearchTerm]);

  const membersWithLocation = useMemo(
    () => filteredMembers.filter((member) => member.location_point),
    [filteredMembers]
  );

  useEffect(() => {
    if (!mapRef.current || !window.google || !membersWithLocation.length) return;

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
      const clusters = buildClusters(membersWithLocation, zoom);
      const bounds = new google.maps.LatLngBounds();

      clusters.forEach((cluster) => {
        const isSingle = cluster.count === 1;
        const member = cluster.members[0];

        const marker = new google.maps.Marker({
          position: cluster.position,
          map,
          title: isSingle ? member.name : `${cluster.count} members`,
          zIndex: isSingle ? 10 : 20 + cluster.count,
          icon: isSingle ? getMemberIcon() : getClusterIcon(cluster.count),
          label: isSingle
            ? undefined
            : {
                text: String(cluster.count),
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "700",
              },
        });

        marker.addListener("click", () => {
          if (!isSingle) {
            setSelectedCluster(cluster);
            setSelectedMember(null);
            map.panTo(cluster.position);
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
  }, [membersWithLocation, mapReady]);

  useEffect(() => {
    setSelectedCluster(null);
    setSelectedMember(null);
  }, [locationSearchTerm]);

  const clearSearch = () => {
    setLocationSearchTerm("");
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
        .location-search {
          width: min(100%, 520px);
          position: relative;
        }
        .location-search input {
          width: 100%;
          min-height: 46px;
          padding: 12px 42px 12px 14px;
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
        .location-search button {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 999px;
          background: #e2e8f0;
          color: #334155;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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
            <div className="location-search">
              <input
                type="text"
                value={locationSearchTerm}
                onChange={(e) => setLocationSearchTerm(e.target.value)}
                placeholder="Search city, state, organization, name..."
              />
              {locationSearchTerm ? (
                <button type="button" onClick={clearSearch} aria-label="Clear search">
                  <FaTimes size={12} />
                </button>
              ) : null}
            </div>
          </div>
          <div className="map-badge">
            <FaMapMarkedAlt />
            <span>{membersWithLocation.length.toLocaleString()} members</span>
          </div>
        </div>

        <div className="location-body">
          <div ref={mapNodeRef} className="map-canvas" />

          <div className="map-legend">
            <div className="legend-card">
              <div className="legend-title">How to read the map</div>
              <p className="legend-text">
                Blue pins are individual members. Blue bubbles are clustered points. Zoom in to spread the clusters apart.
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
          </div>

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
                  <FaTimes />
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
                  <h3>{selectedCluster.count.toLocaleString()} members in cluster</h3>
                  <p>Click a member row to inspect or use the search box to narrow the map.</p>
                </div>
                <button
                  type="button"
                  className="cluster-details-close"
                  onClick={() => setSelectedCluster(null)}
                  aria-label="Close cluster list"
                >
                  <FaTimes />
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

          {locationSearchTerm && membersWithLocation.length === 0 && !mapLoading && !mapError && (
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
                <FaSpinner size={38} color="#2563eb" style={{ animation: "spin 1s linear infinite" }} />
                <div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Loading map...</div>
                  <div style={{ fontSize: "13px" }}>Preparing clustered pins</div>
                </div>
              </div>
            </div>
          )}

          {mapError && <div className="error-card">{mapError}</div>}
        </div>
      </div>
    </div>
  );
}
