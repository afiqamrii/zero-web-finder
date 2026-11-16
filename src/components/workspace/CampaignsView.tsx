'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCheck, Copy, Eye, Mail, Pause, Play, Plus, RefreshCw, Users } from 'lucide-react';
import { PageHeading } from './Dashboard';
import { api, Badge, dateTime, Empty, ErrorNotice, Field, Loading, Modal, useResource } from './shared';
import type { CampaignRecord } from './types';

const initialBody = 'Hi {{business}} team,\n\nI’m {{sender}}, a freelance web developer. I came across your business and wanted to introduce my website services.\n\n{{offer}} — with a clean mobile layout, your services, and a clear way for customers to get in touch.\n\nWould a short conversation about your website plans be useful? Happy to share a few ideas if this is relevant.\n\nBest,\n{{sender}}';
const filters = [{ id: 'ALL', label: 'All campaigns' }, { id: 'DRAFT', label: 'Drafts' }, { id: 'ACTIVE', label: 'Approved' }, { id: 'PAUSED', label: 'Paused' }] as const;

export default function CampaignsView({ refresh, onChange }: { refresh: number; onChange: () => void }) {
  const { data, error: loadError, retry } = useResource<{ campaigns: CampaignRecord[] }>('/api/campaigns', refresh, 15000);
  const [create, setCreate] = useState<{ source?: CampaignRecord } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const campaigns = data?.campaigns.filter(campaign => filter === 'ALL' || campaign.status === filter) ?? [];

  async function action(campaign: CampaignRecord, action: 'pause' | 'resume') {
    if (busy) return;
    setBusy(campaign.id);
    setError('');
    setNotice('');
    try {
      await api(`/api/campaigns/${campaign.id}`, 'PATCH', { action });
      setNotice(`${campaign.name} ${action === 'pause' ? 'paused. An email already being sent cannot be recalled.' : 'resumed. Sending still follows the master switch, schedule, and daily limit.'}`);
      onChange();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy('');
    }
  }

  return <>
    <PageHeading eyebrow="RELEVANT OUTREACH, REVIEWED BY YOU" title="Email campaigns" description="Choose the audience, review the message, and track approved campaigns." action={<button className="btn primary" onClick={() => setCreate({})}><Plus size={17} />New campaign</button>} />
    <ErrorNotice message={error || loadError} />
    {loadError ? <button className="btn secondary" onClick={retry}><RefreshCw size={16} />Retry campaigns</button> : null}
    {notice ? <div className="notice info" role="status"><CheckCheck size={18} /><span>{notice}</span></div> : null}
    <div className="notice info"><CheckCheck size={18} /><span>Drafts never send. Approved campaigns still need the sending switch, a connected worker, and an open sending window.</span></div>
    <div className="view-tabs" aria-label="Filter campaigns">{filters.map(item => <button key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}<span>{data?.campaigns.filter(campaign => item.id === 'ALL' || campaign.status === item.id).length ?? 0}</span></button>)}</div>
    {!data && !loadError ? <Loading /> : null}
    {data && !campaigns.length ? <div className="panel"><Empty title={data.campaigns.length ? 'No campaigns in this view' : 'Start your first conversation'} text={data.campaigns.length ? 'Choose another view or create a new campaign.' : 'Save a draft, inspect personalized examples, then approve the campaign when it is ready.'} action={<button className="btn primary" onClick={() => data.campaigns.length ? setFilter('ALL') : setCreate({})}>{data.campaigns.length ? 'Show all campaigns' : 'Create a campaign'}<ArrowRight size={16} /></button>} /></div> : null}
    <div className="campaign-grid">{campaigns.map(campaign => <article className="panel campaign-card" key={campaign.id}>
      <div className="campaign-top"><span className="campaign-icon"><Mail size={21} /></span><Badge value={campaign.status} /></div>
      <h2>{campaign.name}</h2>
      <p>{[campaign.category || 'All business types', campaign.city || 'All locations'].join(' · ')}</p>
      <div className="campaign-subject">{campaign.subject}</div>
      <div className="campaign-stats">
        <span><strong>{campaign._count.enrollments}</strong><small>Enrolled</small></span>
        <span><strong>{campaign.eligible}</strong><small>New eligible leads</small></span>
        <span><strong>{campaign.followUpBody ? '1' : '0'}</strong><small>Follow-up</small></span>
      </div>
      <div className="campaign-policy"><Users size={14} />{campaign.autoEnroll ? 'Ongoing enrollment of new matching contacts' : 'Audience fixed at approval'}</div>
      <p className="campaign-meta">{campaign.approvedAt ? `Approved ${dateTime(campaign.approvedAt)}` : 'Draft · no sending authorized'}</p>
      <div className="button-row">
        <button className="btn secondary" onClick={() => setPreview(campaign.id)}><Eye size={15} />{campaign.status === 'DRAFT' ? 'Review & approve' : 'View campaign'}</button>
        {campaign.status === 'ACTIVE' ? <button className="btn secondary" disabled={!!busy} onClick={() => action(campaign, 'pause')}><Pause size={15} />{busy === campaign.id ? 'Pausing…' : 'Pause'}</button> : campaign.status === 'PAUSED' ? <button className="btn primary" disabled={!!busy} onClick={() => action(campaign, 'resume')}><Play size={15} />{busy === campaign.id ? 'Resuming…' : 'Resume'}</button> : null}
      </div>
      <button className="text-button campaign-meta" onClick={() => setCreate({ source: campaign })}><Copy size={14} />Duplicate as new draft</button>
    </article>)}</div>
    {create ? <CampaignForm source={create.source} close={() => setCreate(null)} saved={id => { setCreate(null); setPreview(id); onChange(); }} /> : null}
    {preview ? <CampaignPreview key={preview} id={preview} close={() => setPreview(null)} saved={() => { setPreview(null); setNotice('Campaign approved. The worker sends only when your sending controls allow it.'); onChange(); }} /> : null}
  </>;
}

