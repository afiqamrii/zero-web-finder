// @vitest-environment jsdom
import { Activity, act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '../src/components/workspace/SettingsView';
import CampaignsView from '../src/components/workspace/CampaignsView';
import AutomationView from '../src/components/workspace/AutomationView';

const mocks = vi.hoisted(() => ({ api: vi.fn(), resource: vi.fn() }));
vi.mock('../src/components/workspace/shared', async importOriginal => ({ ...await importOriginal<object>(), api: mocks.api, useResource: mocks.resource }));
vi.mock('../src/components/workspace/Dashboard', async () => {
  const { createElement } = await import('react');
  return { PageHeading: ({ title, action }: { title: string; action: unknown }) => createElement('header', null, createElement('h1', null, title), action as never) };
});

let root: Root;
let container: HTMLDivElement;
const initialSettings = {
  id: 'owner', senderName: 'Test owner', senderEmail: 'owner@example.test', replyTo: 'owner@example.test',
  businessAddress: 'Test business address', offer: 'Website services', dailyLimit: 20,
  sendStartHour: 9, sendEndHour: 17, weekdaysOnly: true, sendingEnabled: false, followUpsEnabled: false,
  updatedAt: '2026-11-16T01:00:00Z',
};
const connections = { access: true, email: false, webhook: false, scheduler: true, publicUrl: true, sender: true, replies: false };
const resource = (data: unknown) => ({ data, error: '', retry: vi.fn(), loading: false, isRefreshing: false, updatedAt: Date.now() });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.api.mockReset().mockResolvedValue({ success: true });
  mocks.resource.mockReset();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('workflow forms', () => {
  it('disables Gmail connection tests in an isolated preview and explains live OAuth setup', async () => {
    mocks.resource.mockReturnValue(resource({ preview: true, provider: 'gmail', settings: initialSettings, connections, blockers: [] }));
    await act(async () => root.render(createElement(SettingsView, { onChange: vi.fn() })));
    const button = screen.getByRole('button', { name: 'Test Gmail connection' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe('gmail-preview-note');
    expect(screen.getByText(/Temporary preview: Gmail connection testing is unavailable here/)).toBeTruthy();
    expect(screen.getByText(/live app needs Google OAuth credentials and a Gmail refresh token/)).toBeTruthy();
    await act(async () => fireEvent.click(button));
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('keeps Gmail connection testing available in the live app', async () => {
    mocks.resource.mockReturnValue(resource({ preview: false, provider: 'gmail', settings: initialSettings, connections, blockers: [] }));
    mocks.api.mockResolvedValue({ email: 'owner@example.test' });
    await act(async () => root.render(createElement(SettingsView, { onChange: vi.fn() })));
    const button = screen.getByRole('button', { name: 'Test Gmail connection' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText(/Temporary preview: Gmail connection testing/)).toBeNull();
    await act(async () => fireEvent.click(button));
    expect(mocks.api).toHaveBeenCalledWith('/api/gmail/check', 'POST');
    expect(screen.getByRole('status').textContent).toContain('Connected to owner@example.test.');
  });

  it('rebases clean settings when editable server values change', async () => {
    let settings = { ...initialSettings };
    mocks.resource.mockImplementation(() => resource({ provider: 'gmail', settings, connections, blockers: [] }));
    const onChange = vi.fn();
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    settings = { ...settings, senderName: 'Changed in another tab', offer: 'Updated website package', dailyLimit: 35 };
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Changed in another tab');
    expect((screen.getByLabelText('Your offer') as HTMLInputElement).value).toBe('Updated website package');
    expect((screen.getByLabelText('Daily email limit') as HTMLInputElement).value).toBe('35');
    expect(screen.getByText('Saved settings')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'My new name' } }));
    await act(async () => fireEvent.submit(container.querySelector('form')!));
    expect(mocks.api).toHaveBeenCalledWith('/api/settings', 'PATCH', expect.objectContaining({ senderName: 'My new name', offer: 'Updated website package', dailyLimit: 35 }));
  });

  it('preserves dirty settings through editable server changes and old props after saving', async () => {
    let settings = { ...initialSettings };
    mocks.resource.mockImplementation(() => resource({ provider: 'gmail', settings, connections, blockers: [] }));
    const onChange = vi.fn();
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    await act(async () => fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'My edited name' } }));
    settings = { ...settings, senderName: 'Another tab name', dailyLimit: 35 };
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('My edited name');
    expect((screen.getByLabelText('Daily email limit') as HTMLInputElement).value).toBe('20');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await act(async () => fireEvent.submit(container.querySelector('form')!));
    settings = { ...settings, updatedAt: '2026-11-16T01:01:00Z' };
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('My edited name');
    expect((screen.getByLabelText('Daily email limit') as HTMLInputElement).value).toBe('20');
    expect(screen.getByText('Settings saved.')).toBeTruthy();
    expect(screen.getByText('Saved settings')).toBeTruthy();
  });

  it('reports a successful save while settings are hidden by Activity', async () => {
    mocks.resource.mockReturnValue(resource({ provider: 'gmail', settings: initialSettings, connections, blockers: [] }));
    let finish!: (value: unknown) => void;
    mocks.api.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const onChange = vi.fn(), onDirtyChange = vi.fn();
    const render = (mode: 'visible' | 'hidden') => createElement(Activity, { mode }, createElement(SettingsView, { onChange, onDirtyChange }));
    await act(async () => root.render(render('visible')));
    await act(async () => fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Saved in background' } }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => fireEvent.submit(container.querySelector('form')!));
    await act(async () => root.render(render('hidden')));
    onDirtyChange.mockClear();
    await act(async () => finish({ success: true }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledOnce();
    await act(async () => root.render(render('visible')));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Saved in background');
    expect(screen.getByText('Saved settings')).toBeTruthy();
  });

  it('keeps unsaved settings and save confirmation across worker timestamp refreshes', async () => {
    let settings = { ...initialSettings };
    mocks.resource.mockImplementation(() => resource({ provider: 'gmail', settings, connections, blockers: [] }));
    const onChange = vi.fn();
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    await act(async () => fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'My edited name' } }));
    settings = { ...settings, updatedAt: '2026-11-16T01:01:00Z' };
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('My edited name');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await act(async () => fireEvent.submit(container.querySelector('form')!));
    expect(mocks.api).toHaveBeenCalledWith('/api/settings', 'PATCH', expect.objectContaining({ senderName: 'My edited name', dailyLimit: 20 }));
    settings = { ...settings, senderName: 'My edited name', updatedAt: '2026-11-16T01:02:00Z' };
    await act(async () => root.render(createElement(SettingsView, { onChange })));
    expect(screen.getByText('Settings saved.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('labels Resend setup correctly and rejects an inverted sending window locally', async () => {
    mocks.resource.mockReturnValue(resource({ provider: 'resend', settings: initialSettings, connections, blockers: [] }));
    await act(async () => root.render(createElement(SettingsView, { onChange: vi.fn() })));
    expect(screen.queryByRole('button', { name: 'Test Gmail connection' })).toBeNull();
    expect(screen.getByText('Resend sender')).toBeTruthy();
    await act(async () => fireEvent.change(screen.getByLabelText('End hour · MYT'), { target: { value: '8' } }));
    await act(async () => fireEvent.submit(container.querySelector('form')!));
    expect(screen.getByRole('alert').textContent).toContain('end hour later than the start hour');
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it('shows stored recipients for an approved campaign without duplicating the signature', async () => {
    const campaign = { id: 'campaign-1', name: 'Local shops', subject: 'Hello {{business}}', body: 'Template', status: 'ACTIVE', eligible: 2, _count: { enrollments: 1 }, autoEnroll: false, followUpBody: '', createdAt: '2026-11-16T01:00:00Z', approvedAt: '2026-11-16T01:00:00Z' };
    mocks.resource.mockImplementation((url: string) => resource(url === '/api/campaigns' ? { campaigns: [campaign] } : {
      campaign, total: 1, potentialTotal: 2, audience: 'enrolled', blockers: [], sender: 'Original sender', address: 'Original postal address',
      previews: [{ name: 'Original shop', email: 'shop@example.test', subject: 'Stored subject', body: 'Stored message\nOriginal postal address', includesSignature: true, status: 'SENT' }],
    }));
    await act(async () => root.render(createElement(CampaignsView, { refresh: 0, onChange: vi.fn() })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'View campaign' })));
    expect(screen.getByText('1 enrolled contacts · Showing stored message snapshots')).toBeTruthy();
    expect(screen.getByText('Stored subject')).toBeTruthy();
    expect(container.querySelectorAll('.email-preview footer')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Approve campaign' })).toBeNull();
  });

  it('offers immediate retry for a failed enabled search and locks concurrent actions', async () => {
    const job = { id: 'job-1', category: 'Café', city: 'Kuala Lumpur', mode: 'no_website', enabled: true, status: 'FAILED', intervalHours: 24, limit: 10, resultCount: 3, lastRunAt: '2026-11-16T01:00:00Z', nextRunAt: '2026-11-17T01:00:00Z', error: 'Search interrupted' };
    mocks.resource.mockReturnValue(resource({ jobs: [job] }));
    let finish!: (value: unknown) => void;
    mocks.api.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(createElement(AutomationView, { refresh: 0, onChange: vi.fn(), data: null })));
    const retry = screen.getByRole('button', { name: 'Retry Café in Kuala Lumpur' }) as HTMLButtonElement;
    await act(async () => fireEvent.click(retry));
    expect(retry.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pause Café in Kuala Lumpur' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.api).toHaveBeenCalledWith('/api/automation', 'PATCH', { id: 'job-1', action: 'retry' });
    await act(async () => finish({ success: true }));
    expect(screen.getByRole('status').textContent).toContain('queued');
  });
});
