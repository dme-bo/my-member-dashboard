// src/pages/TagUploadPage.jsx
import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { FaFileUpload, FaCheckCircle } from "react-icons/fa";

const BATCH_CHUNK_SIZE = 400;
const PREVIEW_ROW_CAP = 500;

const normalizeKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const getCell = (row, keys) => {
  const targets = keys.map(normalizeKey);
  for (const rawKey of Object.keys(row)) {
    if (targets.includes(normalizeKey(rawKey))) {
      const value = row[rawKey];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
};

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
};

const splitTags = (value) =>
  String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const sameTags = (a, b) => {
  if (a.length !== b.length) return false;
  const normA = a.map((t) => t.toLowerCase()).sort();
  const normB = b.map((t) => t.toLowerCase()).sort();
  return normA.every((t, i) => t === normB[i]);
};

const ACTION_LABELS = {
  fill: { text: "Fill (was blank)", background: "#dcfce7", color: "#15803d" },
  replace: { text: "Replace", background: "#fef3c7", color: "#b45309" },
  "no-change": { text: "No change needed", background: "#f1f5f9", color: "#64748b" },
  unmatched: { text: "Not matched", background: "#fee2e2", color: "#b91c1c" },
  "no-tags": { text: "CSV has no Tags value", background: "#f1f5f9", color: "#64748b" },
  "no-contact": { text: "No mobile/email in row", background: "#fee2e2", color: "#b91c1c" },
};

export default function TagUploadPage({ memberRecords = [], membersLoading = false }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState([]);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyResult, setApplyResult] = useState(null);

  const phoneIndex = useMemo(() => {
    const map = new Map();
    memberRecords.forEach((member) => {
      const phone = normalizePhone(member.phone_number || member.phone || member.mobile);
      if (phone) map.set(phone, member);
    });
    return map;
  }, [memberRecords]);

  const emailIndex = useMemo(() => {
    const map = new Map();
    memberRecords.forEach((member) => {
      const email = String(member.email || "").trim().toLowerCase();
      if (email) map.set(email, member);
    });
    return map;
  }, [memberRecords]);

  const summary = useMemo(() => {
    const counts = { fill: 0, replace: 0, "no-change": 0, unmatched: 0, "no-tags": 0, "no-contact": 0 };
    rows.forEach((row) => { counts[row.action] = (counts[row.action] || 0) + 1; });
    return counts;
  }, [rows]);

  const updatable = useMemo(() => rows.filter((row) => row.action === "fill" || row.action === "replace"), [rows]);

  const resetResults = () => {
    setRows([]);
    setParseError("");
    setApplyResult(null);
    setApplyProgress(0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetResults();
    setFileName(file.name);
    setParsing(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = (results.data || []).map((csvRow, index) => {
          const mobileRaw = getCell(csvRow, ["Mobile Number", "Mobile", "Phone"]);
          const emailRaw = getCell(csvRow, ["Email"]);
          const nameRaw = getCell(csvRow, ["Full Name", "Name"]);
          const tagsRaw = getCell(csvRow, ["Tags"]);

          if (!mobileRaw && !emailRaw) {
            return { key: index, mobileRaw, emailRaw, nameRaw, tagsRaw, action: "no-contact" };
          }

          const member =
            phoneIndex.get(normalizePhone(mobileRaw)) ||
            (emailRaw ? emailIndex.get(emailRaw.toLowerCase()) : undefined);

          if (!member) {
            return { key: index, mobileRaw, emailRaw, nameRaw, tagsRaw, action: "unmatched" };
          }

          if (!tagsRaw) {
            return {
              key: index, mobileRaw, emailRaw, nameRaw, tagsRaw,
              member, action: "no-tags", previousTags: member.tags || [],
            };
          }

          const newTags = splitTags(tagsRaw);
          const previousTags = member.tags || [];
          const action = sameTags(previousTags, newTags) ? "no-change" : previousTags.length === 0 ? "fill" : "replace";

          return { key: index, mobileRaw, emailRaw, nameRaw, tagsRaw, member, action, previousTags, newTags };
        });

        setRows(parsedRows);
        setParsing(false);
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        setParseError("Could not read this file. Make sure it's a valid CSV export.");
        setParsing(false);
      },
    });
  };

  const handleApply = async () => {
    if (updatable.length === 0) return;
    setApplying(true);
    setApplyProgress(0);
    setApplyResult(null);

    try {
      for (let i = 0; i < updatable.length; i += BATCH_CHUNK_SIZE) {
        const chunk = updatable.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((row) => {
          batch.update(doc(db, "users", row.member.id), {
            tags: row.newTags,
            Tags: row.newTags.join(", "),
          });
        });
        await batch.commit();
        setApplyProgress(Math.min(i + chunk.length, updatable.length));
      }

      setApplyResult({ success: true, count: updatable.length });
    } catch (error) {
      console.error("Error applying tag updates:", error);
      setApplyResult({ success: false, message: "Some updates may not have been saved. Please check and retry." });
    } finally {
      setApplying(false);
    }
  };

  const previewRows = rows.slice(0, PREVIEW_ROW_CAP);

  return (
    <div style={{ padding: "24px 28px", background: "#f5f7fa", minHeight: "calc(100vh - 56px)" }}>
      <section style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>Bulk Tag Upload</h2>
        <p style={{ margin: "6px 0 20px", fontSize: 13, color: "#64748b", maxWidth: 640 }}>
          Upload a CSV export. Rows are matched to members by Mobile Number, falling back to Email.
          The CSV's <strong>Tags</strong> column fills the member's Tags field when it is blank, and
          replaces it when the value differs. Rows with no Tags value in the CSV are left untouched.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={membersLoading || parsing}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "11px 20px", borderRadius: 10, border: "none",
              background: membersLoading || parsing ? "#90caf9" : "#1976d2",
              color: "#fff", fontWeight: 700, fontSize: 14,
              cursor: membersLoading || parsing ? "not-allowed" : "pointer",
            }}
          >
            <FaFileUpload size={13} />
            {parsing ? "Reading file..." : "Choose CSV File"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          {fileName && <span style={{ fontSize: 13, color: "#475569" }}>{fileName}</span>}
          {membersLoading && <span style={{ fontSize: 12, color: "#94a3b8" }}>Loading members…</span>}
        </div>

        {parseError && (
          <div style={{ marginTop: 14, color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{parseError}</div>
        )}
      </section>

      {rows.length > 0 && (
        <>
          <section style={{ ...cardStyle, marginTop: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#0f172a" }}>Summary ({rows.length} rows parsed)</h3>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <StatBox label="Will Fill" value={summary.fill || 0} tone="good" />
              <StatBox label="Will Replace" value={summary.replace || 0} tone="warn" />
              <StatBox label="No Change Needed" value={summary["no-change"] || 0} />
              <StatBox label="Not Matched" value={summary.unmatched || 0} tone="bad" />
              <StatBox label="No Tags In CSV" value={summary["no-tags"] || 0} />
              <StatBox label="No Mobile/Email" value={summary["no-contact"] || 0} tone="bad" />
            </div>

            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleApply}
                disabled={applying || updatable.length === 0}
                style={{
                  padding: "11px 22px", borderRadius: 10, border: "none",
                  background: applying || updatable.length === 0 ? "#90caf9" : "#16a34a",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: applying || updatable.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                {applying
                  ? `Applying ${applyProgress}/${updatable.length}...`
                  : `Apply ${updatable.length.toLocaleString()} Update${updatable.length === 1 ? "" : "s"}`}
              </button>

              {applyResult?.success && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
                  <FaCheckCircle /> Updated {applyResult.count.toLocaleString()} member{applyResult.count === 1 ? "" : "s"}.
                </span>
              )}
              {applyResult && !applyResult.success && (
                <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 700 }}>{applyResult.message}</span>
              )}
            </div>
          </section>

          <section style={{ ...cardStyle, marginTop: 20, overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#0f172a" }}>
              Row Preview {rows.length > PREVIEW_ROW_CAP ? `(showing first ${PREVIEW_ROW_CAP} of ${rows.length})` : ""}
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={thStyle}>Name (CSV)</th>
                  <th style={thStyle}>Mobile</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Previous Tags</th>
                  <th style={thStyle}>New Tags (CSV)</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => {
                  const badge = ACTION_LABELS[row.action];
                  return (
                    <tr key={row.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={tdStyle}>{row.nameRaw || "-"}</td>
                      <td style={tdStyle}>{row.mobileRaw || "-"}</td>
                      <td style={tdStyle}>{row.emailRaw || "-"}</td>
                      <td style={tdStyle}>{(row.previousTags || []).join(", ") || "-"}</td>
                      <td style={tdStyle}>{(row.newTags || []).join(", ") || "-"}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                          background: badge.background, color: badge.color, whiteSpace: "nowrap",
                        }}>
                          {badge.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, tone = "neutral" }) {
  const color = tone === "bad" ? "#dc2626" : tone === "warn" ? "#b45309" : tone === "good" ? "#15803d" : "#0f172a";
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 20px", minWidth: 140 }}>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value.toLocaleString()}</div>
    </div>
  );
}

const cardStyle = {
  background: "#ffffff",
  borderRadius: 12,
  padding: "22px 24px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
};

const thStyle = { padding: "10px 12px", color: "#475569", fontWeight: 600 };
const tdStyle = { padding: "10px 12px", color: "#0f172a" };