function CampaignForm({ source, close, saved }: { source?: CampaignRecord; close: () => void; saved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ campaign: CampaignRecord }>('/api/campaigns', 'POST', { ...Object.fromEntries(form.entries()), minScore: Number(form.get('minScore')), followUpDays: Number(form.get('followUpDays')), autoEnroll: form.get('autoEnroll') === 'on' });
      saved(result.campaign.id);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  const dismiss = () => { if (!busy) close(); };

  return <Modal title={source ? 'Duplicate campaign as a draft' : 'Create an email campaign'} close={dismiss} wide>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      {source ? <p className="notice info">Copy and audience rules are prefilled. Previous recipients are excluded, and this new draft needs its own approval.</p> : null}
      <fieldset disabled={busy}>
        <Field label="Campaign name"><input name="name" required maxLength={120} placeholder="e.g. Local businesses · Website introduction" defaultValue={source ? `Copy of ${source.name}`.slice(0, 120) : ''} /></Field>
        <div className="form-section-title">01 <span>Choose your audience</span></div>
        <div className="form-grid">
          <Field label="City contains"><input name="city" placeholder="Any location" maxLength={100} defaultValue={source?.city} /></Field>
          <Field label="Business type contains"><input name="category" placeholder="Any business type" maxLength={100} defaultValue={source?.category} /></Field>
          <Field label="Opportunity"><select name="leadType" defaultValue={source?.leadType ?? 'ALL'}><option value="ALL">All opportunities</option><option value="NO_WEBSITE">No website</option><option value="OUTDATED_WEBSITE">Website refresh</option></select></Field>
          <Field label="Minimum fit score"><input name="minScore" type="number" min={0} max={100} defaultValue={source?.minScore ?? 30} required /></Field>
        </div>
        <label className="checkbox-field"><input name="autoEnroll" type="checkbox" defaultChecked={source?.autoEnroll} /><span>Also enroll new verified leads that match these rules. Approval covers this ongoing audience.</span></label>
        <div className="form-section-title">02 <span>Make the introduction</span></div>
        <Field label="Subject"><input name="subject" required maxLength={180} defaultValue={source?.subject ?? 'A website idea for {{business}}'} /></Field>
        <Field label="Email message" hint="Personalize with {{business}}, {{category}}, {{city}}, {{sender}}, and {{offer}}."><textarea name="body" required rows={10} maxLength={5000} defaultValue={source?.body ?? initialBody} /></Field>
        <div className="form-section-title">03 <span>An optional follow-up</span></div>
        <Field label="Follow-up message" hint="Leave blank for no follow-up. Automatic follow-ups require connected inbound replies."><textarea name="followUpBody" rows={4} maxLength={3000} defaultValue={source?.followUpBody} placeholder="Hi {{business}} team, just following up on my website introduction. If the timing isn’t right, no problem at all." /></Field>
        <Field label="Days after the first email"><input name="followUpDays" type="number" min={2} max={30} defaultValue={source?.followUpDays ?? 4} required /></Field>
        <p className="muted fine-print">Your sender details, postal address, and unsubscribe link are included automatically. Saving creates a draft; it does not authorize sending.</p>
        <div className="modal-actions"><button className="btn secondary" type="button" onClick={dismiss}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save & review'}<ArrowRight size={16} /></button></div>
      </fieldset>
    </form>
  </Modal>;
}

