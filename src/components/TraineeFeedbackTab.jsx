// src/components/TraineeFeedbackTab.jsx
// "Trainee Feedback" tab of the workshop detail modal: the feedback trainees
// submitted in the member app, read from
//   workshopsmaster/{workshopId}/feedback/{userId}
//   { overall_rating, topic_relevance, topic_clarity, session_engagement (1–5),
//     duration_appropriate, participant_category, attended, comments, submitted_at, user_doc_ref }
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaSyncAlt, FaStar } from "react-icons/fa";
import { collection, db, getDocs } from "../firestoreClient";
import { getMemberName, getMemberPhone } from "../utils/memberFields";
import { formatDateTimeDDMMMYYYY } from "../utils/dateFormat";

const RATINGS = [
  { key: "overall_rating", label: "Overall" },
  { key: "topic_relevance", label: "Topic relevance" },
  { key: "topic_clarity", label: "Topic clarity" },
  { key: "session_engagement", label: "Engagement" },
];

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ratingOf = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const average = (values) => {
  const valid = values.filter((v) => v !== null);
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
};

function Stars({ value }) {
  if (value === null || value === undefined) return <span className="tft-muted">-</span>;
  return (
    <span className="tft-stars" title={`${value} out of 5`}>
      <FaStar size={11} /> {Number.isInteger(value) ? value : value.toFixed(1)}
    </span>
  );
}

export default function TraineeFeedbackTab({ session, memberById }) {
  const [state, setState] = useState({ loading: Boolean(session.workshopId), error: "", items: [] });
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!session.workshopId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "workshopsmaster", session.workshopId, "feedback"));
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const refPath = data.user_doc_ref?.path || "";
          return { id: docSnap.id, userId: refPath ? refPath.split("/").pop() : docSnap.id, ...data };
        });
        items.sort((a, b) => toMillis(b.submitted_at) - toMillis(a.submitted_at));
        if (!cancelled) setState({ loading: false, error: "", items });
      } catch (error) {
        console.error("Error loading trainee feedback:", error);
        if (!cancelled) setState({ loading: false, error: "Could not load trainee feedback. Please try again.", items: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.workshopId, reloadKey]);

  const { items, loading, error } = state;

  const summary = useMemo(() => {
    const averages = Object.fromEntries(RATINGS.map(({ key }) => [key, average(items.map((item) => ratingOf(item[key])))]));
    const durations = new Map();
    items.forEach((item) => {
      const answer = String(item.duration_appropriate || "").trim();
      if (answer) durations.set(answer, (durations.get(answer) || 0) + 1);
    });
    return { averages, durations: [...durations.entries()].sort((a, b) => b[1] - a[1]) };
  }, [items]);

  const nameOf = (userId) => {
    const member = memberById.get(userId);
    return member ? getMemberName(member) : "Unknown member";
  };

  return (
    <>
      <style>{`
        .tft-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
        .tft-head h4 { margin: 0; font-size: 15px; color: #0f172a; }
        .tft-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .tft-tile { background: #f8fafc; border: 1px solid #e5eaf1; border-radius: 10px; padding: 12px 14px; }
        .tft-tile .v { font-size: 22px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px; }
        .tft-tile .v svg { color: #f59e0b; }
        .tft-tile .l { font-size: 12px; color: #64748b; margin-top: 2px; }
        .tft-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; font-size: 12px; color: #334155; align-items: center; }
        .tft-chip { background: #f1f5f9; border-radius: 999px; padding: 4px 10px; }
        .tft-stars { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: #0f172a; white-space: nowrap; }
        .tft-stars svg { color: #f59e0b; }
        .tft-muted { color: #94a3b8; }
        .tft-comment { max-width: 320px; white-space: pre-wrap; word-break: break-word; }
      `}</style>

      <div className="tft-head">
        <h4>Trainee feedback{items.length ? ` (${items.length})` : ""}</h4>
        {session.workshopId && (
          <button type="button" className="wsd-btn" onClick={load} disabled={loading}>
            <FaSyncAlt size={11} /> {loading ? "Loading…" : "Refresh"}
          </button>
        )}
      </div>

      {!session.workshopId ? (
        <div className="wsd-empty">This workshop is not linked to a workshop in the member app, so there is no trainee feedback.</div>
      ) : error ? (
        <div className="wsd-note" role="alert">{error}</div>
      ) : loading && items.length === 0 ? (
        <div className="wsd-empty">Loading feedback…</div>
      ) : items.length === 0 ? (
        <div className="wsd-empty">No trainee feedback yet. Feedback submitted in the member app will appear here.</div>
      ) : (
        <>
          <div className="tft-summary">
            <div className="tft-tile">
              <div className="v">{items.length}</div>
              <div className="l">{items.length === 1 ? "Response" : "Responses"}</div>
            </div>
            {RATINGS.map(({ key, label }) => (
              <div className="tft-tile" key={key}>
                <div className="v">
                  {summary.averages[key] === null ? "-" : <><FaStar size={16} />{summary.averages[key].toFixed(1)}</>}
                </div>
                <div className="l">{label} (avg of 5)</div>
              </div>
            ))}
          </div>

          {summary.durations.length > 0 && (
            <div className="tft-chips">
              <b>Session length:</b>
              {summary.durations.map(([answer, count]) => (
                <span className="tft-chip" key={answer}>{answer} · {count}</span>
              ))}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table className="wsd-table">
              <thead>
                <tr>
                  <th>#</th><th>Trainee</th><th>Category</th>
                  {RATINGS.map(({ key, label }) => <th key={key}>{label}</th>)}
                  <th>Session length</th><th>Comments</th><th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const member = memberById.get(item.userId);
                  return (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{nameOf(item.userId)}</div>
                        {member && getMemberPhone(member) && <div className="tft-muted" style={{ fontSize: 12 }}>{getMemberPhone(member)}</div>}
                        {item.attended === false && <div style={{ fontSize: 11, color: "#b45309" }}>Says did not attend</div>}
                      </td>
                      <td>{item.participant_category || "-"}</td>
                      {RATINGS.map(({ key }) => <td key={key}><Stars value={ratingOf(item[key])} /></td>)}
                      <td>{item.duration_appropriate || "-"}</td>
                      <td className="tft-comment">{item.comments ? String(item.comments) : <span className="tft-muted">-</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{item.submitted_at ? formatDateTimeDDMMMYYYY(item.submitted_at.toDate ? item.submitted_at.toDate() : item.submitted_at) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
