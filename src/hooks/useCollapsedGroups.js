// src/hooks/useCollapsedGroups.js
// Which group headings are folded shut.
//
// While Group By is on (`groupBy` set), every group starts collapsed and a click
// opens it; picking a different grouping starts everything collapsed again.
// With no grouping (e.g. the Workshops page's Upcoming / Completed sections)
// sections start open, as before.
//
// `collapsedGroups.has(key)` tells whether a group is collapsed right now.
import { useCallback, useMemo, useState } from "react";

const EMPTY = new Set();

export default function useCollapsedGroups(groupBy = null) {
  // `toggled` holds the groups the user has flipped away from the default.
  const [state, setState] = useState({ groupBy, toggled: EMPTY });
  const toggled = state.groupBy === groupBy ? state.toggled : EMPTY;
  const startCollapsed = Boolean(groupBy);

  const collapsedGroups = useMemo(() => ({ has: (key) => startCollapsed !== toggled.has(key) }), [startCollapsed, toggled]);

  const toggleGroupCollapsed = useCallback(
    (key) =>
      setState((prev) => {
        const next = new Set(prev.groupBy === groupBy ? prev.toggled : EMPTY);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { groupBy, toggled: next };
      }),
    [groupBy]
  );

  return { collapsedGroups, toggleGroupCollapsed };
}
