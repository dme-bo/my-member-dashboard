// src/hooks/useCollapsedGroups.js
// Which group headings are folded shut while Group By is active.
import { useCallback, useState } from "react";

export default function useCollapsedGroups() {
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toggleGroupCollapsed = useCallback((key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return { collapsedGroups, toggleGroupCollapsed };
}
