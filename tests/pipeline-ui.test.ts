// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PipelineView from '../src/components/workspace/PipelineView';

const mocks = vi.hoisted(() => ({ api: vi.fn(), resource: vi.fn(), push: vi.fn(), params: new URLSearchParams('tab=pipeline&view=board') }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => mocks.params }));
vi.mock('../src/components/workspace/shared', async original => ({ ...await original<object>(), api: mocks.api, useResource: mocks.resource }));
vi.mock('../src/components/workspace/Dashboard', async () => {
  const { createElement } = await import('react');
  return { PageHeading: ({ title, action }: { title: string; action: unknown }) => createElement('header', null, createElement('h1', null, title), action as never) };
});

let root: Root, container: HTMLDivElement;
const changed = vi.fn(), goToLead = vi.fn();
const lead = { id: 'lead-1', name: 'Kopi Studio', category: 'Cafe', address: 'KL', status: 'NEW', isStarred: false, score: 75, dealValueCents: 149900, revenueCents: 50000, updatedAt: '2026-11-16T01:00:00.000Z', optedOutAt: null, tasks: [], _count: { tasks: 0 } };
const task = { id: 'task-1', leadId: lead.id, title: 'Call about the proposal', dueAt: '2026-11-17T01:00:00.000Z', status: 'OPEN', completedAt: null, createdAt: '2026-11-16T01:00:00.000Z', updatedAt: '2026-11-16T02:00:00.000Z', lead };
const board = { stages: [{ id: 'NEW', label: 'New leads', archived: false, leads: [lead], total: 1, valueCents: 149900, page: 1, pages: 1, pageSize: 12 }], summary: { total: 1, open: 1, openValueCents: 149900, won: 0 }, serverTime: '2026-11-16T03:00:00.000Z' };
const tasks = { tasks: [task], total: 1, page: 1, pages: 1, pageSize: 25, serverTime: '2026-11-16T03:00:00.000Z', counts: { open: 1, overdue: 0, today: 0, upcoming: 1, done: 0, all: 1 } };
const resource = (data: unknown) => ({ data, error: '', retry: vi.fn(), loading: false, isRefreshing: false, updatedAt: Date.now() });
const render = async () => act(async () => { root.render(createElement(PipelineView, { refresh: 0, onChange: changed, goToLead })); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.params = new URLSearchParams('tab=pipeline&view=board'); mocks.push.mockReset(); mocks.api.mockReset().mockResolvedValue({ task }); changed.mockReset(); goToLead.mockReset();
  mocks.resource.mockReset().mockImplementation((url: string) => resource(url.startsWith('/api/pipeline') ? board : url.startsWith('/api/tasks') ? tasks : { leads: [lead], total: 1 }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('pipeline and task interactions', () => {
  it('persists pane and due-view navigation in the URL', async () => {
    await render();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'My tasks' })));
    expect(mocks.push).toHaveBeenLastCalledWith('/?tab=pipeline&view=tasks', { scroll: false });
    mocks.params = new URLSearchParams('tab=pipeline&view=tasks'); await render();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Overdue.*Needs your attention/ })));
    expect(mocks.push).toHaveBeenLastCalledWith('/?tab=pipeline&view=overdue', { scroll: false });
    await act(async () => fireEvent.change(screen.getByLabelText('Task view'), { target: { value: 'DONE' } }));
    expect(mocks.push).toHaveBeenLastCalledWith('/?tab=pipeline&view=tasks&taskStatus=DONE', { scroll: false });
  });

  it('moves a stage with its saved version and does not submit revenue changes', async () => {
    await render();
    await act(async () => fireEvent.change(screen.getByLabelText('Stage for Kopi Studio'), { target: { value: 'WON' } }));
    expect(mocks.api).toHaveBeenCalledWith('/api/leads/lead-1', 'PATCH', { status: 'WON', expectedUpdatedAt: lead.updatedAt });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Record collected payments separately/)).toBeDefined();
  });

  it('creates a linked task with an explicit Malaysia-time conversion', async () => {
    await render();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add a next step' })));
    const title = screen.getByLabelText('What is the next step?');
    await act(async () => {
      fireEvent.change(title, { target: { value: 'Prepare the proposal' } });
      fireEvent.change(screen.getByLabelText(/Due date and time/), { target: { value: '2026-12-03T15:30' } });
    });
    await act(async () => fireEvent.submit(title.closest('form')!));
    expect(mocks.api).toHaveBeenCalledWith('/api/tasks', 'POST', { leadId: 'lead-1', title: 'Prepare the proposal', dueAt: '2026-12-03T07:30:00.000Z' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('keeps a task draft when browser navigation changes only the pipeline pane', async () => {
    await render(); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add a next step' })));
    await act(async () => fireEvent.change(screen.getByLabelText('What is the next step?'), { target: { value: 'Keep this draft' } }));
    mocks.params = new URLSearchParams('tab=pipeline&view=tasks'); await render();
    expect((screen.getByLabelText('What is the next step?') as HTMLInputElement).value).toBe('Keep this draft');
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('prevents duplicate completion while a task update is pending', async () => {
    mocks.params = new URLSearchParams('tab=pipeline&view=tasks');
    let finish: (value: unknown) => void = () => {};
    mocks.api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render();
    const button = screen.getByRole('button', { name: 'Complete task: Call about the proposal' });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith('/api/tasks/task-1', 'PATCH', { status: 'DONE', expectedUpdatedAt: task.updatedAt });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ task: { ...task, status: 'DONE' } }));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
