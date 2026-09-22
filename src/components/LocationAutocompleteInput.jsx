import { useEffect, useRef } from "react";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
// Separate script id/URL from MemberLocationPage's loader (which loads Maps
// without the `places` library) — sharing one id would let whichever page
// loads first decide if `places` is available for both.
const GOOGLE_MAPS_PLACES_SCRIPT_ID = "google-maps-places-js";

const loadGoogleMapsPlaces = (apiKey) =>
  new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve(window.google.maps);
      return;
    }

    const existingScript = document.getElementById(GOOGLE_MAPS_PLACES_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google Maps")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_PLACES_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

// Plain text input that upgrades itself into a Google Places autocomplete
// field once the Maps script loads. Stays a normal controlled input if the
// API key is missing or the script fails, so the form never gets stuck.
export default function LocationAutocompleteInput({
  value,
  onChange,
  placeholder = "Search for a location...",
  style,
  disabled,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (disabled || !GOOGLE_MAPS_API_KEY || autocompleteRef.current) return;
    let cancelled = false;

    loadGoogleMapsPlaces(GOOGLE_MAPS_API_KEY)
      .then((maps) => {
        if (cancelled || !inputRef.current || autocompleteRef.current) return;
        const autocomplete = new maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "name"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const address = place?.formatted_address || place?.name || inputRef.current.value;
          onChange(address);
        });
        autocompleteRef.current = autocomplete;
      })
      .catch((err) => console.error("Failed to load Google Places:", err));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      autoComplete="off"
    />
  );
}
