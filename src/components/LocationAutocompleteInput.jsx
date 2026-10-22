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

// Pull city / state / coordinates out of a Places result.
const componentName = (place, type) =>
  place?.address_components?.find((c) => c.types.includes(type))?.long_name || "";
const describePlace = (place) => {
  const location = place?.geometry?.location;
  return {
    address: place?.formatted_address || place?.name || "",
    city:
      componentName(place, "locality") ||
      componentName(place, "administrative_area_level_3") ||
      componentName(place, "administrative_area_level_2") ||
      componentName(place, "sublocality_level_1") ||
      place?.name ||
      "",
    state: componentName(place, "administrative_area_level_1"),
    lat: location ? location.lat() : null,
    lng: location ? location.lng() : null,
  };
};

// Plain text input that upgrades itself into a Google Places autocomplete
// field once the Maps script loads. Stays a normal controlled input if the
// API key is missing or the script fails, so the form never gets stuck.
export default function LocationAutocompleteInput({
  value,
  onChange,
  placeholder = "Search for a location...",
  style,
  disabled,
  id,
  // Optional: called with { address, city, state, lat, lng } when a suggestion is picked.
  onPlaceSelected,
  // Optional ISO country code (e.g. "in") to limit suggestions.
  country,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  // The Places listener is attached once; read the latest callback through a ref.
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  useEffect(() => { onPlaceSelectedRef.current = onPlaceSelected; });

  useEffect(() => {
    if (disabled || !GOOGLE_MAPS_API_KEY || autocompleteRef.current) return;
    let cancelled = false;

    loadGoogleMapsPlaces(GOOGLE_MAPS_API_KEY)
      .then((maps) => {
        if (cancelled || !inputRef.current || autocompleteRef.current) return;
        const autocomplete = new maps.places.Autocomplete(inputRef.current, {
          fields: onPlaceSelected
            ? ["formatted_address", "name", "address_components", "geometry"]
            : ["formatted_address", "name"],
          ...(country ? { componentRestrictions: { country } } : {}),
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const address = place?.formatted_address || place?.name || inputRef.current.value;
          onChange(address);
          if (onPlaceSelectedRef.current) onPlaceSelectedRef.current(describePlace(place));
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
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // Enter picks the highlighted suggestion (Google handles that itself);
      // without this it would also submit the surrounding form mid-entry.
      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      autoComplete="off"
    />
  );
}
