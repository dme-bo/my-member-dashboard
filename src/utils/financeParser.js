// src/utils/financeParser.js
//
// Turns the TCS payout sheet into `financemaster` documents. Only these columns
// are read: Date, State, City, Zone, Resource Name, Mobile, Email, TCS Payout,
// Ground Payout (+ Resource ID, used to group rows into one person). Bank,
// PAN and Aadhar columns are deliberately never read.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const normalizeKey = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (value) => String(value ?? '').trim();
const pad = (n) => String(n).padStart(2, '0');

// Payouts arrive as numbers or as text such as "1,275"; blanks count as 0.
export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function parseMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

// -> "YYYY-MM-DD" or ''. Accepts Date objects, "01-Apr-2026", "01/04/2026", "2026-04-01".
export function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const s = text(value);
  let m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]*(\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const mostCommon = (counts) => {
  let best = '';
  let bestN = 0;
  for (const [value, n] of counts) {
    if (value && n > bestN) {
      best = value;
      bestN = n;
    }
  }
  return best;
};
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

const COLUMN_ALIASES = {
  date: ['date'],
  state: ['state'],
  city: ['city'],
  zone: ['zone'],
  name: ['resourcename'],
  resourceId: ['resourceid'],
  mobile: ['mobile'],
  email: ['email'],
  tcs: ['tcspayout'],
  ground: ['groundpayout'],
};

export function parseFinanceRows(rawRows) {
  const skipped = { noDate: 0, noResource: 0 };
  const required = ['date', 'name', 'tcs', 'ground'];
  const headers = rawRows.length ? Object.keys(rawRows[0]).map(normalizeKey) : [];
  const missing = required.filter((k) => !COLUMN_ALIASES[k].some((a) => headers.includes(a)));
  if (missing.length) return { error: `Missing column(s): ${missing.map((k) => COLUMN_ALIASES[k][0]).join(', ')}` };

  const pick = (row, field) => {
    for (const key of Object.keys(row)) {
      if (COLUMN_ALIASES[field].includes(normalizeKey(key))) return row[key];
    }
    return '';
  };

  const people = new Map();
  let totalRows = 0;
  for (const row of rawRows) {
    const date = parseDate(pick(row, 'date'));
    if (!date) {
      skipped.noDate += 1;
      continue;
    }
    const name = text(pick(row, 'name'));
    const mobile = parseMobile(pick(row, 'mobile'));
    const resourceId = text(pick(row, 'resourceId'));
    const id = resourceId || mobile || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!id) {
      skipped.noResource += 1;
      continue;
    }
    const tcs = parseAmount(pick(row, 'tcs'));
    const ground = parseAmount(pick(row, 'ground'));
    const state = text(pick(row, 'state'));
    const city = text(pick(row, 'city'));
    const zone = text(pick(row, 'zone'));

    let p = people.get(id);
    if (!p) {
      p = { id, names: new Map(), mobiles: new Map(), emails: new Map(), states: new Map(), cities: new Map(), zones: new Map(), months: {}, entries: [], tcs_total: 0, ground_total: 0 };
      people.set(id, p);
    }
    bump(p.names, name);
    bump(p.mobiles, mobile);
    bump(p.emails, text(pick(row, 'email')).toLowerCase());
    bump(p.states, state);
    bump(p.cities, city);
    bump(p.zones, zone);
    const month = date.slice(0, 7);
    const bucket = (p.months[month] = p.months[month] || { tcs: 0, ground: 0, days: 0 });
    bucket.tcs += tcs;
    bucket.ground += ground;
    bucket.days += 1;
    p.tcs_total += tcs;
    p.ground_total += ground;
    p.entries.push({ d: date, z: zone, s: state, c: city, t: tcs, g: ground });
    totalRows += 1;
  }

  const docs = [];
  const monthTotals = {};
  let tcsTotal = 0;
  let groundTotal = 0;
  for (const p of people.values()) {
    p.entries.sort((a, b) => a.d.localeCompare(b.d));
    docs.push({
      id: p.id,
      summary: {
        resource_id: p.id,
        resource_name: mostCommon(p.names) || 'Unnamed',
        mobile: mostCommon(p.mobiles),
        email: mostCommon(p.emails),
        state: mostCommon(p.states),
        city: mostCommon(p.cities),
        zone: mostCommon(p.zones),
        months: p.months,
        days: p.entries.length,
        tcs_total: p.tcs_total,
        ground_total: p.ground_total,
      },
      entries: p.entries,
    });
    tcsTotal += p.tcs_total;
    groundTotal += p.ground_total;
    for (const [m, b] of Object.entries(p.months)) {
      const t = (monthTotals[m] = monthTotals[m] || { tcs: 0, ground: 0 });
      t.tcs += b.tcs;
      t.ground += b.ground;
    }
  }
  return { docs, skipped, totalRows, tcsTotal, groundTotal, monthTotals };
}
