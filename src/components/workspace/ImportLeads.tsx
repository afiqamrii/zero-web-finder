'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, FileUp, Download, LoaderCircle, ArrowRight } from 'lucide-react';
import { api, ErrorNotice, Field, Modal } from './shared';
import type { ImportReport } from '@/lib/lead-import';
import './import-leads.css';

const example = 'name,category,address,email,phone,website,source,notes\nKopi Corner,Café,Petaling Jaya,hello@example.com,+60123456789,,Business card,Ask about menu and opening hours\n';

export default function ImportLeads({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const change = (value: string) => { setCsv(value); setReport(null); setError(''); };
  async function fileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    change(''); setFileName('');
    if (file.size > 120_000) { setError('Use a CSV file smaller than 120 KB.'); event.target.value = ''; return; }
    setBusy(true); setError('');
    try { change(await file.text()); setFileName(file.name); }
    catch { setError('Could not read this file. Try selecting it again.'); }
    finally { setBusy(false); }
  }
  function downloadExample() {
    const url = URL.createObjectURL(new Blob([example], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'lead-import-example.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function submit(dryRun: boolean) {
    setBusy(true); setError('');
    try {
      const result = await api<ImportReport>('/api/leads/import', 'POST', { csv, dryRun });
      setReport(result);
      if (result.summary.imported > 0) onImported();
    } catch (cause) { setError((cause as Error).message); setReport(null); }
    finally { setBusy(false); }
  }
  const completed = report?.dryRun === false;
  return <Modal title="Import business leads" wide close={() => { if (!busy) onClose(); }}>
    <div className="import-intro"><span className="import-icon"><FileUp size={25} /></span><div><h3>Your spreadsheet, ready to work.</h3><p>Preview up to 200 rows, fix missing details, and add new businesses to your pipeline.</p></div></div>
    <ErrorNotice message={error} />
    {completed ? <div className="import-success" role="status"><CheckCircle2 size={25} /><div><strong>{report.summary.imported} new {report.summary.imported === 1 ? 'business' : 'businesses'} imported</strong><p>{report.summary.duplicates} duplicate rows and {report.summary.invalid} invalid rows skipped. Existing leads are preserved.</p></div></div> : <fieldset disabled={busy} className="import-fields">
      <div className="import-file-row"><input ref={input} type="file" accept=".csv,text/csv" aria-label="Choose lead CSV file" onChange={fileSelected} /><button type="button" className="btn secondary small" onClick={downloadExample}><Download size={14} />Example CSV</button></div>
      <Field label={fileName ? 'CSV contents · ' + fileName : 'Or paste CSV contents'} hint="Required: name. Optional: category, address, email, phone, website, source, notes. Common headings such as Business Name, City, and Email Address also work."><textarea rows={6} value={csv} spellCheck={false} maxLength={120000} onChange={event => { change(event.target.value); setFileName(''); }} placeholder={'name,category,address,email,source\nKopi Corner,Café,Petaling Jaya,hello@example.com,Business card'} /></Field>
      <p className="import-footnote">Emails start unverified. A website link is treated as a refresh candidate for you to research, not an audited finding.</p>
    </fieldset>}
    {report ? <section className="import-preview" aria-label="Import preview">
      <div className="import-counts"><span><strong>{report.summary.total}</strong> rows</span><span className="green-text"><strong>{completed ? report.summary.imported : report.summary.ready}</strong> {completed ? 'imported' : 'ready'}</span><span><strong>{report.summary.duplicates}</strong> duplicates</span><span className="amber-text"><strong>{report.summary.invalid}</strong> need fixing</span></div>
      {report.ignoredHeaders.length > 0 ? <p className="import-footnote">Unused columns: {report.ignoredHeaders.join(', ')}</p> : null}
      <div className="import-table-scroll"><table><thead><tr><th>Row</th><th>Business</th><th>Result</th></tr></thead><tbody>{report.rows.map(row => <tr key={row.row}><td>{row.row}</td><td><strong>{row.values.name || 'Name missing'}</strong><small>{row.values.email || row.values.address || 'No email added'}</small></td><td><span className={'import-status ' + row.status}>{row.status === 'ready' ? 'Ready to import' : row.status}</span>{row.issues.map(issue => <small key={issue}>{issue}</small>)}</td></tr>)}</tbody></table></div>
    </section> : null}
    <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>{completed ? 'Done' : 'Cancel'}</button>{!completed ? <button type="button" className="btn primary" disabled={busy || !csv.trim() || (report !== null && report.summary.ready === 0)} onClick={() => submit(report === null)}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}{busy ? 'Processing…' : report ? `Import ${report.summary.ready} new leads` : 'Preview import'}</button> : null}</div>
  </Modal>;
}
