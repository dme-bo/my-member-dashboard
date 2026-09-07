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
