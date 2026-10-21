// src/hooks/useTableSort.js
// Shared column sorting for list tables: click a heading to sort ascending,
// again for descending, a third time to go back to the page's default order.
// The arrow icon lives in components/SortArrow.jsx.
import { useCallback, useState } from "react";

// Stored text sometimes carries leading spaces, zero-width / non-breaking
// spaces or quotes, which would otherwise sort ahead of "A".
const cleanText = (v) => String(v).replace(/^[\s\u200b-\u200d\ufeff\u00a0"'\u201c\u201d\u2018\u2019]+/, "").trim();

// Empty values and "-" / "—" placeholders sink to the bottom either way.
const isBlank = (v) =>
  v === null || v === undefined || (typeof v === "string" && ["", "-", "—", "–"].includes(cleanText(v)));

const toComparable = (v) => {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate().getTime(); // Firestore Timestamp
  if (v && typeof v === "object" && typeof v.seconds === "number") return v.seconds * 1000;
  return v;
};

// Returns a new array sorted by `sort.key` using `accessors[key](row)`.
// Numbers compare numerically, text compares naturally ("Item 2" < "Item 10"),
// and blank values always sink to the bottom whichever way you sort.
export function sortRows(rows, sort, accessors) {
  if (!sort?.key || !accessors?.[sort.key]) return rows;
  const get = accessors[sort.key];
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = toComparable(get(a));
    const vb = toComparable(get(b));
    const blankA = isBlank(va);
    const blankB = isBlank(vb);
    if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return cleanText(va).localeCompare(cleanText(vb), undefined, { numeric: true, sensitivity: "base" }) * dir;
  });
}

export default function useTableSort(initial = { key: null, dir: "asc" }) {
  const [sort, setSort] = useState(initial);
  const toggleSort = useCallback(
    (key) =>
      setSort((prev) => {
        if (prev.key !== key) return { key, dir: "asc" };
        if (prev.dir === "asc") return { key, dir: "desc" };
        // Third click: back to the page's default order. When the default is
        // this same column ascending, that just flips back to ascending.
        return initial;
      }),
    // initial is a literal from the caller; treat it as constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return { sort, setSort, toggleSort };
}

// Props for a sortable <th> (or grid header cell): click/keyboard toggles,
// aria-sort reports the state to screen readers.
export function sortHeaderProps(key, sort, toggleSort) {
  const active = sort.key === key;
  return {
    role: "columnheader",
    tabIndex: 0,
    "aria-sort": active ? (sort.dir === "asc" ? "ascending" : "descending") : "none",
    onClick: () => toggleSort(key),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSort(key);
      }
    },
    style: { cursor: "pointer", userSelect: "none" },
    title: "Sort",
  };
}
