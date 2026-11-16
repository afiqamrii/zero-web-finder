'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Circle, RefreshCw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { PageHeading } from './Dashboard';
import { api, ErrorNotice, Field, Loading, useResource } from './shared';
import type { SettingsRecord, Connections } from './types';

type SettingsResponse = { preview: boolean; provider: string; settings: SettingsRecord; connections: Connections; blockers: string[] };

function connectionChecklist(gmail: boolean, preview: boolean): { key: keyof Connections; title: string; detail: string }[] {
  return [
    { key: 'access', title: 'Private workspace access', detail: 'Your workspace password and session protection are configured.' },
    { key: 'email', title: gmail ? 'Gmail sender' : 'Resend sender', detail: gmail ? preview ? 'The live app needs Google OAuth credentials and a Gmail refresh token configured on its server for afiqamri03@gmail.com.' : 'Connect afiqamri03@gmail.com using the private setup guide, then test the connection below.' : 'Add your Resend account key privately on the server and verify your sender domain.' },
    { key: 'sender', title: 'Business identity', detail: 'Complete your sender email, reply address, and business postal address.' },
    { key: 'publicUrl', title: 'Public workspace address', detail: 'Your hosted HTTPS address is needed for working unsubscribe links.' },
    { key: 'webhook', title: gmail ? 'Message acceptance' : 'Delivery events', detail: gmail ? 'Gmail reports acceptance, not inbox delivery. No delivered or opened status is inferred.' : 'Connect signed delivery events to report delivery, bounces, and complaints.' },
    { key: 'scheduler', title: 'Worker configuration', detail: 'The worker needs a private connection secret. Check Automations for its actual heartbeat.' },
    { key: 'replies', title: 'Reply detection', detail: gmail ? 'Gmail read permission lets the worker check the original conversation before a follow-up.' : 'Connect your inbound reply domain before turning on follow-ups.' },
  ];
}

