// src/pages/FinanceUploadPage.jsx
//
// Upload the monthly TCS payout sheet (xlsx / csv) and replace the Finance
// Master with it. Only Date, State, City, Zone, Resource Name, Mobile, Email,
// TCS Payout and Ground Payout are kept (plus Resource ID to group rows).
import { useRef, useState } from 'react';
import { FaFileUpload, FaCheckCircle } from 'react-icons/fa';
import { collection, db, doc, getDocs, writeBatch, serverTimestamp } from '../firestoreClient';
import { parseFinanceRows } from '../utils/financeParser';

const SUMMARY_COLLECTION = 'financemaster';
const ENTRIES_COLLECTION = 'financeentries';
const PEOPLE_PER_BATCH = 100; // two writes each (summary + entries)
const DELETES_PER_BATCH = 400;

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key) => {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1] || month} ${year}`;
};

export default function FinanceUploadPage() {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null); // { done, total, label }
  const [done, setDone] = useState(null);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setDone(null);
    setError('');
    setParsing(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (!rows.length) throw new Error('The sheet has no rows.');
      const parsed = parseFinanceRows(rows);
      if (parsed.error) throw new Error(parsed.error);
      setResult(parsed);
    } catch (err) {
      console.error('Finance sheet parse failed:', err);
      setError(err.message || 'Could not read this file.');
    } finally {
      setParsing(false);
    }
  };

  const replaceFinanceMaster = async () => {
    if (!result) return;
    const ok = window.confirm(
      `This replaces ALL existing Finance Master data with ${result.docs.length.toLocaleString('en-IN')} resources from "${fileName}". Continue?`
    );
    if (!ok) return;
    setError('');
    setDone(null);
    try {
      // Write the new data first, then remove resources that are no longer in
      // the sheet, so a failure part-way never leaves Finance empty.
      const total = result.docs.length;
      for (let i = 0; i < total; i += PEOPLE_PER_BATCH) {
        setProgress({ done: i, total, label: 'Uploading' });
        const batch = writeBatch();
        for (const person of result.docs.slice(i, i + PEOPLE_PER_BATCH)) {
          batch.set(doc(db, SUMMARY_COLLECTION, person.id), { ...person.summary, updated_at: serverTimestamp() });
          batch.set(doc(db, ENTRIES_COLLECTION, person.id), { resource_id: person.id, entries: person.entries });
        }
        await batch.commit();
      }

      setProgress({ done: total, total, label: 'Removing old data' });
      const keep = new Set(result.docs.map((p) => p.id));
      let removed = 0;
      for (const name of [SUMMARY_COLLECTION, ENTRIES_COLLECTION]) {
        const snapshot = await getDocs(collection(db, name));
        const stale = snapshot.docs.filter((d) => !keep.has(d.id));
        for (let i = 0; i < stale.length; i += DELETES_PER_BATCH) {
          const batch = writeBatch();
          stale.slice(i, i + DELETES_PER_BATCH).forEach((d) => batch.delete(doc(db, name, d.id)));
          await batch.commit();
        }
        if (name === SUMMARY_COLLECTION) removed = stale.length;
      }
      setDone({ resources: total, removed });
    } catch (err) {
      console.error('Finance upload failed:', err);
      setError(`Upload failed: ${err.message || err}. Existing data was not removed; you can retry.`);
    } finally {
      setProgress(null);
    }
  };

  const months = result ? Object.keys(result.monthTotals).sort() : [];
  const busy = parsing || !!progress;

  return (
    <div className="fup-page">
      <style>{`
        .fup-page { min-height: calc(100vh - 56px); background: #f5f7fa; }
        .fup-header { background: #fff; padding: 32px 32px 20px; border-bottom: 1px solid #dde1e7; }
        .fup-header h1 { margin: 0 0 6px; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .fup-header p { margin: 0; color: #64748b; font-size: 14px; }
        .fup-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 20px; max-width: 1000px; }
        .fup-card { background: #fff; border: 1px solid #dde1e7; border-radius: 10px; padding: 20px; }
        .fup-card h3 { margin: 0 0 10px; font-size: 15px; color: #111827; }
        .fup-cols { display: flex; flex-wrap: wrap; gap: 6px; }
        .fup-cols span { background: #f1f6d6; color: #3f4c0e; border-radius: 999px; padding: 3px 10px; font-size: 12px; }
        .fup-btn { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 6px; border: 1px solid #1976d2; background: #1976d2; color: #fff; font-size: 14px; cursor: pointer; }
        .fup-btn.secondary { background: #fff; color: #1976d2; }
        .fup-btn.danger { background: #c62828; border-color: #c62828; }
        .fup-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .fup-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .fup-stat { border: 1px solid #e5e9f0; border-radius: 8px; padding: 12px 14px; }
        .fup-stat b { display: block; font-size: 20px; color: #111827; margin-top: 2px; }
        .fup-stat small { color: #64748b; font-size: 12px; }
        .fup-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .fup-table th { text-align: left; background: #c2d45e; color: #243014; padding: 8px 10px; font-weight: 600; }
        .fup-table td { padding: 8px 10px; border-bottom: 1px solid #e5e9f0; font-variant-numeric: tabular-nums; }
        .fup-bar { height: 8px; background: #e5e9f0; border-radius: 4px; overflow: hidden; margin-top: 10px; }
        .fup-bar > div { height: 100%; background: #1976d2; transition: width 0.2s; }
        .fup-error { color: #b91c1c; font-size: 14px; }
        .fup-ok { color: #166534; display: flex; align-items: center; gap: 8px; font-size: 14px; }
      `}</style>

      <div className="fup-header">
        <h1>Finance Upload</h1>
        <p>Upload the TCS payout sheet to refresh the Finance section on the Dashboard.</p>
      </div>

      <div className="fup-body">
        <div className="fup-card">
          <h3>Columns that are saved</h3>
          <div className="fup-cols">
            {['Date', 'State', 'City', 'Zone', 'Resource Name', 'Mobile', 'Email', 'TCS Payout', 'Ground Payout'].map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p style={{ margin: '10px 0 16px', color: '#64748b', fontSize: 13 }}>
            Bank account, IFSC, PAN and Aadhar columns in the sheet are ignored and never stored. Resource ID is used only to group rows per person.
          </p>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          <button type="button" className="fup-btn secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            <FaFileUpload /> {parsing ? 'Reading file…' : fileName ? `Change file (${fileName})` : 'Choose Excel / CSV file'}
          </button>
        </div>

        {error && <div className="fup-card fup-error">{error}</div>}

        {result && (
          <div className="fup-card">
            <h3>Preview — {fileName}</h3>
            <div className="fup-stats">
              <div className="fup-stat"><small>Rows read</small><b>{result.totalRows.toLocaleString('en-IN')}</b></div>
              <div className="fup-stat"><small>Resources</small><b>{result.docs.length.toLocaleString('en-IN')}</b></div>
              <div className="fup-stat"><small>TCS payout (we receive)</small><b>{inr(result.tcsTotal)}</b></div>
              <div className="fup-stat"><small>Ground payout (resources earn)</small><b>{inr(result.groundTotal)}</b></div>
              <div className="fup-stat"><small>Margin</small><b>{inr(result.tcsTotal - result.groundTotal)}</b></div>
            </div>
            {(result.skipped.noDate > 0 || result.skipped.noResource > 0) && (
              <p className="fup-error" style={{ marginTop: 0 }}>
                Skipped rows: {result.skipped.noDate} without a valid date, {result.skipped.noResource} without a resource.
              </p>
            )}
            <table className="fup-table">
              <thead>
                <tr><th>Month</th><th>TCS payout</th><th>Ground payout</th><th>Margin</th></tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m}>
                    <td>{monthLabel(m)}</td>
                    <td>{inr(result.monthTotals[m].tcs)}</td>
                    <td>{inr(result.monthTotals[m].ground)}</td>
                    <td>{inr(result.monthTotals[m].tcs - result.monthTotals[m].ground)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 18 }}>
              <button type="button" className="fup-btn danger" onClick={replaceFinanceMaster} disabled={busy}>
                Replace Finance Master with this data
              </button>
            </div>
            {progress && (
              <>
                <div className="fup-bar"><div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
                <small style={{ color: '#64748b' }}>{progress.label}… {progress.done.toLocaleString('en-IN')} / {progress.total.toLocaleString('en-IN')}</small>
              </>
            )}
          </div>
        )}

        {done && (
          <div className="fup-card fup-ok">
            <FaCheckCircle /> Finance Master now holds {done.resources.toLocaleString('en-IN')} resources
            {done.removed ? ` (${done.removed.toLocaleString('en-IN')} old records removed)` : ''}. Open Dashboard → Finance to see it.
          </div>
        )}
      </div>
    </div>
  );
}
