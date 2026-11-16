'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileUp, LoaderCircle, MessageCircle, Plus, Save, Search, Star, X } from 'lucide-react';
import { PageHeading } from './Dashboard';
import { api, Badge, dateTime, Empty, ErrorNotice, Field, Loading, Modal, useResource } from './shared';
import { STATUS_LABELS, STATUSES, money, safeWebUrl } from '@/lib/domain';
import type { LeadRecord } from './types';
const ImportLeads = dynamic(() => import('./ImportLeads'));

const views = [
  { id: 'ALL', label: 'All leads', description: 'Every business in your workspace.' },
  { id: 'READY', label: 'Ready for outreach', description: 'New, verified contacts with a source, excluding opt-outs and previously enrolled emails. Campaign filters still apply.' },
  { id: 'UNVERIFIED', label: 'Needs research', description: 'New leads that need an email address, a source, or your verification.' },
  { id: 'STARRED', label: 'Starred', description: 'Businesses you have marked as a priority.' },
  { id: 'OPEN', label: 'Open opportunities', description: 'Active opportunities, excluding completed, lost, and opted-out leads.' },
] as const;
type LeadList = { leads: LeadRecord[]; total: number; page: number; pages: number };
type Props = { refresh: number; onChange: () => void; selectedLeadId?: string | null; onLeadClose?: () => void; initialView?: string };
function initialFilters(p: URLSearchParams, initialView?: string) {
  const candidateView = initialView || p.get('view');
  return {
    q: (p.get('q') || '').slice(0, 100), status: (STATUSES as readonly string[]).includes(p.get('status') || '') ? p.get('status')! : 'ALL',
    type: ['NO_WEBSITE', 'OUTDATED_WEBSITE'].includes(p.get('type') || '') ? p.get('type')! : 'ALL',
    view: views.some(v => v.id === candidateView) ? candidateView! : 'ALL',
    sort: ['priority', 'newest', 'oldest', 'value', 'name'].includes(p.get('sort') || '') ? p.get('sort')! : 'priority',
    page: Math.max(1, Math.min(100000, Number(p.get('page')) || 1)),
  };
}
export default function LeadsView({ refresh, onChange, selectedLeadId, onLeadClose, initialView }: Props) {
  const searchParams = useSearchParams();
  const filters = initialFilters(new URLSearchParams(searchParams.toString()), initialView);
  const urlSnapshot = searchParams.toString();
  const [searchDraft, setSearchDraft] = useState({ fromUrl: urlSnapshot, value: filters.q });
  // External navigation takes priority over an unfinished search draft.
  // Conditional render-time adjustment avoids an effect writing the old query back.
  let query = searchDraft.value;
  if (searchDraft.fromUrl !== urlSnapshot) {
    setSearchDraft({ fromUrl: urlSnapshot, value: filters.q });
    query = filters.q;
  }
  const [selected, setSelected] = useState<LeadRecord | 'new' | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [starring, setStarring] = useState<string | null>(null), [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (query === filters.q) return;
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      url.searchParams.delete('page');
      window.history.replaceState(null, '', url);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, filters.q]);
  const search = new URLSearchParams({ q: filters.q, status: filters.status, type: filters.type, view: filters.view, sort: filters.sort, page: String(filters.page) }).toString();
  const { data, error: loadError, loading, isRefreshing, retry } = useResource<LeadList>(`/api/leads?${search}`, refresh);
  function changeFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (!value || value === 'ALL' || (key === 'page' && value === '1') || (key === 'sort' && value === 'priority')) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    if (key !== 'page') url.searchParams.delete('page');
    if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
    setNotice('');
  }
  const clear = () => {
    const url = new URL(window.location.href);
    for (const key of ['q', 'view', 'status', 'type', 'sort', 'page']) url.searchParams.delete(key);
    setSearchDraft({ fromUrl: url.searchParams.toString(), value: '' });
    window.history.replaceState(null, '', url);
  };
  const activeFilters = Boolean(filters.q || filters.status !== 'ALL' || filters.type !== 'ALL' || filters.view !== 'ALL');
  const closeEditor = () => { setSelected(null); onLeadClose?.(); };
  const saved = () => { closeEditor(); setNotice('Lead saved. Your pipeline is up to date.'); setError(''); onChange(); };
  async function toggleStar(lead: LeadRecord) {
    setStarring(lead.id); setError('');
    try { await api(`/api/leads/${encodeURIComponent(lead.id)}`, 'PATCH', { isStarred: !lead.isStarred }); onChange(); }
    catch (e) { setError((e as Error).message); }
    finally { setStarring(null); }
  }
  async function exportLeads() {
    setExporting(true); setError('');
    try {
      const response = await fetch(`/api/leads/export?${search}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(response.status === 401 ? 'Your session expired. Sign in again to export.' : body.error || 'Could not export leads. Please try again.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'zero-web-leads.csv'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Export downloaded with your current filters and sort order.');
    } catch (e) { setError((e as Error).message); }
    finally { setExporting(false); }
  }
  return <>
    <PageHeading eyebrow="FROM DISCOVERY TO A PROJECT" title="Lead workspace" description="Research the right businesses, track conversations, and move your next project forward." action={<div className="button-row"><button className="btn secondary" disabled={exporting || !data?.total || query !== filters.q} onClick={exportLeads}>{exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{exporting ? 'Exporting…' : 'Export view'}</button><button className="btn secondary" onClick={() => setImporting(true)}><FileUp size={16} />Import CSV</button><button className="btn primary" onClick={() => setSelected('new')}><Plus size={17} />Add lead</button></div>} />
    <ErrorNotice message={error || loadError} />
    {notice ? <div className="notice info" role="status"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss confirmation" onClick={() => setNotice('')}><X size={16} /></button></div> : null}
    <div className="panel lead-workspace">
      <div className="lead-view-tabs" role="group" aria-label="Lead views">{views.map(view => <button key={view.id} className={filters.view === view.id ? 'active' : ''} aria-pressed={filters.view === view.id} onClick={() => changeFilter('view', view.id)}>{view.id === 'STARRED' ? <Star size={14} /> : null}{view.label}</button>)}</div>
      <div className="lead-toolbar">
        <label className="search-field"><Search size={18} /><input aria-label="Search leads" maxLength={100} placeholder="Search business, city, or email…" value={query} onChange={e => setSearchDraft({ fromUrl: urlSnapshot, value: e.target.value })} /></label>
        <select aria-label="Filter stage" value={filters.status} onChange={e => changeFilter('status', e.target.value)}><option value="ALL">All stages</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
        <select aria-label="Filter opportunity" value={filters.type} onChange={e => changeFilter('type', e.target.value)}><option value="ALL">All opportunities</option><option value="NO_WEBSITE">No website</option><option value="OUTDATED_WEBSITE">Website refresh</option></select>
        <select aria-label="Sort leads" value={filters.sort} onChange={e => changeFilter('sort', e.target.value)}><option value="priority">Priority & fit score</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="value">Highest deal value</option><option value="name">Business name</option></select>
      </div>
      <div className="lead-view-description"><p>{views.find(v => v.id === filters.view)?.description}</p>{activeFilters ? <button className="text-button" onClick={clear}>Clear filters <X size={13} /></button> : null}</div>
      {loading ? <Loading /> : null}
      {loadError && !data ? <Empty title="We couldn’t load your leads" text="Your saved records are unchanged. Check your connection and try again." action={<button className="btn secondary" onClick={retry}>Try again</button>} /> : null}
      {data && !data.leads.length ? <Empty title={activeFilters ? 'No leads match this view' : 'Your next project starts with a business.'} text={activeFilters ? 'Try a different stage or clear your filters to see more businesses.' : 'Add a business you know, or discover prospects in Automations.'} action={<button className="btn secondary" onClick={activeFilters ? clear : () => setSelected('new')}>{activeFilters ? 'Clear filters' : 'Add your first lead'}</button>} /> : null}
      {data?.leads.length ? <>
        <div className="table-scroll" aria-busy={isRefreshing}><table className="leads-table"><thead><tr><th><span className="sr-only">Priority</span><Star size={14} aria-hidden="true" /></th><th>Business</th><th>Opportunity</th><th>Contact</th><th>Fit score</th><th>Stage</th><th>Deal value</th><th><span className="sr-only">Open lead</span></th></tr></thead><tbody>{data.leads.map(lead => <tr key={lead.id}>
          <td data-label="Priority"><button className={`icon-button ${lead.isStarred ? 'starred' : ''}`} disabled={starring !== null || isRefreshing} aria-label={`${lead.isStarred ? 'Unstar' : 'Star'} ${lead.name}`} aria-pressed={lead.isStarred} onClick={() => toggleStar(lead)}>{starring === lead.id ? <LoaderCircle className="spin" size={16} /> : <Star size={16} fill={lead.isStarred ? 'currentColor' : 'none'} />}</button></td>
          <td data-label="Business"><button className="business-link" onClick={() => setSelected(lead)}><span className="business-avatar">{lead.name.slice(0, 2).toUpperCase()}</span><span><strong>{lead.name}</strong><small>{lead.category} · {lead.address || 'Location not added'}</small></span></button></td>
          <td data-label="Opportunity"><span className={`opportunity ${lead.leadType === 'NO_WEBSITE' ? '' : 'blue'}`}>{lead.leadType === 'NO_WEBSITE' ? 'No website' : 'Website refresh'}</span></td>
          <td data-label="Contact">{lead.email ? <><span className="contact-email">{lead.email}</span><small className={lead.emailVerified && lead.emailSource ? 'green-text' : 'amber-text'}>{lead.emailVerified && lead.emailSource ? 'Verified by you' : 'Needs verification'}</small></> : <span className="muted">Email needed</span>}</td>
          <td data-label="Fit score"><span className="score-indicator" aria-hidden="true"><i style={{ width: `${lead.score}%` }} /></span><strong className="score-number">{lead.score}<span className="sr-only"> out of 100</span></strong></td>
          <td data-label="Stage"><Badge value={lead.status} /></td><td data-label="Deal value" className="nowrap">{money(lead.dealValueCents)}</td><td><button className="icon-button" aria-label={`Open ${lead.name}`} onClick={() => setSelected(lead)}><ArrowRight size={17} /></button></td>
        </tr>)}</tbody></table></div>
        <div className="pagination"><span aria-live="polite">{(data.page - 1) * 25 + 1}–{Math.min(data.page * 25, data.total)} of {data.total.toLocaleString()} leads {isRefreshing ? '· Updating…' : ''}</span><div className="button-row"><span>Page {data.page} of {data.pages}</span><button className="btn secondary small" disabled={data.page === 1 || isRefreshing} onClick={() => changeFilter('page', String(data.page - 1))}><ArrowLeft size={15} />Previous</button><button className="btn secondary small" disabled={data.page >= data.pages || isRefreshing} onClick={() => changeFilter('page', String(data.page + 1))}>Next<ArrowRight size={15} /></button></div></div>
      </> : null}
    </div>
    {selected === 'new' ? <LeadEditor lead={null} close={closeEditor} saved={saved} /> : selected || selectedLeadId ? <LinkedLead key={selected?.id ?? selectedLeadId} id={selected?.id ?? selectedLeadId!} close={closeEditor} saved={saved} /> : null}
    {importing ? <ImportLeads onClose={() => setImporting(false)} onImported={() => { setNotice('New businesses imported. Review their details and verify contacts before outreach.'); onChange(); }} /> : null}
  </>;
}
function LinkedLead({ id, close, saved }: { id: string; close: () => void; saved: () => void }) {
  const { data, error, retry } = useResource<{ lead: LeadRecord }>(`/api/leads/${encodeURIComponent(id)}`);
  if (data) return <LeadEditor lead={data.lead} close={close} saved={saved} />;
  return <Modal title="Lead details" close={close}>{error ? <><ErrorNotice message={error} /><button className="btn secondary" onClick={retry}>Try again</button></> : <Loading />}</Modal>;
}
function LeadEditor({ lead, close, saved }: { lead: LeadRecord | null; close: () => void; saved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [email, setEmail] = useState(lead?.email ?? ''), [verified, setVerified] = useState(lead?.emailVerified ?? false);
  const [copied, setCopied] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const f = new FormData(e.currentTarget), data = Object.fromEntries(f.entries());
    const payload = { ...data, emailVerified: verified, ...(lead ? { expectedUpdatedAt: lead.updatedAt, dealValueCents: Math.round(Number(f.get('dealValueCents')) * 100), revenueCents: Math.round(Number(f.get('revenueCents')) * 100) } : {}) };
    try { await api(lead ? `/api/leads/${encodeURIComponent(lead.id)}` : '/api/leads', lead ? 'PATCH' : 'POST', payload); saved(); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function copyLink() {
    if (!lead) return;
    const url = new URL(window.location.origin); url.searchParams.set('tab', 'leads'); url.searchParams.set('lead', lead.id);
    try { await navigator.clipboard.writeText(url.href); setCopied(true); } catch { setError('Your browser could not copy the link. You can still open this lead from the workspace.'); }
  }
  const links = lead ? [{ label: 'Google Maps', url: lead.mapsUrl }, { label: 'Website', url: lead.websiteUrl }, { label: 'Demo / proposal', url: lead.demoUrl }].filter(l => safeWebUrl(l.url)) : [];
  return <Modal title={lead?.name ?? 'Add a business'} close={() => { if (!busy) close(); }} wide><form onSubmit={save}><ErrorNotice message={error} />
    {lead ? <div className="lead-context"><div className="button-row"><Badge value={lead.status} /><span className="muted">Fit score {lead.score}/100 · Added {dateTime(lead.createdAt)}</span></div>{lead.optedOutAt ? <div className="notice warning">This business is on your do not contact list. Changing its stage will not re-enable outreach.</div> : null}{lead.description ? <p>{lead.description}</p> : null}<div className="button-row">{links.map(link => <a key={link.label} className="btn secondary small" href={safeWebUrl(link.url)!} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={13} /></a>)}{lead.phone?.replace(/\D/g, '') ? <a className="btn secondary small" href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} />Open WhatsApp</a> : null}<button type="button" className="btn secondary small" onClick={copyLink}>{copied ? 'Link copied' : 'Copy lead link'}</button></div>{lead.phone ? <small className="muted">Opening WhatsApp does not mark a message as sent. Update the stage after sending.</small> : null}</div> : <p className="form-intro muted">Add the business details you know. You can research and verify its email later.</p>}
    <fieldset disabled={busy} className="lead-fields">
      <h3 className="lead-section-heading">Business details</h3>
      <div className="form-grid"><Field label="Business name"><input name="name" required maxLength={200} defaultValue={lead?.name ?? ''} placeholder="e.g. Kopi Corner" /></Field><Field label="Business type"><input name="category" required maxLength={100} defaultValue={lead?.category ?? ''} placeholder="e.g. Café" /></Field><Field label="City / address"><input name="address" maxLength={300} defaultValue={lead?.address ?? ''} placeholder="e.g. Petaling Jaya" /></Field><Field label="Phone"><input name="phone" type="tel" maxLength={40} defaultValue={lead?.phone ?? ''} placeholder="e.g. +60…" /></Field><Field label="Opportunity"><select name="leadType" defaultValue={lead?.leadType ?? 'NO_WEBSITE'}><option value="NO_WEBSITE">No website</option><option value="OUTDATED_WEBSITE">Website refresh</option></select></Field><Field label="Business website"><input name="websiteUrl" type="url" maxLength={2000} defaultValue={lead?.websiteUrl ?? ''} placeholder="https://…" /></Field></div>
      <h3 className="lead-section-heading">Contact & verification</h3>
      <div className="form-grid"><Field label="Business email"><input name="email" type="email" value={email} onChange={e => { setEmail(e.target.value); setVerified(false); }} required={verified} maxLength={254} placeholder="hello@business.com" /></Field><Field label="Email source" hint="Where you found or confirmed this business email."><input name="emailSource" required={verified} defaultValue={lead?.emailSource ?? ''} maxLength={500} placeholder="Business contact page or direct confirmation" /></Field></div><label className="checkbox-field"><input type="checkbox" name="emailVerified" checked={verified} onChange={e => setVerified(e.target.checked)} /><span>I checked that this email belongs to this business and is suitable for this offer.</span></label>
      {lead ? <><h3 className="lead-section-heading">Pipeline & next step</h3><div className="form-grid three"><Field label="Pipeline stage"><select name="status" defaultValue={lead.status}>{STATUSES.map(s => <option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select></Field><Field label="Deal value (MYR)"><input type="number" required min="0" max="1000000" step="0.01" name="dealValueCents" defaultValue={lead.dealValueCents / 100} /></Field><Field label="Collected revenue (MYR)"><input type="number" required min="0" max="1000000" step="0.01" name="revenueCents" defaultValue={lead.revenueCents / 100} /></Field></div><Field label="Demo / proposal link"><input name="demoUrl" type="url" maxLength={2000} defaultValue={lead.demoUrl ?? ''} placeholder="https://…" /></Field><Field label="Notes & next step"><textarea name="notes" rows={4} defaultValue={lead.notes ?? ''} maxLength={5000} placeholder="What do they need? What happens next?" /></Field>{lead.openingHours ? <details className="lead-details"><summary>Business hours & research</summary><p className="preserve-lines">{lead.openingHours}</p>{lead.services ? <p>{lead.services}</p> : null}{lead.rating ? <p>Google rating {lead.rating} · {lead.reviewCount ?? 0} reviews</p> : null}</details> : null}</> : null}
    </fieldset>
    <div className="modal-actions"><button type="button" className="btn secondary" onClick={close} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{busy ? 'Saving…' : lead ? 'Save lead' : 'Add lead'}</button></div>
  </form></Modal>;
}
