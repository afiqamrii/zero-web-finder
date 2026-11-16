'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCheck, Clock3, Compass, LoaderCircle, Mail, Pause, Play, Plus, RefreshCw, Zap } from 'lucide-react';
import { PageHeading } from './Dashboard';
import { api, Badge, dateTime, Empty, ErrorNotice, Field, Loading, Modal, useResource } from './shared';
import type { DashboardData, JobRecord } from './types';

function scheduleLabel(hours: number) {
  if (!hours) return 'One-time search';
  if (hours === 24) return 'Daily';
  if (hours === 168) return 'Weekly';
  return hours % 24 ? `Every ${hours} hours` : `Every ${hours / 24} days`;
}

export default function AutomationView({ refresh, onChange, data: dashboard }: { refresh: number; onChange: () => void; data: DashboardData | null }) {
  const { data, error: loadError, retry } = useResource<{ jobs: JobRecord[] }>('/api/automation', refresh, 10000);
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobBusy, setJobBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');

  async function run() {
    if (busy) return;
    setBusy(true); setError(''); setNotice(''); setWarning('');
    try {
      const result = await api<{ busy: boolean; sent: number; discovered: number; warning?: string }>('/api/automation', 'POST');
      setNotice(result.busy ? 'A worker is already running. Progress will update here.' : `Run complete: ${result.discovered} leads found or refreshed, ${result.sent} emails accepted. Sending follows your settings and approved campaigns.`);
      setWarning(result.warning ?? '');
      onChange();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateJob(job: JobRecord, action: 'pause' | 'resume' | 'retry') {
    if (jobBusy) return;
    setJobBusy(job.id); setError(''); setNotice('');
    try {
      await api('/api/automation', 'PATCH', { id: job.id, action });
      setNotice(action === 'pause' ? `${job.category} in ${job.city} paused.` : `${job.category} in ${job.city} queued. The worker will pick it up.`);
      onChange();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setJobBusy('');
    }
  }

  return <>
    <PageHeading eyebrow="LESS REPEATING. MORE PROGRESS." title="Automations" description="Schedule focused searches and keep approved outreach moving." action={<button className="btn primary" onClick={() => setCreate(true)}><Plus size={17} />New lead search</button>} />
    <ErrorNotice message={error || loadError} />
    {loadError ? <button className="btn secondary" onClick={retry}><RefreshCw size={16} />Retry searches</button> : null}
    {notice ? <div className="notice info" role="status"><CheckCheck size={18} /><span>{notice}</span></div> : null}
    {warning ? <div className="notice warning" role="alert"><Clock3 size={18} /><span>{warning}</span></div> : null}
    <div className="worker-control panel">
      <span className="worker-icon"><Zap size={22} /></span>
      <div>
        <h3>{busy ? 'Working through the queue' : dashboard?.automation.label ?? 'Background worker'}</h3>
        <p>{busy ? 'Searches can take a few minutes. Closing this view does not cancel a running search.' : dashboard?.automation.detail ?? 'Waiting for the latest worker status.'}</p>
        <p>Last check-in: {dateTime(dashboard?.settings.lastWorkerAt)}</p>
        {dashboard?.settings.lastWorkerError ? <p className="red-text">{dashboard.settings.lastWorkerError}</p> : null}
      </div>
      <button className="btn secondary" onClick={run} disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{busy ? 'Running…' : 'Run queue now'}</button>
    </div>
    <div className="notice info"><Clock3 size={18} /><span><strong>Run queue now can send emails</strong> from approved campaigns when your sending switch and schedule allow it. To run searches only, turn off email sending in Settings first.</span></div>
    <div className="panel">
      <div className="panel-heading"><div><h2>Lead discovery searches</h2><p>{data ? `${data.jobs.filter(job => job.enabled).length} enabled · ${data.jobs.filter(job => job.status === 'FAILED').length} need attention · Latest 50 searches` : 'Your saved one-time and recurring searches.'}</p></div><Clock3 size={20} className="muted" /></div>
      {!data && !loadError ? <Loading /> : null}
      {data && !data.jobs.length ? <Empty title="Give your pipeline a regular check-in" text="Choose a business type and city. Each search keeps existing notes and contact edits when it finds a business again." action={<button className="btn primary" onClick={() => setCreate(true)}>Schedule a search <ArrowRight size={16} /></button>} /> : null}
      {data?.jobs.length ? <div className="table-scroll"><table>
        <thead><tr><th>Search</th><th>Schedule</th><th>Status</th><th>Last results</th><th>Next run</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.jobs.map(job => {
          const paused = !job.enabled && (job.intervalHours > 0 || job.status === 'QUEUED');
          const disabled = job.status === 'RUNNING' || !!jobBusy;
          return <tr key={job.id}>
            <td><strong>{job.category}</strong><small>{job.city} · {job.mode === 'no_website' ? 'No website' : 'Website refresh'}</small>{job.error ? <small className="red-text">{job.error}</small> : null}</td>
            <td>{scheduleLabel(job.intervalHours)}<small>Up to {job.limit} leads</small></td>
            <td><Badge value={paused ? 'PAUSED' : job.status} /></td>
            <td>{job.status === 'RUNNING' ? 'Searching…' : job.status === 'COMPLETED' ? job.resultCount : '—'}<small>{job.lastRunAt ? `Last attempt ${dateTime(job.lastRunAt)}` : 'Not run yet'}</small></td>
            <td>{job.status === 'RUNNING' ? 'In progress' : job.enabled ? dateTime(job.nextRunAt) : job.intervalHours || paused ? 'Paused' : 'Not scheduled'}</td>
            <td><div className="inline-actions">
              {job.status === 'FAILED' ? <button className="btn secondary small" disabled={disabled} onClick={() => updateJob(job, 'retry')} aria-label={`Retry ${job.category} in ${job.city}`}><RefreshCw size={14} />Retry</button> : null}
              {job.enabled ? <button className="btn secondary small" disabled={disabled} onClick={() => updateJob(job, 'pause')} aria-label={`Pause ${job.category} in ${job.city}`}><Pause size={14} />{jobBusy === job.id ? 'Updating…' : 'Pause'}</button> : job.status !== 'FAILED' ? <button className="btn secondary small" disabled={disabled} onClick={() => updateJob(job, job.intervalHours ? 'resume' : 'retry')} aria-label={`${job.intervalHours ? 'Resume' : 'Run again'} ${job.category} in ${job.city}`}><Play size={14} />{jobBusy === job.id ? 'Updating…' : job.intervalHours ? 'Resume' : 'Run again'}</button> : null}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : null}
    </div>
    <div className="automation-flow">
      <div><span className="flow-icon"><Compass size={23} /></span><small>01 · DISCOVER</small><h3>Find relevant businesses</h3><p>Run a focused search once, daily, or weekly.</p></div><ArrowRight className="flow-arrow" size={22} />
      <div><span className="flow-icon"><CheckCheck size={23} /></span><small>02 · QUALIFY</small><h3>Verify the contact</h3><p>Review the business email and record its source.</p></div><ArrowRight className="flow-arrow" size={22} />
      <div><span className="flow-icon"><Mail size={23} /></span><small>03 · CONNECT</small><h3>Approve your outreach</h3><p>Sending follows your daily cap and Malaysia-time schedule.</p></div>
    </div>
    {create ? <DiscoveryForm close={() => setCreate(false)} saved={reused => { setCreate(false); setNotice(reused ? 'A matching search is already queued or running. Its existing schedule was kept.' : 'Search queued. The background worker will pick it up, or use Run queue now.'); onChange(); }} /> : null}
  </>;
}

function DiscoveryForm({ close, saved }: { close: () => void; saved: (reused: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ reused?: boolean }>('/api/search', 'POST', { ...Object.fromEntries(form.entries()), intervalHours: Number(form.get('intervalHours')), limit: Number(form.get('limit')) });
      saved(result.reused === true);
    } catch (error) {
      setError((error as Error).message); setBusy(false);
    }
  }
  const dismiss = () => { if (!busy) close(); };

  return <Modal title="Find your next opportunity" close={dismiss}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      <p className="muted form-intro">Start with a focused market. Each search finds businesses that may benefit from your web services.</p>
      <fieldset disabled={busy}>
        <Field label="City or area"><input name="city" required maxLength={100} defaultValue="Kuala Lumpur" /></Field>
        <Field label="Business type"><input name="category" list="business-types" placeholder="e.g. Café, clinic, salon, contractor" required maxLength={100} /></Field>
        <datalist id="business-types">{['Café', 'Restaurant', 'Dental clinic', 'Salon', 'Gym', 'Tuition centre', 'Car workshop', 'Interior designer', 'Contractor', 'Bakery', 'Florist'].map(value => <option key={value}>{value}</option>)}</datalist>
        <Field label="Opportunity"><select name="mode"><option value="no_website">Businesses without a website</option><option value="outdated_website">Websites that may need a refresh</option></select></Field>
        <div className="form-grid">
          <Field label="Leads per search"><input name="limit" type="number" defaultValue={10} min={1} max={30} required /></Field>
          <Field label="Repeat"><select name="intervalHours"><option value={0}>Just once</option><option value={24}>Every day</option><option value={48}>Every 2 days</option><option value={168}>Every week</option></select></Field>
        </div>
        <p className="muted fine-print">Public business details may be incomplete. Website assessments are signals to review, not a technical audit. Contact emails need your verification before enrollment.</p>
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={dismiss}>Cancel</button><button className="btn primary" disabled={busy}><Compass size={16} />{busy ? 'Queuing…' : 'Queue search'}</button></div>
      </fieldset>
    </form>
  </Modal>;
}
