'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarClock, Check, ChevronLeft, ChevronRight, CircleCheck, Clock3, Columns3, ListTodo, Plus, Search, Star, Trash2, Undo2 } from 'lucide-react';
import { PageHeading } from './Dashboard';
import { api, Badge, Empty, ErrorNotice, Field, Loading, Modal, useResource } from './shared';
import { money, STATUSES, STATUS_LABELS } from '@/lib/domain';
import { fromMytDateTime, taskDayBounds, toMytDateTime } from '@/lib/task-dates';
import './pipeline.css';

type LeadMini = { id: string; name: string; status: string; optedOutAt: string | null };
type Task = { id: string; leadId: string; title: string; dueAt: string; status: 'OPEN' | 'DONE'; completedAt: string | null; createdAt: string; updatedAt: string; lead: LeadMini };
type TaskView = 'OPEN' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'DONE' | 'ALL';
type CardLead = LeadMini & { category: string; address: string; isStarred: boolean; score: number; dealValueCents: number; revenueCents: number; updatedAt: string; tasks: Pick<Task, 'id' | 'title' | 'dueAt'>[]; _count: { tasks: number } };
type Stage = { id: string; label: string; archived: boolean; leads: CardLead[]; total: number; valueCents: number; page: number; pages: number; pageSize: number };
type BoardData = { stages: Stage[]; summary: { total: number; open: number; openValueCents: number; won: number }; serverTime: string };
type TaskData = { tasks: Task[]; total: number; page: number; pages: number; pageSize: number; serverTime: string; counts: { open: number; overdue: number; today: number; upcoming: number; done: number; all: number } };
type Props = { refresh: number; onChange: () => void; goToLead: (id: string) => void; initialView?: 'board' | 'tasks' | 'overdue' | 'today' | 'upcoming' };
type TaskDraft = { task?: Task; lead?: LeadMini };

const taskLabels: Record<TaskView, string> = { OPEN: 'All open', OVERDUE: 'Overdue', TODAY: 'Due today', UPCOMING: 'Upcoming', DONE: 'Completed', ALL: 'All tasks' };
const taskTime = (date: string) => new Date(date).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const isArchived = (lead: LeadMini) => !!lead.optedOutAt || ['LOST', 'CLOSED', 'DO_NOT_CONTACT'].includes(lead.status);

export default function PipelineView(props: Props) { return <PipelineWorkspace {...props} />; }

function PipelineWorkspace({ refresh, onChange, goToLead, initialView = 'board' }: Props) {
  const router = useRouter(), params = useSearchParams();
  const requestedView = params.get('view') || initialView;
  const panel = requestedView === 'board' ? 'board' : 'tasks';
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const taskView = ['overdue', 'today', 'upcoming'].includes(requestedView) ? requestedView.toUpperCase() as TaskView : params.get('taskStatus') === 'DONE' ? 'DONE' : params.get('taskStatus') === 'ALL' ? 'ALL' : 'OPEN';
  function navigate(view: string, taskStatus?: string) {
    const query = new URLSearchParams(params.toString());
    query.set('tab', 'pipeline'); query.set('view', view);
    if (taskStatus) query.set('taskStatus', taskStatus); else query.delete('taskStatus');
    router.push('/?' + query, { scroll: false });
  }
  const chooseTaskView = (view: TaskView) => ['OVERDUE', 'TODAY', 'UPCOMING'].includes(view) ? navigate(view.toLowerCase()) : navigate('tasks', view === 'OPEN' ? undefined : view);
  return <div className="pipeline-workspace">
    <PageHeading eyebrow="TURN OPPORTUNITIES INTO PROJECTS" title="Pipeline & next steps" description="See where every opportunity stands. Give the next conversation a time and a place." action={<button className="btn primary" onClick={() => setDraft({})}><Plus size={17} />New task</button>} />
    <div className="pipeline-view-switch" role="group" aria-label="Pipeline workspace view">
      <button className={panel === 'board' ? 'selected' : ''} aria-pressed={panel === 'board'} onClick={() => navigate('board')}><Columns3 size={17} />Pipeline board</button>
      <button className={panel === 'tasks' ? 'selected' : ''} aria-pressed={panel === 'tasks'} onClick={() => navigate('tasks')}><ListTodo size={17} />My tasks</button>
      <span><Clock3 size={14} />All due times are MYT</span>
    </div>
    {panel === 'board' ? <Board refresh={refresh} onChange={onChange} goToLead={goToLead} addTask={lead => setDraft({ lead })} /> : <TaskList refresh={refresh} onChange={onChange} goToLead={goToLead} view={taskView} chooseView={chooseTaskView} editTask={task => setDraft({ task })} addTask={() => setDraft({})} />}
    {draft ? <TaskForm draft={draft} close={() => setDraft(null)} saved={() => { setDraft(null); onChange(); }} /> : null}
  </div>;
}

