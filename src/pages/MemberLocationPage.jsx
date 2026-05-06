import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { FaMapMarkedAlt, FaSpinner } from "react-icons/fa";
import { db } from "../firebase";
import { getMemberName, parseMemberLatLong, pickMemberText } from "../utils/memberFields";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_SCRIPT_ID = "google-maps-js";
const DEFAULT_CENTER = { lat: 22.9734, lng: 78.6569 };
const CLUSTER_GRID_BASE_PX = 84;

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
  const size = Math.min(72, 34 + Math.log10(count + 1) * 16);
  const radius = size / 2;
  return {
    url:
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${radius}" cy="${radius}" r="${radius - 1}" fill="#ef4444" stroke="#b91c1c" stroke-width="2" />
          <circle cx="${radius}" cy="${radius}" r="${radius - 10}" fill="rgba(255,255,255,0.18)" />
        </svg>
      `),
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(radius, radius),
    labelOrigin: new window.google.maps.Point(radius, radius + 1),
  };
};

const getMemberIcon = () => ({
  url:
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">
        <path d="M15 1C8.37 1 3 6.37 3 13c0 8.75 12 28 12 28s12-19.25 12-28C27 6.37 21.63 1 15 1z" fill="#ef4444" stroke="#b91c1c" stroke-width="2"/>
        <circle cx="15" cy="13" r="5.5" fill="#fff" opacity="0.9"/>
      </svg>
    `),
  scaledSize: new window.google.maps.Size(30, 42),
  anchor: new window.google.maps.Point(15, 42),
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
  const mapRef = useRef(null);
  const mapNodeRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
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
        setMapError("Missing Google Maps API key. Add VITE_GOOGLE_MAPS_API_KEY to my-react-app/.env.local");
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
            { elementType: "geometry", stylers: [{ color: "#f5f7fb" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#f5f7fb" }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
            { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#dbe4f0" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d9e2ec" }] },
          ],
        });

        infoWindowRef.current = new window.google.maps.InfoWindow();
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

  const membersWithLocation = useMemo(
    () => members.filter((member) => member.location_point),
    [members]
  );

  useEffect(() => {
    if (!mapRef.current || !window.google || !membersWithLocation.length || !infoWindowRef.current) return;

    const map = mapRef.current;
    const google = window.google;

    const clearMarkers = () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };

    const renderClusters = () => {
      if (!mapRef.current || !infoWindowRef.current) return;

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
            const nextZoom = Math.min((map.getZoom() || zoom) + 2, 18);
            map.panTo(cluster.position);
            map.setZoom(nextZoom);
            return;
          }

          infoWindowRef.current.setContent(`
            <div style="min-width: 180px; max-width: 240px;">
              <div style="font-weight: 700; margin-bottom: 4px; color: #111827;">${member.name}</div>
              <div style="font-size: 12px; color: #475569;">${member.city || "-"}, ${member.state || "-"}</div>
              <div style="font-size: 12px; color: #475569;">${member.organization || "-"}</div>
            </div>
          `);
          infoWindowRef.current.open({ map, anchor: marker });
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
      if (renderFrameRef.current) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
      clearMarkers();
    };
  }, [membersWithLocation, mapReady]);

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
          background: #fff;
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          width: 100%;
        }
        .location-header h1 {
          margin: 0;
          font-size: 24px;
          color: #0f172a;
        }
        .location-header p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 13px;
        }
        .location-body {
          flex: 1;
          min-height: 0;
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
          overflow: hidden;
          position: relative;
          width: 100%;
          align-self: stretch;
        }
        .map-canvas {
          width: 100%;
          height: 100%;
          min-height: 0;
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
          padding: 8px 12px;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }
      `}</style>

      <div className="location-page">
        <div className="location-header">
          <div>
            <h1>Member Location</h1>
            <p>Members cluster by zoom. Click a cluster to zoom in, then click a pin for details.</p>
          </div>
          <div className="map-badge">
            <FaMapMarkedAlt />
            <span>{membersWithLocation.length.toLocaleString()} members</span>
          </div>
        </div>

        <div className="location-body">
          <div ref={mapNodeRef} className="map-canvas" />

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
