export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Shared "branded card" layout for transactional emails (interaction logged,
// follow-up reminder, etc.) — a colored header plus a label/value table, built
// with inline styles and <table> layout since that's what actually renders
// consistently across email clients (Gmail/Outlook strip <style> blocks).
export function renderCardEmail({ heading, subheading, fields, accentColor = "#1976d2", footerNote }) {
  const rows = fields
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:12px 24px;color:#6b7280;font-size:13px;font-weight:600;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f3f4f6;">${escapeHtml(label)}</td>
          <td style="padding:12px 24px;color:#111827;font-size:14px;line-height:1.5;border-bottom:1px solid #f3f4f6;">${escapeHtml(value).replace(/\n/g, "<br/>")}</td>
        </tr>`
    )
    .join("");

  return `
<div style="background:#f3f4f6;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <table style="max-width:540px;width:100%;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-collapse:collapse;">
    <tr>
      <td style="background:${accentColor};padding:24px 28px;">
        <div style="color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Brisk Olive</div>
        <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:6px;">${escapeHtml(heading)}</div>
        ${subheading ? `<div style="color:#ffffff;font-size:13px;opacity:0.9;margin-top:4px;">${escapeHtml(subheading)}</div>` : ""}
      </td>
    </tr>
    <tr>
      <td style="padding:0;">
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </td>
    </tr>
    ${
      footerNote
        ? `<tr><td style="padding:16px 28px;color:#9ca3af;font-size:12px;">${escapeHtml(footerNote)}</td></tr>`
        : ""
    }
  </table>
</div>`;
}

export function renderPlainEmail(body) {
  return `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${escapeHtml(body)}</pre>`;
}

// Member table for allocation emails: same look as renderGridTable, but the
// "Resume" column gets a real link instead of a raw URL when one is present.
function renderMemberTable({ headers, rows }) {
  const resumeIndex = headers.findIndex((h) => h.toLowerCase() === "resume");
  const headerRow = headers
    .map(
      (h) =>
        `<th style="background:#e3f0fc;color:#000000;font-size:12px;font-weight:700;text-align:left;padding:8px 10px;white-space:nowrap;">${escapeHtml(h)}</th>`
    )
    .join("");
  const bodyRows = rows
    .map(
      (row) => `
        <tr>${row
          .map((cell, i) => {
            if (i === resumeIndex && cell) {
              return `<td style="padding:8px 10px;font-size:13px;color:#000000;"><a href="${escapeHtml(cell)}" style="color:#1976d2;">View Resume</a></td>`;
            }
            const text = cell === "" || cell === undefined || cell === null ? "N/A" : String(cell);
            return `<td style="padding:8px 10px;font-size:13px;color:#000000;">${escapeHtml(text)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;"><tr>${headerRow}</tr>${bodyRows}</table>`;
}

// Requirement-allocation email: the job/project/workshop details as a
// label/value block, followed by a table of every member allocated to it —
// used in place of renderCardEmail whenever a `table` is supplied.
export function renderAllocationEmail({
  heading,
  subheading,
  fields,
  tableTitle = "Allocated Members",
  table,
  accentColor = "#1976d2",
  dashboardUrl,
  footerNote,
}) {
  const fieldRows = fields
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:12px 24px;color:#6b7280;font-size:13px;font-weight:600;white-space:nowrap;vertical-align:top;border-bottom:1px solid #f3f4f6;">${escapeHtml(label)}</td>
          <td style="padding:12px 24px;color:#111827;font-size:14px;line-height:1.5;border-bottom:1px solid #f3f4f6;">${escapeHtml(value).replace(/\n/g, "<br/>")}</td>
        </tr>`
    )
    .join("");

  return `
<div style="background:#f3f4f6;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <table style="max-width:760px;width:100%;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);border-collapse:collapse;">
    <tr>
      <td style="background:${accentColor};padding:24px 28px;">
        <div style="color:#ffffff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Brisk Olive</div>
        <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:6px;">${escapeHtml(heading)}</div>
        ${subheading ? `<div style="color:#ffffff;font-size:13px;opacity:0.9;margin-top:4px;">${escapeHtml(subheading)}</div>` : ""}
      </td>
    </tr>
    <tr>
      <td style="padding:0;">
        <table style="width:100%;border-collapse:collapse;">${fieldRows}</table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px 8px 24px;font-size:14px;font-weight:700;color:#111827;">${escapeHtml(tableTitle)}</td>
    </tr>
    <tr>
      <td style="padding:0 24px 24px 24px;">${renderMemberTable(table)}</td>
    </tr>
    ${
      dashboardUrl
        ? `<tr><td style="padding:0 24px 20px 24px;font-size:13px;"><span style="font-weight:700;color:#111827;">Dashboard:</span> <a href="${escapeHtml(dashboardUrl)}" style="color:${accentColor};">${escapeHtml(dashboardUrl)}</a></td></tr>`
        : ""
    }
    ${
      footerNote
        ? `<tr><td style="padding:16px 28px;color:#9ca3af;font-size:12px;">${escapeHtml(footerNote)}</td></tr>`
        : ""
    }
  </table>
</div>`;
}

function renderStatBlock(value, label, accentColor) {
  return `
    <td style="padding:18px 12px;text-align:center;">
      <div style="font-size:30px;font-weight:800;color:${accentColor};line-height:1;">${escapeHtml(value)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:6px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
    </td>`;
}

function renderAllocationDetailTable({ headers, rows }, accentColor) {
  const headerRow = headers
    .map(
      (h) =>
        `<th style="background:${accentColor};color:#ffffff;font-size:12px;font-weight:700;text-align:left;padding:10px 14px;white-space:nowrap;">${escapeHtml(h)}</th>`
    )
    .join("");
  const bodyRows = rows
    .map(
      (row, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
        ${row
          .map(
            (cell) =>
              `<td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;vertical-align:top;">${escapeHtml(
                cell === "" || cell === undefined || cell === null ? "-" : String(cell)
              )}</td>`
          )
          .join("")}
      </tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;"><tr>${headerRow}</tr>${bodyRows}</table>`;
}

// Single-category allocation digest — one attractive, self-contained email
// per requirement type (Job / Project / Temp Staffing) instead of one
// combined report. Gradient banner + at-a-glance stat blocks + a clean
// rounded table, with a friendly empty state when nothing was allocated.
export function renderAllocationCategoryEmail({
  icon = "📋",
  categoryLabel,
  dateStr,
  accentColor = "#1976d2",
  accentColorDark,
  headers,
  rows,
  totalMembers,
  totalRequirements,
  dashboardUrl,
  signOffName,
}) {
  const gradient = `linear-gradient(135deg, ${accentColor}, ${accentColorDark || accentColor})`;
  const hasRows = rows && rows.length > 0;

  const body = hasRows
    ? `
      <div style="padding:0 28px 8px 28px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#fafafa;border-radius:10px;overflow:hidden;">
          <tr>
            ${renderStatBlock(totalRequirements, totalRequirements === 1 ? "Requirement" : "Requirements", accentColor)}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${renderStatBlock(totalMembers, totalMembers === 1 ? "Member Allocated" : "Members Allocated", accentColor)}
          </tr>
        </table>
      </div>
      <div style="padding:0 28px 28px 28px;">
        <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          ${renderAllocationDetailTable({ headers, rows }, accentColor)}
        </div>
      </div>`
    : `
      <div style="padding:44px 28px;text-align:center;">
        <div style="font-size:32px;margin-bottom:10px;">🗒️</div>
        <div style="font-size:14px;color:#9ca3af;">No ${escapeHtml(categoryLabel.toLowerCase())} today.</div>
      </div>`;

  return `
<div style="background:#f3f4f6;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <table style="max-width:640px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);border-collapse:collapse;">
    <tr>
      <td style="background:${accentColor};background:${gradient};padding:32px 28px;">
        <div style="color:#ffffff;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.85;">Brisk Olive Dashboard</div>
        <div style="color:#ffffff;font-size:24px;font-weight:700;margin-top:8px;">${icon} ${escapeHtml(categoryLabel)}</div>
        <div style="color:#ffffff;font-size:13px;opacity:0.9;margin-top:4px;">Daily Summary — ${escapeHtml(dateStr)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 0 0 0;">${body}</td>
    </tr>
    ${
      dashboardUrl
        ? `<tr><td style="padding:0 28px 16px 28px;font-size:13px;"><span style="font-weight:700;color:#111827;">Dashboard:</span> <a href="${escapeHtml(dashboardUrl)}" style="color:${accentColor};">${escapeHtml(dashboardUrl)}</a></td></tr>`
        : ""
    }
    <tr>
      <td style="padding:16px 28px 24px 28px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;line-height:1.6;">
        For any queries, please connect with the dashboard team.<br/>
        Regards,<br/>${escapeHtml(signOffName || "Brisk Olive Dashboard (Auto-generated)")}
      </td>
    </tr>
  </table>
</div>`;
}

// A cell is normally a plain value; a `{ linkPath, label }` shape renders as
// a link to that path resolved against the report's dashboardUrl instead.
function renderGridCell(cell, dashboardUrl) {
  if (cell && typeof cell === "object" && cell.linkPath) {
    const href = `${String(dashboardUrl || "").replace(/\/$/, "")}${cell.linkPath}`;
    return `<td style="padding:8px 10px;font-size:13px;"><a href="${escapeHtml(href)}" style="color:#1976d2;font-weight:600;">${escapeHtml(cell.label || "View")}</a></td>`;
  }
  const text = cell === "" || cell === undefined || cell === null ? "" : String(cell);
  return `<td style="padding:8px 10px;font-size:13px;color:#000000;">${escapeHtml(text)}</td>`;
}

function renderGridTable({ headers, rows }, dashboardUrl) {
  const headerRow = headers
    .map(
      (h) =>
        `<th style="background:#e3f0fc;color:#000000;font-size:12px;font-weight:700;text-align:left;padding:8px 10px;white-space:nowrap;">${escapeHtml(h)}</th>`
    )
    .join("");
  const bodyRows = rows
    .map((row) => `<tr>${row.map((cell) => renderGridCell(cell, dashboardUrl)).join("")}</tr>`)
    .join("");
  return `<table style="width:100%;border-collapse:collapse;"><tr>${headerRow}</tr>${bodyRows}</table>`;
}

function renderSection({ title, subheading, table, note }, dashboardUrl) {
  return `
    <div style="margin:0 0 22px 0;">
      <div style="font-size:14px;font-weight:700;color:#000000;margin-bottom:2px;">${escapeHtml(title)}</div>
      ${subheading ? `<div style="font-size:11px;color:#6b7280;margin-bottom:8px;">${escapeHtml(subheading)}</div>` : `<div style="margin-bottom:8px;"></div>`}
      ${renderGridTable(table, dashboardUrl)}
      ${note ? `<div style="margin-top:6px;font-size:12px;color:#b45309;">${escapeHtml(note)}</div>` : ""}
    </div>`;
}

// Multi-table "daily report" layout modeled on the existing TCS-style report:
// a plain (non-banner) letter header with a manager/dashboard-link info row,
// then borderless grid tables (a light-blue header fill is the only visual
// separator) — distinct from the single label/value card used for
// transactional emails elsewhere in this file.
export function renderDailyReportEmail({
  managerLabel = "Members Manager",
  managerName,
  dashboardUrl,
  sections,
  queryTeamLabel = "dashboard",
  signOffName,
  signOffTitle,
  footerNote,
}) {
  const sectionsHtml = sections.map((section) => renderSection(section, dashboardUrl)).join("");

  const infoRow =
    managerName || dashboardUrl
      ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="vertical-align:top;padding:0;font-size:13px;color:#000000;width:50%;">
          ${managerName ? `<span style="font-weight:700;">${escapeHtml(managerLabel)}:</span> ${escapeHtml(managerName)}` : ""}
        </td>
        <td style="vertical-align:top;padding:0;font-size:13px;color:#000000;width:50%;">
          ${dashboardUrl ? `<span style="font-weight:700;">Dashboard:</span> <a href="${escapeHtml(dashboardUrl)}" style="color:#000000;text-decoration:underline;">${escapeHtml(dashboardUrl)}</a>` : ""}
        </td>
      </tr>
    </table>`
      : "";

  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;padding:16px;">
  <table style="max-width:1000px;width:100%;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="padding:0 0 16px 0;">
        <div style="font-size:14px;color:#000000;margin-bottom:16px;">Dear Team,</div>
        ${infoRow}
      </td>
    </tr>
    <tr>
      <td>${sectionsHtml}</td>
    </tr>
    <tr>
      <td style="padding:0 0 24px 0;font-size:12px;color:#000000;line-height:1.6;">
        For any queries, please connect with the ${escapeHtml(queryTeamLabel)} team.<br/><br/>
        Regards,<br/>${signOffName ? escapeHtml(signOffName) : "Brisk Olive Dashboard (Auto-generated)"}${signOffTitle ? `<br/>${escapeHtml(signOffTitle)}` : ""}
      </td>
    </tr>
    ${
      footerNote
        ? `<tr><td style="padding:16px 0;color:#9ca3af;font-size:12px;">${escapeHtml(footerNote)}</td></tr>`
        : ""
    }
  </table>
</div>`;
}