function Board({ refresh, onChange, goToLead, addTask }: { refresh: number; onChange: () => void; goToLead: (id: string) => void; addTask: (lead: LeadMini) => void }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [type, setType] = useState('ALL'), [starred, setStarred] = useState(false), [archived, setArchived] = useState(false), [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({}), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const locked = useRef(new Set<string>());
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const params = new URLSearchParams({ q: search, type, starred: String(starred) });
  const url = `/api/pipeline?${params}`;
  const { data, error: loadError, isRefreshing, retry } = useResource<BoardData>(url, refresh, 30000);
  async function move(lead: CardLead, status: string) {
    if (locked.current.has(lead.id) || status === lead.status) return;
    locked.current.add(lead.id); setPending(previous => ({ ...previous, [lead.id]: status })); setError(''); setNotice('');
    try {
      await api(`/api/leads/${lead.id}`, 'PATCH', { status, expectedUpdatedAt: lead.updatedAt });
      setNotice(`${lead.name} moved to ${STATUS_LABELS[status]}.${status === 'WON' ? ' Record collected payments separately in the lead details.' : ''}`);
      onChange();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not move this lead.'); onChange(); }
    finally { locked.current.delete(lead.id); setPending(previous => { const next = { ...previous }; delete next[lead.id]; return next; }); }
  }
  return <>
    <div className="pipeline-toolbar">
      <label className="pipeline-search"><Search size={17} /><input aria-label="Search pipeline" placeholder="Search business, location or email" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} /></label>
      <select aria-label="Pipeline opportunity" value={type} onChange={event => setType(event.target.value)}><option value="ALL">All opportunities</option><option value="NO_WEBSITE">No website</option><option value="OUTDATED_WEBSITE">Website refresh</option></select>
      <button className={`btn secondary ${starred ? 'pipeline-filter-on' : ''}`} aria-pressed={starred} onClick={() => setStarred(!starred)}><Star size={15} />Priority only</button>
      <label className="pipeline-archive-toggle"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} />Show archived</label>
    </div>
    <ErrorNotice message={error || loadError} />
    {loadError ? <button className="text-button" onClick={retry}>Retry pipeline</button> : null}
    {notice ? <p className="pipeline-success" role="status"><CircleCheck size={16} />{notice}</p> : null}
    {!data && !loadError ? <Loading /> : null}
    {data ? <>
      <div className="pipeline-totals"><span><strong>{data.summary.open}</strong> open opportunities</span><span><strong>{money(data.summary.openValueCents)}</strong> estimated open value</span><span><strong>{data.summary.won}</strong> projects won</span><small>{isRefreshing ? 'Refreshing…' : `${data.summary.total} matching leads`}</small></div>
      {!data.summary.total ? <div className="panel"><Empty title={search || type !== 'ALL' || starred ? 'No matching opportunities' : 'Give your next project a place to grow'} text={search || type !== 'ALL' || starred ? 'Try a broader search or clear the filters.' : 'Add or discover a lead, then use this board to move it through each conversation.'} action={search || type !== 'ALL' || starred ? <button className="btn secondary" onClick={() => { setQuery(''); setSearch(''); setType('ALL'); setStarred(false); }}>Clear filters</button> : undefined} /></div> : <>
        <p className="pipeline-board-hint">Use each card’s stage selector to move it. Moving a lead to Won never records a payment.</p>
        <div className="pipeline-board" aria-label="Sales pipeline stages">{data.stages.filter(stage => archived || !stage.archived).map(stage => <section className={`pipeline-column ${stage.archived ? 'archived' : ''}`} aria-label={stage.label} key={stage.id}>
          <header><div><span className={`pipeline-stage-dot stage-${stage.id.toLowerCase()}`} /><h2>{stage.label}</h2><span className="pipeline-stage-count">{stage.total}</span></div><small>{money(stage.valueCents)} estimated</small></header>
          <div className="pipeline-card-stack">{stage.leads.map(lead => <LeadCard key={lead.id} lead={lead} now={data.serverTime} pending={pending[lead.id]} move={move} goToLead={goToLead} addTask={addTask} />)}{!stage.total ? <div className="pipeline-column-empty">No leads at this stage yet.</div> : null}</div>
          {stage.total > stage.leads.length ? <button className="pipeline-view-more" onClick={() => setExpanded(stage.id)}>View all {stage.total} leads <ArrowRight size={14} /></button> : null}
        </section>)}</div>
      </>}
      {expanded ? <StageList stageId={expanded} baseUrl={url} refresh={refresh} close={() => setExpanded(null)} pending={pending} move={move} goToLead={id => { setExpanded(null); goToLead(id); }} addTask={addTask} /> : null}
    </> : null}
  </>;
}

