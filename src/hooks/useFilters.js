// src/hooks/useFilters.js
import { useState, useMemo } from "react";

export const useFilters = (data, filterKeys) => {
  const initial = filterKeys.reduce((acc, k) => ({ ...acc, [k]: "All" }), {});
  const [filters, setFilters] = useState(initial);

  const availableOptions = useMemo(() => {
    if (!data.length) return {};
    const opts = {};
    filterKeys.forEach(key => {
      const values = data.flatMap(item => {
        if (key === "Tags" && item[key]) return item[key].split(",").map(t => t.trim());
        return [item[key]].filter(Boolean);
      });
      opts[key] = [...new Set(values)].sort();
    });
    return opts;
  }, [data, filterKeys]);

  const applyFilters = (list) => list.filter(item =>
    filterKeys.every(key => {
      if (filters[key] === "All") return true;
      if (key === "Tags") return item[key]?.split(",").some(t => t.trim() === filters[key]);
      return item[key] === filters[key];
    })
  );

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters(initial);

  return { filters, availableOptions, handleFilterChange, clearFilters, applyFilters };
};