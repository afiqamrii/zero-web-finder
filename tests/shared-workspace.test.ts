// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field, Modal, useResource } from '../src/components/workspace/shared';

let root: Root;
let container: HTMLDivElement;
let requests: { url: string; signal: AbortSignal; resolve: (response: Response) => void }[];

function Probe({ url, refresh = 0 }: { url: string; refresh?: number }) {
  const result = useResource<{ label: string }>(url, refresh);
  return createElement('section', null,
    createElement('output', { 'data-testid': 'records' }, result.data?.label ?? 'No records'),
    createElement('p', { 'data-testid': 'error' }, result.error),
    createElement('p', { 'data-testid': 'loading' }, result.loading ? 'Loading' : 'Loaded'),
    createElement('button', { onClick: result.retry }, 'Retry'),
  );
}
function respond(index: number, data: unknown, status = 200) {
  requests[index].resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  requests = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => new Promise<Response>(resolve => {
    requests.push({ url, signal: init.signal as AbortSignal, resolve });
  })));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('workspace resource transitions', () => {
  it('does not display the previous filter results under a new filter while loading', async () => {
    await act(async () => root.render(createElement(Probe, { url: '/api/leads?view=ALL' })));
    await act(async () => respond(0, { label: 'All businesses' }));
    expect(screen.getByTestId('records').textContent).toBe('All businesses');
    await act(async () => root.render(createElement(Probe, { url: '/api/leads?view=READY' })));
    expect(screen.getByTestId('records').textContent).toBe('No records');
    expect(screen.getByTestId('loading').textContent).toBe('Loading');
    await act(async () => respond(1, { label: 'Verified businesses' }));
    expect(screen.getByTestId('records').textContent).toBe('Verified businesses');
  });

  it('aborts the old filter request and ignores a late response even if a transport still resolves it', async () => {
    await act(async () => root.render(createElement(Probe, { url: '/api/leads?q=old' })));
    await act(async () => root.render(createElement(Probe, { url: '/api/leads?q=new' })));
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => respond(1, { label: 'New search result' }));
    await act(async () => respond(0, { label: 'Outdated search result' }));
    expect(screen.getByTestId('records').textContent).toBe('New search result');
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('preserves the last successful same-filter data during a refresh failure and recovers on retry', async () => {
    await act(async () => root.render(createElement(Probe, { url: '/api/dashboard' })));
    await act(async () => respond(0, { label: 'Saved snapshot' }));
    await act(async () => root.render(createElement(Probe, { url: '/api/dashboard', refresh: 1 })));
    await act(async () => respond(1, { error: 'Connection unavailable' }, 503));
    expect(screen.getByTestId('records').textContent).toBe('Saved snapshot');
    expect(screen.getByTestId('error').textContent).toBe('Connection unavailable');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(requests).toHaveLength(3);
    await act(async () => respond(2, { label: 'Current snapshot' }));
    expect(screen.getByTestId('records').textContent).toBe('Current snapshot');
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('cancels an in-flight request when its view unmounts', async () => {
    await act(async () => root.render(createElement(Probe, { url: '/api/activity' })));
    await act(async () => root.render(null));
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => respond(0, { label: 'Late response' }));
    expect(container.textContent).toBe('');
  });
});

describe('workspace field labeling', () => {
  it('gives populated textareas a stable label and preserves an explicit control id', async () => {
    await act(async () => root.render(createElement(Field, { label: 'Introduction draft' } as Parameters<typeof Field>[0], createElement('textarea', { id: 'draft-body', defaultValue: 'Hi business team, this is the initial draft.' }))));
    const input = screen.getByRole('textbox', { name: 'Introduction draft', exact: true });
    expect(screen.getByLabelText('Introduction draft', { exact: true })).toBe(input);
    expect(input.id).toBe('draft-body');
    expect(input.closest('label')).toBeNull();
    expect(document.querySelector('label')?.htmlFor).toBe('draft-body');
  });
  it('keeps the field name separate from its accessible help text', async () => {
    await act(async () => root.render(createElement(Field, { label: 'Your offer', hint: 'Used in your messages.' } as Parameters<typeof Field>[0], createElement('input', { type: 'text' }))));
    const input = screen.getByRole('textbox', { name: 'Your offer', exact: true });
    expect(screen.getByLabelText('Your offer', { exact: true })).toBe(input);
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Used in your messages.');
  });
});

describe('workspace dialog interaction', () => {
  it('has an accessible title and keeps the editor open when its inside padding is clicked', async () => {
    const close = vi.fn();
    await act(async () => root.render(createElement(Modal, { title: 'Edit lead', close } as Parameters<typeof Modal>[0], createElement('p', null, 'Unsaved draft'))));
    const dialog = screen.getByRole('dialog', { name: 'Edit lead' });
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 100, left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400, toJSON: () => ({}) });
    await act(async () => fireEvent.click(dialog, { clientX: 115, clientY: 130 }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved draft')).toBeTruthy();
    await act(async () => fireEvent.click(dialog, { clientX: 50, clientY: 130 }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('routes Escape cancellation to the caller instead of leaving hidden dialog state behind', async () => {
    const close = vi.fn();
    await act(async () => root.render(createElement(Modal, { title: 'New campaign', close } as Parameters<typeof Modal>[0], createElement('p', null, 'Draft'))));
    const dialog = screen.getByRole('dialog', { name: 'New campaign' });
    const cancel = new Event('cancel', { bubbles: false, cancelable: true });
    await act(async () => dialog.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