function LeadCard({ lead, now, pending, move, goToLead, addTask }: { lead: CardLead; now: string; pending?: string; move: (lead: CardLead, status: string) => Promise<void>; goToLead: (id: string) => void; addTask: (lead: LeadMini) => void }) {
  const next = lead.tasks[0], overdue = !!next && new Date(next.dueAt).getTime() < new Date(now).getTime();
  return <article className="pipeline-lead-card" aria-busy={!!pending}>
    <div className="pipeline-card-top"><span className="pipeline-fit">{lead.score} fit</span>{lead.isStarred ? <Star size={14} fill="currentColor" aria-label="Priority lead" /> : null}</div>
    <button className="pipeline-business" onClick={() => goToLead(lead.id)}>{lead.name}<ArrowRight size={14} /></button>
    <p className="pipeline-location">{lead.category} · {lead.address || 'Location not added'}</p>
    {lead.optedOutAt ? <span className="pipeline-contact-stop">Do not contact</span> : null}
    <strong className="pipeline-deal-value">{lead.dealValueCents ? money(lead.dealValueCents) : 'Value not set'}</strong>
    {next ? <div className={`pipeline-next-task ${overdue ? 'overdue' : ''}`}><CalendarClock size={14} /><span><strong>{next.title}</strong><small>{taskTime(next.dueAt)} MYT{lead._count.tasks > 1 ? ` · +${lead._count.tasks - 1} more` : ''}</small></span></div> : <button className="pipeline-add-next" onClick={() => addTask(lead)}><Plus size={14} />Add a next step</button>}
    <div className="pipeline-card-footer"><label><span className="sr-only">Stage for {lead.name}</span><select aria-label={`Stage for ${lead.name}`} value={pending || lead.status} disabled={!!pending} onChange={event => void move(lead, event.target.value)}>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>{next ? <button className="icon-button" aria-label={`Add task for ${lead.name}`} onClick={() => addTask(lead)}><Plus size={15} /></button> : null}</div>
    {pending ? <small className="pipeline-saving" role="status">Saving stage…</small> : null}
  </article>;
}

