'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, Check, CheckCircle2, Circle, Clipboard, FileText, FlaskConical, ListChecks, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { PageHeading } from './Dashboard';
import { Badge, dateTime, Empty, ErrorNotice, Field, Loading, Modal, useResource } from './shared';
import type { InsightsResponse, OpportunityRecord } from '@/lib/opportunity';
import './insights.css';

type Props = { refresh: number; onChange?: () => void; goToLead: (id: string) => void };
const groups = [{ id: 'all', label: 'All opportunities' }, { id: 'outreach', label: 'Prepare outreach' }, { id: 'research', label: 'Research next' }, { id: 'conversation', label: 'Conversations' }];
export default function InsightsView({ refresh, goToLead }: Props) {
  const { data, error, loading, isRefreshing, retry } = useResource<InsightsResponse>('/api/insights', refresh);
  const [group, setGroup] = useState('all'), [query, setQuery] = useState(''), [selected, setSelected] = useState<OpportunityRecord | null>(null);
  const needle = query.trim().toLocaleLowerCase();
  const visible = data?.opportunities.filter(item => (group === 'all' || item.analysis.nextAction.group === group) && (!needle || `${item.lead.name} ${item.lead.category} ${item.lead.address}`.toLocaleLowerCase().includes(needle))) ?? [];
  return <div className="insights-view">
    <PageHeading eyebrow="A CLEARER NEXT MOVE" title="Opportunity studio" description="Turn saved business evidence into a focused research plan, a relevant brief, and your next action." action={<button className="btn secondary" disabled={isRefreshing} onClick={retry}><RefreshCw className={isRefreshing ? 'spin' : ''} size={16} />{isRefreshing ? 'Analyzing…' : 'Recalculate'}</button>} />
    <section className="insights-intro"><div><span className="insights-local"><FlaskConical size={15} />Local rules · no external AI</span><h2>Know why a lead comes first.</h2><p>Five transparent signals rank the work in front of you. Open any business to see its evidence, missing research, and a draft you can make your own.</p></div><div className="insights-principles"><span><ShieldCheck size={17} />Opt-outs and closed records stay excluded</span><span><ListChecks size={17} />Every score shows its working</span><span><FileText size={17} />Drafts are editable and never sent here</span></div></section>
    <ErrorNotice message={error} />
    {error ? <button className="btn secondary" onClick={retry}>Try analysis again</button> : null}
    {loading ? <Loading /> : data ? <>
      <div className="insights-metrics">{[
        { label: 'Prepare an introduction', value: data.summary.ready, detail: 'Contacts ready for your campaign review', filter: 'outreach' },
        { label: 'Research next', value: data.summary.research, detail: 'Evidence or contact details to complete', filter: 'research' },
        { label: 'Keep the conversation moving', value: data.summary.conversations, detail: 'Existing outreach, replies, calls, or proposals', filter: 'conversation' },
      ].map(metric => <button key={metric.filter} className={group === metric.filter ? 'active' : ''} onClick={() => setGroup(metric.filter)}><span>{metric.label}<ArrowUpRight size={16} /></span><strong>{metric.value.toLocaleString()}</strong><small>{metric.detail}</small></button>)}</div>
      <div className="insights-coverage"><BarChart3 size={17} /><p>Analyzed <strong>{data.coverage.scanned.toLocaleString()}</strong> of {data.coverage.totalOpen.toLocaleString()} saved open leads. Showing the highest-ranked {data.coverage.returned.toLocaleString()}{data.coverage.excluded ? `; ${data.coverage.excluded} suppressed ${data.coverage.excluded === 1 ? 'record was' : 'records were'} excluded` : ''}. <span>Last calculated {dateTime(data.generatedAt)}.</span></p></div>
      {data.coverage.scanCapped || data.coverage.resultCapped ? <div className="notice warning">Analysis checks the {data.coverage.scanLimit} most recently updated open records and displays at most {data.coverage.resultLimit} recommendations. Counts above describe the checked sample; search and filters below apply only to the displayed recommendations.</div> : null}
      <div className="panel insights-list"><div className="panel-heading"><div><h2>Where to focus</h2><p>Ranked by the combined signal score. This is a work priority, not a chance of winning.</p></div><span className="section-count">{visible.length} shown</span></div>
        <div className="view-tabs" role="group" aria-label="Opportunity views">{groups.map(item => <button key={item.id} className={group === item.id ? 'active' : ''} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.label}</button>)}</div>
        <div className="lead-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Search analyzed opportunities" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="Find a business, category, or location" /></label></div>
        {visible.length ? <div className="insights-rows">{visible.map(item => <button key={item.lead.id} className="insights-row" onClick={() => setSelected(item)} aria-label={`Analyze ${item.lead.name}`}><span className="insights-score"><strong>{item.analysis.score}</strong><small>/ 100</small></span><span className="insights-business"><strong>{item.lead.name}</strong><small>{item.lead.category || 'Business'} · {item.lead.address || 'Location not saved'}</small><span className={`insights-action ${item.analysis.nextAction.group}`}>{item.analysis.nextAction.label}</span></span><span className="insights-evidence"><strong>{item.analysis.evidence.present} / {item.analysis.evidence.total}</strong><small>evidence fields</small></span><ArrowUpRight size={18} /></button>)}</div> : <Empty title={query || group !== 'all' ? 'No opportunities in this view' : 'Start with a few real businesses'} text={query || group !== 'all' ? 'Try another search or return to all opportunities.' : 'Add or discover leads first. The studio will explain the signals in your saved records.'} action={query || group !== 'all' ? <button className="btn secondary" onClick={() => { setGroup('all'); setQuery(''); }}>Clear studio filters</button> : undefined} />}
      </div>
      <details className="insights-method"><summary><FlaskConical size={16} />How this analysis works</summary><p>The score adds website need (25 points), contact readiness (20), saved review traction (20), recorded sales momentum (20), and evidence coverage (15). Missing evidence earns fewer points; it is not evidence of a poor business.</p><p>The analysis reads saved records and checks saved suppression, duplicate-contact, and enrollment history. It does not browse websites, measure website performance, infer a client’s budget, or predict conversion. You still need access to your workspace database to load the studio. No paid model or external AI request is used.</p><p>Contact details and consent can change after calculation. The sending workflow performs its own checks and still requires an approved campaign.</p>{data.summary.categories.length ? <div className="insights-categories">{data.summary.categories.map(category => <span key={category.name}>{category.name}<strong>{category.count}</strong></span>)}</div> : null}</details>
    </> : null}
    {selected ? <OpportunityDetail key={selected.lead.id} item={selected} close={() => setSelected(null)} goToLead={goToLead} /> : null}
  </div>;
}