type Preview = {
  campaign: CampaignRecord; total: number; potentialTotal: number; audience: 'potential' | 'enrolled';
  blockers: string[]; sender: string; address: string;
  previews: { name: string; email: string; subject: string; body: string; status?: string; unsubscribeUrl?: string; includesSignature: boolean }[];
};

function CampaignPreview({ id, close, saved }: { id: string; close: () => void; saved: () => void }) {
  const { data, error: loadError, retry } = useResource<Preview>(`/api/campaigns/${id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const tooMany = !!data && !data.campaign.autoEnroll && data.audience === 'potential' && data.total > 200;
  const dismiss = () => { if (!busy) close(); };
  async function approve() {
    if (busy || !accepted) return;
    setBusy(true);
    setError('');
    try { await api(`/api/campaigns/${id}`, 'PATCH', { action: 'approve' }); saved(); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }

  return <Modal title="Review your campaign" close={dismiss} wide>
    <ErrorNotice message={error || loadError} />
    {loadError ? <button className="btn secondary" onClick={retry}><RefreshCw size={16} />Retry preview</button> : null}
    {!data && !loadError ? <Loading /> : null}
    {data ? <>
      <div className="preview-summary">
        <div><h3>{data.campaign.name}</h3><p>{data.total} {data.audience === 'enrolled' ? 'enrolled contacts · Showing stored message snapshots' : 'new eligible contacts · Verified emails only'}</p>{data.campaign.autoEnroll && data.audience === 'enrolled' ? <p>{data.potentialTotal} additional eligible leads can join while this campaign is active.</p> : null}</div>
        <Badge value={data.campaign.status} />
      </div>
      <p className="muted">From: {data.sender}</p>
      {data.previews.length ? <p className="muted fine-print">Showing {data.previews.length} {data.audience === 'enrolled' ? 'stored introductions' : 'personalized examples'} of {data.total} contacts.</p> : null}
      {data.previews.length ? data.previews.map((preview, index) => <details className="email-preview" open={index === 0} key={preview.email}>
        <summary>{preview.name} <span>{preview.email}</span>{preview.status ? <Badge value={preview.status} /> : null}</summary>
        <strong>{preview.subject}</strong><div className="preserve-lines">{preview.body}</div>
        {!preview.includesSignature ? <footer>{data.address || 'Business postal address not yet set'}<br />An individual unsubscribe link will be included.</footer> : null}
      </details>) : <div className="email-preview"><strong>{data.campaign.subject}</strong><p className="preserve-lines">{data.campaign.body}</p><p className="muted">{data.audience === 'enrolled' ? 'No enrolled contacts yet. An ongoing campaign waits for new verified leads matching its rules.' : 'No eligible contacts match these rules. Verify an email and source on a new lead to preview personalization.'}</p></div>}
      {data.campaign.followUpBody ? <details className="email-preview"><summary>Follow-up template · after {data.campaign.followUpDays} days</summary><p className="preserve-lines">{data.campaign.followUpBody}</p><small>Personalized for each eligible recipient. Runs only after fresh reply checks and when follow-ups are enabled.</small></details> : null}
      {data.blockers.length ? <div className="notice warning"><span>Before sending: {data.blockers.join(' · ')}. Complete these in Settings.</span></div> : null}
      {tooMany ? <div className="notice warning">One-time campaigns support up to 200 contacts. Create a narrower campaign or use ongoing enrollment before approving.</div> : null}
      {data.campaign.status === 'DRAFT' ? <>
        <label className="checkbox-field"><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /><span>I approve this message, sender, and {data.campaign.autoEnroll ? 'ongoing matching audience' : 'current matching audience'} for automatic sending.</span></label>
        <div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={dismiss}>Keep as draft</button><button className="btn primary" disabled={!accepted || busy || !!data.blockers.length || tooMany || (!data.total && !data.campaign.autoEnroll)} onClick={approve}><CheckCheck size={17} />{busy ? 'Approving…' : 'Approve campaign'}</button></div>
      </> : <div className="modal-actions"><button className="btn primary" onClick={dismiss}>Done</button></div>}
    </> : null}
  </Modal>;
}