function StageList({ stageId, baseUrl, refresh, close, pending, move, goToLead, addTask }: { stageId: string; baseUrl: string; refresh: number; close: () => void; pending: Record<string, string>; move: (lead: CardLead, status: string) => Promise<void>; goToLead: (id: string) => void; addTask: (lead: LeadMini) => void }) {
  const [page, setPage] = useState(1);
  const { data, error } = useResource<BoardData>(`${baseUrl}&stage=${stageId}&page=${page}`, refresh);
  const stage = data?.stages[0];
  return <Modal title={stage ? `${stage.label} · ${stage.total} leads` : 'Pipeline stage'} close={close} wide><div className="pipeline-workspace"><ErrorNotice message={error} />{!stage && !error ? <Loading /> : null}{stage ? <><div className="pipeline-stage-list">{stage.leads.map(lead => <LeadCard key={lead.id} lead={lead} now={data!.serverTime} pending={pending[lead.id]} move={move} goToLead={goToLead} addTask={addTask} />)}</div><Pagination page={stage.page} pages={stage.pages} total={stage.total} label="leads" setPage={setPage} /></> : null}</div></Modal>;
}

function Pagination({ page, pages, total, label, setPage }: { page: number; pages: number; total: number; label: string; setPage: (page: number) => void }) {
  return <div className="pipeline-pagination"><span>{total} {label} · Page {page} of {pages}</span><div><button className="btn secondary" aria-label={`Previous ${label} page`} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} />Previous</button><button className="btn secondary" aria-label={`Next ${label} page`} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next<ChevronRight size={16} /></button></div></div>;
}

