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
  return multiGroupCombos(item, groupBy, labelsFor);
};

// Odoo-style nested groups for list/kanban views. Takes the page's grouped
// entries — [["A › B", items], ...] from multiGroupLabels — and returns the
// rows to draw, top to bottom:
//   { key, label, level, count, open, items }
//   key    "A › B" path, used for open/closed state (isCollapsed(key))
//   label  this level's own label ("B")
//   level  0 for the first Group By field, 1 for the second, ...
//   count  records under this heading
//   items  the records to show under it — only for an open last-level group, else null
// A collapsed heading hides everything below it, like Odoo.
export const nestGroups = (grouped, isCollapsed) => {
  const roots = [];
  const byKey = new Map();
  for (const [combo, items] of grouped || []) {
    const parts = String(combo).split(LABEL_SEP);
    let siblings = roots;
    let key = '';
    parts.forEach((part, level) => {
      key = level === 0 ? part : `${key}${LABEL_SEP}${part}`;
      let node = byKey.get(key);
      if (!node) {
        node = { key, label: part, level, children: [], members: new Set(), items: null };
        byKey.set(key, node);
        siblings.push(node);
      }
      items.forEach((item) => node.members.add(item));
      if (level === parts.length - 1) node.items = items;
      siblings = node.children;
    });
  }
  const rows = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      const open = !isCollapsed(node.key);
      const isLeaf = node.children.length === 0;
      rows.push({ key: node.key, label: node.label, level: node.level, count: node.members.size, open, items: open && isLeaf ? node.items || [] : null });
      if (open && !isLeaf) walk(node.children);
    }
  };
  walk(roots);
  return rows;
};

const multiGroupCombos = (item, groupBy, labelsFor) => {
  let combos = [''];
  splitGroupBy(groupBy).forEach((key, i) => {
    const raw = labelsFor(item, key);
    const labels = (Array.isArray(raw) ? raw : [raw]).map((l) => String(l ?? '').trim()).filter(Boolean);
    const parts = labels.length ? labels : ['Unspecified'];
    combos = combos.flatMap((prefix) => parts.map((l) => (i === 0 ? l : `${prefix}${LABEL_SEP}${l}`)));
  });
  return combos;
};