export default function SettingsView({ onChange, onDirtyChange }: { onChange: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [refresh, setRefresh] = useState(0);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [checking, setChecking] = useState(false);
  const { data, error } = useResource<SettingsResponse>('/api/settings', refresh);

  async function checkConnection() {
    if (checking || data?.preview) return;
    setChecking(true);
    setConnectionMessage('');
    setConnectionError('');
    try {
      const result = await api<{ email: string }>('/api/gmail/check', 'POST');
      setConnectionMessage(`Connected to ${result.email}. No email was sent.`);
    } catch (error) {
      setConnectionError((error as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return <>
    <PageHeading eyebrow="YOUR BUSINESS, YOUR CONTROLS" title="Settings & connections" description="Set your business identity, sending schedule, and account connections." />
    <ErrorNotice message={error} />
    {error ? <button className="btn secondary" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} />Retry settings</button> : null}
    {!data && !error ? <Loading /> : null}
    {data ? <div className="settings-layout">
      <SettingsForm settings={data.settings} onDirtyChange={onDirtyChange} saved={() => { setRefresh(value => value + 1); onChange(); }} />
      <aside className="stack">
        {data.blockers.length ? <div className="notice warning"><ShieldCheck size={18} /><span><strong>Before sending</strong><br />{data.blockers.join(' · ')}.</span></div> : null}
        <div className="panel connection-card">
          <div className="panel-heading"><h2><Settings2 size={18} /> Connection checklist</h2></div>
          <div className="connection-list">
            {data.provider === 'gmail' ? <>
              {data.preview ? <p className="notice info" id="gmail-preview-note">Temporary preview: Gmail connection testing is unavailable here. Test the connection in the configured live app.</p> : null}
              <button className="btn secondary full" disabled={checking || data.preview} aria-describedby={data.preview ? 'gmail-preview-note' : undefined} onClick={checkConnection}>{checking ? 'Checking…' : 'Test Gmail connection'}</button>
              {connectionMessage ? <p className="green-text" role="status">{connectionMessage}</p> : null}
              <ErrorNotice message={connectionError} />
            </> : null}
            {connectionChecklist(data.provider === 'gmail', data.preview).map(item => <div key={item.key}>
              <span className={`connection-icon ${data.connections[item.key] ? 'connected' : ''}`}>{data.connections[item.key] ? <Check size={15} /> : <Circle size={15} />}</span>
              <div><strong>{item.title}</strong><p>{item.detail}</p><small>{data.connections[item.key] ? 'Configured' : 'Needs setup'}</small></div>
            </div>)}
          </div>
        </div>
        <div className="notice info"><ShieldCheck size={20} /><span>Private keys stay on the server. “Configured” confirms settings are present; it does not prove the service is running.</span></div>
      </aside>
    </div> : null}
  </>;
}

function draftFrom(settings: SettingsRecord) {
  return {
    senderName: settings.senderName, senderEmail: settings.senderEmail, replyTo: settings.replyTo,
    businessAddress: settings.businessAddress, offer: settings.offer,
    dailyLimit: String(settings.dailyLimit), sendStartHour: String(settings.sendStartHour), sendEndHour: String(settings.sendEndHour),
    weekdaysOnly: settings.weekdaysOnly, sendingEnabled: settings.sendingEnabled, followUpsEnabled: settings.followUpsEnabled,
  };
}
type SettingsDraft = ReturnType<typeof draftFrom>;

function SettingsForm({ settings, saved, onDirtyChange }: { settings: SettingsRecord; saved: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const incomingDraft = draftFrom(settings);
  const incomingFingerprint = JSON.stringify(incomingDraft);
  const [draft, setDraft] = useState(() => draftFrom(settings));
  const [baseline, setBaseline] = useState(() => draftFrom(settings));
  const [serverFingerprint, setServerFingerprint] = useState(incomingFingerprint);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const baselineFingerprint = JSON.stringify(baseline);
  const dirty = JSON.stringify(draft) !== baselineFingerprint;
  // Observe editable server changes once. Worker heartbeats and the old props
  // retained during a save refresh must not reset the draft or saved baseline.
  if (incomingFingerprint !== serverFingerprint) {
    setServerFingerprint(incomingFingerprint);
    if (!dirty && !busy) {
      setDraft(incomingDraft);
      setBaseline(incomingDraft);
      if (incomingFingerprint !== baselineFingerprint) setSuccess('');
    }
  }
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  function change<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setSuccess('');
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setSuccess('');
    if (Number(draft.sendEndHour) <= Number(draft.sendStartHour)) {
      setError('Choose an end hour later than the start hour. Hours use Malaysia time.');
      return;
    }
    setBusy(true);
    const submitted = { ...draft };
    try {
      await api('/api/settings', 'PATCH', { ...submitted, dailyLimit: Number(submitted.dailyLimit), sendStartHour: Number(submitted.sendStartHour), sendEndHour: Number(submitted.sendEndHour) });
      setBaseline(submitted);
      setSuccess('Settings saved.');
      // Activity suspends effects while this view is hidden, but the parent
      // still needs to release its navigation/unload warning after a save.
      onDirtyChange?.(false);
      saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="panel settings-form" onSubmit={submit}>
    <div className="panel-heading"><div><h2>Your business identity</h2><p>Shown to clients in your campaign emails.</p></div><span className="settings-status">{dirty ? 'Unsaved changes' : 'Saved settings'}</span></div>
    <div className="settings-form-body">
      <ErrorNotice message={error} />
      {success ? <p role="status" className="notice info"><Check size={16} />{success}</p> : null}
      <fieldset disabled={busy}>
        <div className="form-grid">
          <Field label="Your name"><input name="senderName" required maxLength={100} value={draft.senderName} onChange={event => change('senderName', event.target.value)} /></Field>
          <Field label="Sender email"><input name="senderEmail" type="email" maxLength={254} value={draft.senderEmail} onChange={event => change('senderEmail', event.target.value)} placeholder="afiqamri03@gmail.com" /></Field>
        </div>
        <Field label="Reply-to email" hint="Gmail follow-ups check replies in the sending account's original conversation."><input name="replyTo" type="email" maxLength={254} value={draft.replyTo} onChange={event => change('replyTo', event.target.value)} placeholder="Where clients should reply" /></Field>
        <Field label="Business postal address" hint="Included in each outreach email."><textarea name="businessAddress" rows={2} maxLength={500} value={draft.businessAddress} onChange={event => change('businessAddress', event.target.value)} /></Field>
        <Field label="Your offer" hint="Used by the {{offer}} personalization field."><input name="offer" required maxLength={300} value={draft.offer} onChange={event => change('offer', event.target.value)} /></Field>
        <div className="form-section-title">SENDING SCHEDULE · MALAYSIA TIME</div>
        <div className="form-grid three">
          <Field label="Daily email limit"><input name="dailyLimit" type="number" min={1} max={100} required value={draft.dailyLimit} onChange={event => change('dailyLimit', event.target.value)} /></Field>
          <Field label="Start hour · MYT"><select name="sendStartHour" value={draft.sendStartHour} onChange={event => change('sendStartHour', event.target.value)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></Field>
          <Field label="End hour · MYT"><select name="sendEndHour" value={draft.sendEndHour} onChange={event => change('sendEndHour', event.target.value)}>{Array.from({ length: 24 }, (_, index) => index + 1).map(hour => <option key={hour} value={hour}>{hour === 24 ? '24:00 · End of day' : `${String(hour).padStart(2, '0')}:00`}</option>)}</select></Field>
        </div>
        <label className="checkbox-field"><input name="weekdaysOnly" type="checkbox" checked={draft.weekdaysOnly} onChange={event => change('weekdaysOnly', event.target.checked)} /><span>Send Monday to Friday only</span></label>
        <label className="toggle-row"><span><strong>Automatic email sending</strong><small>Master switch for every approved campaign. Saving applies this change.</small></span><input className="switch" name="sendingEnabled" type="checkbox" checked={draft.sendingEnabled} onChange={event => change('sendingEnabled', event.target.checked)} /></label>
        <label className="toggle-row"><span><strong>Automatic follow-ups</strong><small>One follow-up after reply checks pass. Requires connected reply detection.</small></span><input className="switch" name="followUpsEnabled" type="checkbox" checked={draft.followUpsEnabled} onChange={event => change('followUpsEnabled', event.target.checked)} /></label>
        <p className="muted fine-print">Changing your sender or offer pauses active campaigns. Approved messages keep their reviewed copy and identity. Duplicate a campaign to use new details.</p>
        <div className="form-save-bar"><span className="muted fine-print">{dirty ? 'Save to apply your changes.' : 'Changes are applied only when saved.'}</span><button className="btn primary" disabled={busy || !dirty}><Save size={16} />{busy ? 'Saving…' : 'Save settings'}</button></div>
      </fieldset>
    </div>
  </form>;
}
