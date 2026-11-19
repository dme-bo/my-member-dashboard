// src/utils/multiGroup.js
//
// Several "Group By" fields at once. Pages keep a single `groupBy` state value
// (string | null); picking more than one field stores them joined by GROUP_SEP,
// so existing state / favorites keep working. Items are grouped by the
// combination of every picked field, labelled "A › B".

export const GROUP_SEP = '||';
export const LABEL_SEP = ' › ';

export const splitGroupBy = (groupBy) => (groupBy ? String(groupBy).split(GROUP_SEP).filter(Boolean) : []);
export const joinGroupBy = (keys) => (keys.length ? keys.join(GROUP_SEP) : null);

// Chip / heading text for the active grouping, e.g. "State › City".
export const groupByLabel = (options, groupBy) =>
  splitGroupBy(groupBy)
    .map((key) => options.find((o) => o.key === key)?.label || key)
    .join(LABEL_SEP);

// Group labels for one item. `labelsFor(item, key)` returns the label(s) for a
// single field (an array, for multi-valued fields such as tags); the result is
// every combination across the picked fields.
export const multiGroupLabels = (item, groupBy, labelsFor) => {
  let combos = [''];
  splitGroupBy(groupBy).forEach((key, i) => {
    const raw = labelsFor(item, key);
    const labels = (Array.isArray(raw) ? raw : [raw]).map((l) => String(l ?? '').trim()).filter(Boolean);
    const parts = labels.length ? labels : ['Unspecified'];
    combos = combos.flatMap((prefix) => parts.map((l) => (i === 0 ? l : `${prefix}${LABEL_SEP}${l}`)));
  });
  return combos;
};