function OpportunityDetail({ item, close, goToLead }: { item: OpportunityRecord; close: () => void; goToLead: (id: string) => void }) {
  const { lead, analysis } = item;
  const [draft, setDraft] = useState(analysis.canPrepareOutreach ? 'pitch' : 'brief');
  const [subject, setSubject] = useState(analysis.drafts?.subject || '');
  const [pitch, setPitch] = useState(analysis.drafts?.pitch || '');
  const [brief, setBrief] = useState(analysis.drafts?.brief || '');
  const [copied, setCopied] = useState(''), [error, setError] = useState('');
  async function copy() {
    setError('');
    try { await navigator.clipboard.writeText(draft === 'pitch' ? `Subject: ${subject}\n\n${pitch}` : brief); setCopied(draft); }
    catch { setError('Copy is unavailable in this browser. Select the text below and copy it manually.'); }
  }
  return <Modal title={lead.name} close={close} wide><div className="insights-detail">
    <div className="insights-detail-top"><span className="insights-score large"><strong>{analysis.score}</strong><small>priority / 100</small></span><div><Badge value={lead.status} /><p>{lead.category} · {lead.address || 'Location not saved'}</p><small>Evidence present: {analysis.evidence.present}/{analysis.evidence.total}. Accuracy still needs your review.</small></div></div>
    <section className="insights-next"><Sparkles size={20} /><div><h3>{analysis.nextAction.label}</h3><p>{analysis.nextAction.detail}</p></div><button className="btn secondary small" onClick={() => { close(); goToLead(lead.id); }}>Open lead <ArrowRight size={15} /></button></section>
    <h3 className="insights-section-title">The score, explained</h3>
    <div className="insights-breakdown">{analysis.components.map(component => <div key={component.id}><div><strong>{component.label}</strong><span>{component.points} / {component.max}</span></div><meter min={0} max={component.max} value={component.points} aria-label={component.label} /><p>{component.reason}</p></div>)}</div>
    <h3 className="insights-section-title">Research checklist</h3><p className="insights-note">Checks show what is present in saved records. They do not certify that the evidence is correct.</p>
    <div className="insights-checklist">{analysis.checklist.map(check => <div key={check.id}>{check.complete ? <CheckCircle2 size={18} className="green-text" /> : <Circle size={18} />}<div><strong>{check.label}</strong><p>{check.detail}</p></div><span>{check.complete ? 'Saved' : 'Review'}</span></div>)}</div>
    <section className="insights-drafts"><h3 className="insights-section-title">Make the next step concrete</h3><p className="insights-note">Working drafts from saved facts and suggested scope. Edits last until this panel closes; copy them to keep your changes.</p>
      <div className="view-tabs" role="group" aria-label="Draft type">{analysis.canPrepareOutreach ? <button className={draft === 'pitch' ? 'active' : ''} aria-pressed={draft === 'pitch'} onClick={() => { setDraft('pitch'); setCopied(''); }}>Introduction</button> : null}<button className={draft === 'brief' ? 'active' : ''} aria-pressed={draft === 'brief'} onClick={() => { setDraft('brief'); setCopied(''); }}>Project brief</button></div>
      {!analysis.canPrepareOutreach ? <div className="notice info">A new introduction is held while you {analysis.nextAction.label.toLowerCase()}. You can still prepare a working project brief.</div> : null}
      {draft === 'pitch' ? <><Field label="Draft subject"><input value={subject} maxLength={300} onChange={event => { setSubject(event.target.value); setCopied(''); }} /></Field><Field label="Introduction draft"><textarea rows={11} value={pitch} maxLength={8000} onChange={event => { setPitch(event.target.value); setCopied(''); }} /></Field></> : <Field label="Working project brief"><textarea rows={15} value={brief} maxLength={12000} onChange={event => { setBrief(event.target.value); setCopied(''); }} /></Field>}
      <ErrorNotice message={error} /><div className="insights-copy"><button className="btn secondary" onClick={copy}>{copied === draft ? <Check size={16} /> : <Clipboard size={16} />}{copied === draft ? 'Copied' : draft === 'pitch' ? 'Copy introduction' : 'Copy project brief'}</button><span role="status">{copied === draft ? 'Copied to your clipboard.' : 'Nothing is sent or approved here.'}</span></div>
    </section>
    <p className="insights-note insights-disclaimer">{analysis.caveats.join(' ')}</p>
  </div></Modal>;
}
