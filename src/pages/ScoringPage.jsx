// src/pages/ScoringPage.jsx
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { getMemberName, getMemberPhone } from "../utils/memberFields";
import {
  getLastThreeCompleteMonthsRange,
  countRegistrationsInRange,
  computeRegistrationTargetScore,
  computeCurrentMonthTaggingScores,
  TAGGING_GRACE_DAYS,
} from "../utils/scoring";

const CONFIG_DOC = doc(db, "config", "scoring");
const DEFAULT_TARGET = 2275;

const MONTH_FORMAT = { month: "short", year: "numeric" };
const DATE_FORMAT = { day: "2-digit", month: "short", year: "numeric" };

function formatRange(range) {
  const lastMonthInRange = new Date(range.end.getFullYear(), range.end.getMonth() - 1, 1);
  const startLabel = range.start.toLocaleDateString("en-IN", MONTH_FORMAT);
  const endLabel = lastMonthInRange.toLocaleDateString("en-IN", MONTH_FORMAT);
  return `${startLabel} – ${endLabel}`;
}

export default function ScoringPage({ memberRecords = [], membersLoading = false }) {
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [targetInput, setTargetInput] = useState(String(DEFAULT_TARGET));
  const [targetLoading, setTargetLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadTarget = async () => {
      try {
        const snap = await getDoc(CONFIG_DOC);
        if (cancelled) return;
        const storedTarget = snap.exists() ? snap.data().registrationTarget : null;
        const resolvedTarget = Number.isFinite(storedTarget) ? storedTarget : DEFAULT_TARGET;
        setTarget(resolvedTarget);
        setTargetInput(String(resolvedTarget));
      } catch (error) {
        console.error("Error loading scoring target:", error);
      } finally {
        if (!cancelled) setTargetLoading(false);
      }
    };

    void loadTarget();
    return () => { cancelled = true; };
  }, []);

  const handleSaveTarget = async () => {
    const parsed = parseInt(targetInput, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setSaveMessage("Enter a valid non-negative number.");
      return;
    }

    setSaving(true);
    setSaveMessage("");
    try {
      await setDoc(CONFIG_DOC, { registrationTarget: parsed }, { merge: true });
      setTarget(parsed);
      setSaveMessage("Target saved.");
    } catch (error) {
      console.error("Error saving scoring target:", error);
      setSaveMessage("Could not save target. Please try again.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(""), 2500);
    }
  };

  const registrationRange = useMemo(() => getLastThreeCompleteMonthsRange(), []);

  const registrationScore = useMemo(() => {
    const actual = countRegistrationsInRange(memberRecords, registrationRange);
    return computeRegistrationTargetScore(actual, target);
  }, [memberRecords, registrationRange, target]);

  const taggingRows = useMemo(
    () => computeCurrentMonthTaggingScores(memberRecords),
    [memberRecords]
  );

  const taggingSummary = useMemo(() => {
    const taggedCount = taggingRows.filter((row) => row.tagged).length;
    const totalScore = taggingRows.reduce((sum, row) => sum + row.score, 0);
    return { taggedCount, untaggedCount: taggingRows.length - taggedCount, totalScore };
  }, [taggingRows]);

  if (membersLoading || targetLoading) {
    return (
      <div style={{ padding: 32, color: "#64748b" }}>Loading scoring data…</div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", background: "#f5f7fa", minHeight: "calc(100vh - 56px)" }}>
      {/* Registration target section */}
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 style={sectionTitleStyle}>Registration Target Score</h2>
            <p style={sectionSubtitleStyle}>
              Last 3 complete months ({formatRange(registrationRange)}). Meeting the target scores 0;
              falling short scores the deficit as a negative number.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "#475569" }}>Target</label>
            <input
              type="number"
              min="0"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              style={{
                width: 100,
                padding: "6px 10px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <button
              onClick={handleSaveTarget}
              disabled={saving}
              style={{
                padding: "6px 14px",
                background: saving ? "#90caf9" : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saveMessage && <span style={{ fontSize: 12, color: "#0f766e" }}>{saveMessage}</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
          <StatBox label="Target" value={registrationScore.target.toLocaleString()} />
          <StatBox label="Actual" value={registrationScore.actual.toLocaleString()} />
          <StatBox
            label="Score"
            value={registrationScore.score}
            highlight={registrationScore.met ? "neutral" : "negative"}
          />
        </div>
      </section>

      {/* Tagging score section */}
      <section style={{ ...cardStyle, marginTop: 24 }}>
        <h2 style={sectionTitleStyle}>Tagging Score — Current Month</h2>
        <p style={sectionSubtitleStyle}>
          Members registered this month have {TAGGING_GRACE_DAYS} days to be tagged. Tagged members score 0;
          each day untagged beyond the grace period costs -1 point.
        </p>

        <div style={{ display: "flex", gap: 16, margin: "20px 0", flexWrap: "wrap" }}>
          <StatBox label="Registered This Month" value={taggingRows.length} />
          <StatBox label="Tagged" value={taggingSummary.taggedCount} />
          <StatBox label="Untagged" value={taggingSummary.untaggedCount} />
          <StatBox
            label="Total Tagging Score"
            value={taggingSummary.totalScore}
            highlight={taggingSummary.totalScore < 0 ? "negative" : "neutral"}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Registered On</th>
                <th style={thStyle}>Days Since Registration</th>
                <th style={thStyle}>Tagged</th>
                <th style={thStyle}>Score</th>
              </tr>
            </thead>
            <tbody>
              {taggingRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    No registrations this month yet.
                  </td>
                </tr>
              ) : (
                taggingRows.map((row) => (
                  <tr key={row.member.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={tdStyle}>{getMemberName(row.member)}</td>
                    <td style={tdStyle}>{getMemberPhone(row.member)}</td>
                    <td style={tdStyle}>{row.regDate.toLocaleDateString("en-IN", DATE_FORMAT)}</td>
                    <td style={tdStyle}>{row.daysSinceRegistration}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: row.tagged ? "#dcfce7" : "#fee2e2",
                        color: row.tagged ? "#15803d" : "#b91c1c",
                      }}>
                        {row.tagged ? "Yes" : "No"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: row.score < 0 ? "#dc2626" : "#0f172a", fontWeight: 600 }}>
                      {row.score}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatBox({ label, value, highlight = "neutral" }) {
  const color = highlight === "negative" ? "#dc2626" : "#0f172a";
  return (
    <div style={{
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: 10,
      padding: "14px 20px",
      minWidth: 140,
    }}>
      <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const cardStyle = {
  background: "#ffffff",
  borderRadius: 12,
  padding: "22px 24px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
};

const sectionTitleStyle = { margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" };
const sectionSubtitleStyle = { margin: "6px 0 0", fontSize: 13, color: "#64748b", maxWidth: 560 };
const thStyle = { padding: "10px 12px", color: "#475569", fontWeight: 600 };
const tdStyle = { padding: "10px 12px", color: "#0f172a" };