function TaskList({ refresh, onChange, goToLead, view, chooseView, editTask, addTask }: { refresh: number; onChange: () => void; goToLead: (id: string) => void; view: TaskView; chooseView: (view: TaskView) => void; editTask: (task: Task) => void; addTask: () => void }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [pending, setPending] = useState<string[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const locked = useRef(new Set<string>());
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [query]);
  const { data, error: loadError, isRefreshing, retry } = useResource<TaskData>(`/api/tasks?${new URLSearchParams({ view, q: search, page: String(page) })}`, refresh, 30000);
  const choose = (next: TaskView) => { chooseView(next); setPage(1); };
  async function toggle(task: Task) {
    if (locked.current.has(task.id)) return;
    locked.current.add(task.id); setPending(previous => [...previous, task.id]); setError(''); setNotice('');
    try { await api(`/api/tasks/${task.id}`, 'PATCH', { status: task.status === 'OPEN' ? 'DONE' : 'OPEN', expectedUpdatedAt: task.updatedAt }); setNotice(task.status === 'OPEN' ? 'Task completed. One less thing to remember.' : 'Task reopened.'); onChange(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update this task.'); onChange(); }
    finally { locked.current.delete(task.id); setPending(previous => previous.filter(id => id !== task.id)); }
  }
  const now = data ? new Date(data.serverTime) : new Date(), tomorrow = taskDayBounds(now).tomorrow;
  const groupFor = (task: Task) => task.status === 'DONE' ? 'DONE' : new Date(task.dueAt) < now ? 'OVERDUE' : new Date(task.dueAt) < tomorrow ? 'TODAY' : 'UPCOMING';
  return <>
    <div className="task-overview">{([{ view: 'OVERDUE', label: 'Overdue', count: data?.counts.overdue, detail: 'Needs your attention', icon: Clock3 }, { view: 'TODAY', label: 'Due today', count: data?.counts.today, detail: 'Still ahead in Malaysia time', icon: CalendarClock }, { view: 'UPCOMING', label: 'Upcoming', count: data?.counts.upcoming, detail: 'Tomorrow and beyond', icon: ListTodo }] as const).map(item => <button key={item.view} className={`task-overview-card ${item.view.toLowerCase()} ${view === item.view ? 'selected' : ''}`} aria-pressed={view === item.view} onClick={() => choose(item.view)}><div><item.icon size={19} /><span>{item.label}</span><strong>{item.count ?? '—'}</strong></div><small>{item.detail}</small></button>)}</div>
    <div className="pipeline-toolbar"><label className="pipeline-search"><Search size={17} /><input aria-label="Search tasks" value={query} maxLength={100} placeholder="Search task or business" onChange={event => setQuery(event.target.value)} /></label><select aria-label="Task view" value={view} onChange={event => choose(event.target.value as TaskView)}>{Object.entries(taskLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><span className="task-refresh-status" role="status">{isRefreshing && data ? 'Refreshing…' : 'Personal reminders · no automatic emails'}</span></div>
    <ErrorNotice message={error || loadError} />{loadError ? <button className="text-button" onClick={retry}>Retry tasks</button> : null}{notice ? <p className="pipeline-success" role="status"><CircleCheck size={16} />{notice}</p> : null}
    {!data && !loadError ? <Loading /> : null}{data && !data.tasks.length ? <div className="panel"><Empty title={view === 'OVERDUE' ? 'Nothing overdue. Keep the momentum.' : search ? 'No matching tasks' : 'Make the next step easy to remember.'} text={search ? 'Try another business name or task title.' : view === 'DONE' ? 'Tasks you complete will stay here for reference.' : 'Set a reminder for a call, a proposal, or a project check-in.'} action={<button className="btn secondary" onClick={addTask}><Plus size={16} />Add a task</button>} /></div> : null}
    {data?.tasks.length ? <div className="task-list-panel panel">{(['OVERDUE', 'TODAY', 'UPCOMING', 'DONE'] as const).map(group => {
      const tasks = data.tasks.filter(task => groupFor(task) === group);
      return tasks.length ? <section className="task-group" key={group}><h2>{taskLabels[group]}<span>{tasks.length} on this page</span></h2>{tasks.map(task => <article className={`task-row ${task.status === 'DONE' ? 'done' : ''}`} key={task.id} aria-busy={pending.includes(task.id)}>
        <button className="task-complete" aria-label={`${task.status === 'OPEN' ? 'Complete' : 'Reopen'} task: ${task.title}`} disabled={pending.includes(task.id)} onClick={() => void toggle(task)}>{task.status === 'DONE' ? <Undo2 size={17} /> : <Check size={18} />}</button>
        <div className="task-description"><button className="task-title" onClick={() => editTask(task)} disabled={pending.includes(task.id)}>{task.title}</button><div><button className="task-business" onClick={() => goToLead(task.lead.id)}>{task.lead.name}<ArrowRight size={12} /></button>{isArchived(task.lead) ? <Badge value={task.lead.optedOutAt ? 'DO_NOT_CONTACT' : task.lead.status} /> : null}</div></div>
        <div className={`task-due ${group === 'OVERDUE' ? 'overdue' : ''}`}><CalendarClock size={15} /><span>{taskTime(task.dueAt)}<small>Malaysia time</small></span></div><button className="btn secondary task-edit" disabled={pending.includes(task.id)} onClick={() => editTask(task)}>Edit</button>
      </article>)}</section> : null;
    })}<Pagination page={data.page} pages={data.pages} total={data.total} label="tasks" setPage={setPage} /></div> : null}
  </>;
}

function TaskForm({ draft, close, saved }: { draft: TaskDraft; close: () => void; saved: () => void }) {
  const [lead, setLead] = useState<LeadMini | null>(draft.task?.lead ?? draft.lead ?? null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [deleting, setDeleting] = useState(false);
  const locked = useRef(false);
  const dueDefault = draft.task?.dueAt ?? new Date(taskDayBounds().tomorrow.getTime() + 9 * 3600000).toISOString();
  const [due, setDue] = useState(toMytDateTime(dueDefault));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current || !lead) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const fields = new FormData(event.currentTarget), dueAt = fromMytDateTime(due);
      const body = { title: fields.get('title'), dueAt, ...(draft.task ? { expectedUpdatedAt: draft.task.updatedAt } : { leadId: lead.id }) };
      await api(draft.task ? `/api/tasks/${draft.task.id}` : '/api/tasks', draft.task ? 'PATCH' : 'POST', body); saved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save this task.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function remove() {
    if (locked.current || !draft.task) return;
    locked.current = true; setBusy(true); setError('');
    try { await api(`/api/tasks/${draft.task.id}`, 'DELETE', { expectedUpdatedAt: draft.task.updatedAt }); saved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete this task.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Modal title={draft.task ? 'Edit your next step' : 'Give your next step a date'} close={() => { if (!busy) close(); }}><div className="pipeline-workspace"><form onSubmit={submit}><ErrorNotice message={error} />
    {draft.task || draft.lead ? <div className="task-attached-lead"><span>For</span><strong>{lead?.name}</strong></div> : <TaskLeadPicker lead={lead} setLead={setLead} disabled={busy} />}
    {lead && isArchived(lead) ? <div className="notice warning"><span>This lead is {lead.optedOutAt ? 'marked do not contact' : STATUS_LABELS[lead.status]?.toLowerCase()}. Keep this reminder for appropriate internal work.</span></div> : null}
    <Field label="What is the next step?"><input name="title" required maxLength={160} disabled={busy} placeholder="e.g. Prepare a website proposal" defaultValue={draft.task?.title ?? ''} autoFocus={!!lead} /></Field>
    <Field label="Due date and time · Malaysia (UTC+8)" hint="This is a personal reminder. It does not send a message to the client."><input type="datetime-local" name="dueAt" required value={due} disabled={busy} onChange={event => setDue(event.target.value)} /></Field>
    <div className="task-date-shortcuts"><button type="button" disabled={busy} onClick={() => setDue(toMytDateTime(new Date(taskDayBounds().tomorrow.getTime() + 9 * 3600000)))}>Tomorrow, 9am</button><button type="button" disabled={busy} onClick={() => setDue(toMytDateTime(new Date(taskDayBounds().tomorrow.getTime() + (48 + 9) * 3600000)))}>In 3 days, 9am</button></div>
    {draft.task?.status === 'DONE' ? <p className="pipeline-success"><CircleCheck size={16} />Completed {taskTime(draft.task.completedAt!)} MYT. Reopen from the task list when needed.</p> : null}
    <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={close}>Cancel</button><button className="btn primary" disabled={busy || !lead}>{busy && !deleting ? 'Saving…' : draft.task ? 'Save task' : 'Create task'}<ArrowRight size={16} /></button></div>
  </form>{draft.task ? <div className="task-delete-area">{deleting ? <><p>Delete “{draft.task.title}”? The lead and its outreach history stay in your workspace.</p><div className="button-row"><button type="button" className="btn secondary" disabled={busy} onClick={() => setDeleting(false)}>Keep task</button><button type="button" className="btn secondary task-delete-confirm" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete task'}</button></div></> : <button type="button" className="text-button" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={14} />Delete this task</button>}</div> : null}</div></Modal>;
}

function TaskLeadPicker({ lead, setLead, disabled }: { lead: LeadMini | null; setLead: (lead: LeadMini | null) => void; disabled: boolean }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const { data, error, loading } = useResource<{ leads: LeadMini[]; total: number }>(`/api/leads?${new URLSearchParams({ q: search })}`);
  const options = data?.leads ?? [];
  return <><Field label="Find a business"><input value={query} disabled={disabled} maxLength={100} placeholder="Search your saved leads" onChange={event => setQuery(event.target.value)} /></Field><ErrorNotice message={error} /><Field label="Attach to a lead" hint={data && data.total > options.length ? `Showing ${options.length} of ${data.total} matching leads. Search to narrow the list.` : undefined}><select required disabled={disabled || loading} value={lead?.id ?? ''} onChange={event => setLead(options.find(item => item.id === event.target.value) ?? null)}><option value="">{loading ? 'Loading leads…' : options.length ? 'Choose a lead' : 'No matching saved leads'}</option>{lead && !options.some(item => item.id === lead.id) ? <option value={lead.id}>{lead.name}</option> : null}{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></>;
}
