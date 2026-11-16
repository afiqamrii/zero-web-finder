'use client';

import { Activity as PreservedView, useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, ArrowRight, ArrowUpRight, BrainCircuit, CheckCircle2, ChevronRight, CircleHelp, Clock3, Compass, Kanban, LayoutDashboard, LogOut, Mail, Menu, MessageSquare, Plus, RefreshCw, Search, Settings2, ShieldCheck, Target, Users, Wallet, X, Zap } from 'lucide-react';
import { api, dateTime, Empty, ErrorNotice, Loading, useResource } from './shared';
import type { DashboardData } from './types';
import { money } from '@/lib/domain';
import './command-menu.css';
import './workspace-polish.css';

const LeadsView = dynamic(() => import('./LeadsView'), { loading: Loading });
const CampaignsView = dynamic(() => import('./CampaignsView'), { loading: Loading });
const AutomationView = dynamic(() => import('./AutomationView'), { loading: Loading });
const SettingsView = dynamic(() => import('./SettingsView'), { loading: Loading });
const ActivityView = dynamic(() => import('./ActivityView'), { loading: Loading });
const InsightsView = dynamic(() => import('./InsightsView'), { loading: Loading });
const PipelineView = dynamic(() => import('./PipelineView'), { loading: Loading });
const CommandMenu = dynamic(() => import('./CommandMenu'));

type Tab = 'overview' | 'leads' | 'insights' | 'pipeline' | 'campaigns' | 'automation' | 'activity' | 'settings';
type Navigate = (tab: Tab, params?: Record<string, string>) => void;
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'leads', label: 'Lead workspace', icon: Users },
  { id: 'insights', label: 'Opportunity studio', icon: BrainCircuit },
  { id: 'pipeline', label: 'Pipeline & tasks', icon: Kanban },
  { id: 'campaigns', label: 'Email campaigns', icon: Mail },
  { id: 'automation', label: 'Automations', icon: Zap },
  { id: 'activity', label: 'Activity & delivery', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const;

export default function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = navigation.find(item => item.id === params.get('tab'))?.id ?? 'overview';
  const [refresh, setRefresh] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsVisited, setSettingsVisited] = useState(tab === 'settings');
  const [commandsOpen, setCommandsOpen] = useState(false);
  if (tab === 'settings' && !settingsVisited) setSettingsVisited(true);
  const [navigating, startNavigation] = useTransition();
  const sidebar = useRef<HTMLElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { data, error, isRefreshing } = useResource<DashboardData>('/api/dashboard', refresh, 15000);
  const reload = () => setRefresh(value => value + 1);
  const go: Navigate = (next, extra = {}) => {
    const query = new URLSearchParams({ tab: next, ...extra });
    startNavigation(() => router.push('/?' + query, { scroll: false }));
    setMobile(false);
    setCommandsOpen(false);
  };
  const active = navigation.find(item => item.id === tab)!;

  useEffect(() => {
    const searchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
        event.preventDefault();
        if (!document.querySelector('dialog[open]')) { setMobile(false); setCommandsOpen(true); }
      }
    };
    document.addEventListener('keydown', searchShortcut);
    return () => document.removeEventListener('keydown', searchShortcut);
  }, []);

  useEffect(() => {
    if (!settingsDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [settingsDirty]);

  useEffect(() => {
    if (!mobile) return;
    const content = main.current;
    const previousOverflow = document.body.style.overflow;
    const trigger = menuButton.current;
    document.body.style.overflow = 'hidden';
    if (content) content.inert = true;
    const focusable = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? []).filter(element => element.getClientRects().length);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobile(false); }
      if (event.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (window.innerWidth > 760) setMobile(false); };
    document.addEventListener('keydown', keydown);
    window.addEventListener('resize', onResize);
    return () => {
      if (content) content.inert = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', onResize);
      trigger?.focus();
    };
  }, [mobile]);

  async function signOut() {
    if (settingsDirty && !window.confirm('You have unsaved settings. Discard them and sign out?')) return;
    setSigningOut(true); setLogoutError('');
    try { await api('/api/session', 'DELETE'); router.replace('/login'); router.refresh(); }
    catch (cause) { setLogoutError(cause instanceof Error ? cause.message : 'Could not sign out. Try again.'); setSigningOut(false); }
  }

  return <div className="workspace-shell">
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    {mobile && <button className="nav-backdrop" tabIndex={-1} aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside ref={sidebar} id="workspace-navigation" className={'sidebar ' + (mobile ? 'open' : '')} role={mobile ? 'dialog' : undefined} aria-modal={mobile || undefined} aria-label={mobile ? 'Workspace navigation' : undefined}>
      <div className="sidebar-brand-row">
        <Link href="/" className="brand" onClick={() => setMobile(false)}><span className="brand-mark"><Zap size={23} fill="currentColor" /></span><span>zero<span className="brand-sub">WEB FINDER</span></span></Link>
        <button className="icon-button mobile-toggle" aria-label="Close menu" onClick={() => setMobile(false)}><X size={20} /></button>
      </div>
      <div className="workspace-switch"><span className="workspace-avatar">A</span><span><strong>My growth workspace</strong><small>Your client pipeline</small></span><ShieldCheck size={16} /></div>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) =>
        <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
          <Icon size={18} />{label}{id === 'campaigns' && data?.campaigns ? <span className="nav-count">{data.campaigns}</span> : null}
        </button>
      )}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><Compass size={20} /><h3>One good lead at a time.</h3><p>Find a business, check its contact, and start a useful conversation.</p><button onClick={() => go('automation')}>Find opportunities <ArrowUpRight size={15} /></button></div>
        <button className="owner-profile" disabled={signingOut} onClick={signOut}><span className="owner-avatar">AA</span><span><strong>{signingOut ? 'Signing out…' : 'Afiq Amri'}</strong><small>Workspace owner · sign out</small></span><LogOut size={17} /></button>
      </div>
    </aside>
    <div ref={main} className="workspace-main">
      <header className="topbar">
        <div className="breadcrumb"><button ref={menuButton} className="icon-button mobile-toggle" aria-label="Open navigation" aria-expanded={mobile} aria-controls="workspace-navigation" onClick={() => setMobile(true)}><Menu size={20} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{active.label}</strong></div>
        <div className="top-actions"><button className="command-trigger" aria-label="Search workspace" aria-keyshortcuts="Control+k Meta+k" onClick={() => setCommandsOpen(true)}><Search size={16} /><span>Quick search</span><kbd>Ctrl K</kbd></button><span className={'worker-pill ' + (data?.workerOnline ? 'live' : '')}><i />{!data ? 'Checking worker' : data.workerOnline ? 'Worker connected' : 'Worker offline'}</span><button className="icon-button" title="Refresh data" aria-label="Refresh data" disabled={isRefreshing} onClick={reload}><RefreshCw size={17} className={isRefreshing ? 'spin' : ''} /></button><span className="top-avatar">AA</span></div>
      </header>
      {navigating && <div className="navigation-progress" role="status" aria-label="Opening page" />}
      <main className="page-content" id="workspace-content" tabIndex={-1}>
        <ErrorNotice message={logoutError} />
        {data?.preview && <div className="preview-banner"><ShieldCheck size={16} /><span>Local test workspace · temporary records · sending accounts disconnected</span></div>}
        {error && data && <div className="notice warning" role="status"><Clock3 size={18} /><span>Showing the last successful update. {error}</span><button className="text-button" onClick={reload}>Retry</button></div>}
        {error && !data ? <div className="panel setup-error"><ShieldCheck size={32} /><h1>We couldn’t load your workspace.</h1><p>{error}</p><p className="muted">Your saved records have not been changed. Check the connection and try again.</p><button className="btn primary" onClick={reload}><RefreshCw size={16} />Try again</button></div> : null}
        {!data && !error && ['overview', 'activity'].includes(tab) ? <Loading /> : null}
        {tab === 'overview' && data ? <Overview data={data} go={go} /> : null}
        {tab === 'leads' ? <LeadsView key={params.get('view') ?? 'ALL'} refresh={refresh} onChange={reload} selectedLeadId={params.get('lead')} initialView={params.get('view') ?? 'ALL'} onLeadClose={() => { const query = new URLSearchParams(params); query.delete('lead'); router.replace('/?' + query, { scroll: false }); }} /> : null}
        {tab === 'campaigns' ? <CampaignsView refresh={refresh} onChange={reload} /> : null}
        {tab === 'insights' ? <InsightsView refresh={refresh} onChange={reload} goToLead={id => go('leads', { lead: id })} /> : null}
        {tab === 'pipeline' ? <PipelineView refresh={refresh} onChange={reload} goToLead={id => go('leads', { lead: id })} initialView={['tasks', 'overdue', 'today', 'upcoming'].includes(params.get('view') ?? '') ? params.get('view') as 'tasks' | 'overdue' | 'today' | 'upcoming' : 'board'} /> : null}
        {tab === 'automation' ? <AutomationView refresh={refresh} onChange={reload} data={data} /> : null}
        {settingsVisited ? <PreservedView mode={tab === 'settings' ? 'visible' : 'hidden'}><SettingsView onChange={reload} onDirtyChange={setSettingsDirty} /></PreservedView> : null}
        {tab === 'activity' && data ? <ActivityView refresh={refresh} data={data} goToLead={id => go('leads', { lead: id })} /> : null}
        <footer className="workspace-footer"><span>Zero Web Finder <span className="footer-dot">·</span> Built for your next project</span><span><ShieldCheck size={13} /> Private workspace</span></footer>
      </main>
    </div>
    {commandsOpen ? <CommandMenu close={() => setCommandsOpen(false)} destinations={navigation.map(item => ({ id: item.id, label: item.label, description: ({ overview: 'Your daily overview', leads: 'Find a business or contact', insights: 'Local analysis, priorities, and pitch drafts', pipeline: 'Manage deals and follow-up tasks', campaigns: 'Draft and approve email outreach', automation: 'Discover leads and manage sending', activity: 'Review messages and delivery', settings: 'Connections and workspace preferences' } as Record<Tab, string>)[item.id] }))} navigate={id => go(id as Tab)} openLead={id => go('leads', { lead: id })} /> : null}
  </div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}

function Overview({ data, go }: { data: DashboardData; go: Navigate }) {
  const total = data.stages.reduce((sum, stage) => sum + stage._count, 0);
  const count = (status: string) => data.stages.find(stage => stage.status === status)?._count ?? 0;
  const openValue = data.stages.filter(stage => !['WON', 'CLOSED', 'LOST', 'DO_NOT_CONTACT'].includes(stage.status)).reduce((sum, stage) => sum + (stage._sum.dealValueCents ?? 0), 0);
  const stages = [
    { label: 'New', count: count('NEW'), color: '#a2b9ad' },
    { label: 'Contacted', count: count('CONTACTED') + count('WHATSAPP_SENT'), color: '#80ac96' },
    { label: 'In conversation', count: count('REPLIED') + count('CALL_SCHEDULED'), color: '#4b9675' },
    { label: 'Proposal sent', count: count('PROPOSAL_SENT'), color: '#287b58' },
    { label: 'Won', count: count('WON'), color: '#174b35' },
  ];
  const tasks = [
    { label: 'Overdue follow-up tasks', count: data.taskSummary.overdue, detail: 'Finish or reschedule the work you planned.', icon: Clock3, action: () => go('pipeline', { view: 'overdue' }) },
    { label: 'Tasks still due today', count: data.taskSummary.today, detail: 'Your upcoming commitments, in Malaysia time.', icon: CheckCircle2, action: () => go('pipeline', { view: 'today' }) },
    { label: 'Replies to move forward', count: data.attention.replies, detail: 'Record the next step with your client.', icon: MessageSquare, action: () => go('leads', { status: 'REPLIED' }) },
    { label: 'Contacts to verify', count: data.attention.unverified, detail: 'Check the email and its source before outreach.', icon: ShieldCheck, action: () => go('leads', { view: 'UNVERIFIED' }) },
    { label: 'Campaign drafts', count: data.attention.drafts, detail: 'Review the message and audience before approval.', icon: Mail, action: () => go('campaigns') },
    { label: 'Messages needing review', count: data.attention.reviewMessages, detail: 'Check uncertain sends before taking another action.', icon: CircleHelp, action: () => go('activity', { delivery: 'REVIEW' }) },
    { label: 'Searches needing attention', count: data.attention.failedSearches, detail: 'Review the error and retry when ready.', icon: Compass, action: () => go('automation') },
  ].filter(task => task.count > 0);
  const dateLabel = new Date(data.serverTime).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'long', day: 'numeric', month: 'long' });

  return <>
    <PageHeading eyebrow={dateLabel.toUpperCase()} title="Your next project starts here." description="A clear view of your pipeline, your progress, and what to do next." action={<div className="button-row"><button className="btn secondary" onClick={() => go('campaigns')}><Mail size={16} />Campaigns</button><button className="btn primary" onClick={() => go('automation')}><Plus size={17} />Find new leads</button></div>} />
    <div className="metrics-grid">
      {[
        { label: 'Total leads', value: total.toLocaleString(), detail: data.verified + ' ready for outreach', icon: Users },
        { label: 'Open pipeline', value: money(openValue), detail: 'Estimated value of open opportunities', icon: Target },
        { label: 'Emails accepted', value: data.accepted.toLocaleString(), detail: data.provider === 'gmail' ? 'Gmail acceptance · delivery untracked' : (data.emailStates.find(state => state.status === 'DELIVERED')?._count ?? 0) + ' confirmed delivered', icon: Mail },
        { label: 'Revenue collected', value: money(data.revenue), detail: 'Payments you have recorded', icon: Wallet },
      ].map(metric => <div className="metric-card" key={metric.label}><div className="metric-top"><span>{metric.label}</span><metric.icon size={18} /></div><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}
    </div>
    <section className={'workspace-pulse pulse-' + data.automation.state} aria-label="Automation status"><span className="pulse-icon"><Zap size={23} /></span><div><span className="eyebrow">AUTOMATION STATUS</span><h2>{data.automation.label}</h2><p>{data.automation.detail}</p></div><button className="btn secondary" onClick={() => go(data.automation.state === 'setup' || data.automation.state === 'paused' ? 'settings' : 'automation')}>{data.automation.state === 'setup' ? 'Finish setup' : 'Manage'}<ArrowRight size={16} /></button></section>
    <div className="overview-columns">
      <div className="stack">
        <section className="panel next-actions"><div className="panel-heading"><div><h2>Next actions</h2><p>The work that moves your business forward.</p></div><span className="section-count">{tasks.length} {tasks.length === 1 ? 'area' : 'areas'}</span></div>
          {tasks.length ? <div className="action-list">{tasks.map(({ icon: Icon, ...task }) => <button key={task.label} onClick={task.action}><span className="action-icon"><Icon size={19} /></span><span className="action-copy"><strong>{task.label}</strong><small>{task.detail}</small></span><span className="action-count">{task.count}</span><ChevronRight size={16} /></button>)}</div> : <div className="next-clear"><CheckCircle2 size={25} /><div><strong>{total ? 'Nothing needs your attention.' : 'Start with your first lead.'}</strong><p>{total ? 'Keep discovering opportunities or review your ready contacts.' : 'Choose a business type and location to build your pipeline.'}</p></div><button className="text-button" onClick={() => go(total ? 'leads' : 'automation', total ? { view: 'READY' } : {})}>{total ? 'View ready contacts' : 'Find leads'}<ArrowRight size={15} /></button></div>}
          {data.verified > 0 && <div className="ready-strip"><span><strong>{data.verified}</strong> verified {data.verified === 1 ? 'contact' : 'contacts'} ready for a campaign</span><button className="text-button" onClick={() => go('leads', { view: 'READY' })}>Review contacts<ArrowUpRight size={14} /></button></div>}
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>Your project pipeline</h2><p>Where your opportunities stand right now.</p></div><button className="text-button" onClick={() => go('pipeline')}>Open board<ArrowRight size={15} /></button></div>
          <div className="pipeline-chart">{stages.map((stage, index) => <div className="pipeline-stage" key={stage.label}><div className="pipeline-stage-head"><span>0{index + 1}</span><strong>{stage.count}</strong></div><div className="pipeline-track"><div style={{ height: (stage.count ? Math.max(12, stage.count / Math.max(...stages.map(item => item.count), 1) * 100) : 0) + '%', background: stage.color }} /></div><small>{stage.label}</small></div>)}</div>
          <div className="panel-foot"><CircleHelp size={14} />A current stage snapshot. Pipeline value is estimated; revenue is recorded.</div>
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>Priority opportunities</h2><p>Starred leads first, then strongest fit.</p></div><button className="text-button" onClick={() => go('leads', { view: 'OPEN' })}>View all<ArrowRight size={15} /></button></div>
          {data.topLeads.length ? <div className="priority-list">{data.topLeads.map(lead => <button key={lead.id} aria-label={'Open priority lead ' + lead.name} onClick={() => go('leads', { lead: lead.id })}><span className="business-avatar">{lead.name.slice(0, 2).toUpperCase()}</span><span className="priority-name"><strong>{lead.name}</strong><small>{lead.category} · {lead.address || 'Location not added'}</small></span><span className="score-pill">{lead.score}<small>fit</small></span><ArrowUpRight size={16} /></button>)}</div> : <Empty title="Make room for your next client" text="Add a business or run a focused search to find your first opportunity." action={<button className="btn secondary" onClick={() => go('automation')}>Discover leads<ArrowRight size={15} /></button>} />}
        </section>
        <section className="studio-invitation"><div className="studio-invitation-icon"><BrainCircuit size={28} /></div><div><span className="eyebrow">YOUR LOCAL ANALYST</span><h2>Turn research into your next move.</h2><p>See why a business looks promising, what to verify, and how to start the conversation.</p><button className="btn secondary" onClick={() => go('insights')}>Open opportunity studio<ArrowUpRight size={16} /></button></div><span className="studio-local-tag"><ShieldCheck size={13} />No AI API charges</span></section>
      </div>
      <div className="stack">
        <section className="panel due-tasks"><div className="panel-heading"><div><h2><CheckCircle2 size={17} />Your follow-ups</h2><p>{data.taskSummary.overdue ? `${data.taskSummary.overdue} overdue · ` : ''}{data.taskSummary.today} still due today</p></div><span className="section-count">MYT</span></div>
          {data.taskSummary.due.length ? <ul>{data.taskSummary.due.map(task => <li key={task.id}><span className={'task-due-dot ' + (task.dueAt < data.serverTime ? 'overdue' : '')} /><div><strong>{task.title}</strong><button className="text-button" onClick={() => go('leads', { lead: task.lead.id })}>{task.lead.name}<ArrowUpRight size={12} /></button><small>{dateTime(task.dueAt)}</small></div></li>)}</ul> : <div className="task-clear"><CheckCircle2 size={24} /><p>No tasks due right now.<br /><span>Plan the next step for an active deal.</span></p></div>}
          <div className="panel-foot"><button className="text-button" onClick={() => go('pipeline', { view: 'tasks' })}>Manage all tasks<ArrowRight size={15} /></button></div>
        </section>
        <section className="panel automation-summary"><div className="panel-heading"><h2><Clock3 size={17} />Today’s sending</h2><span className="section-count">MYT</span></div><div className="sending-meter"><span><strong>{data.today}</strong> / {data.settings.dailyLimit}</span><small>Messages attempted · daily allowance</small><progress aria-label="Daily sending allowance used" value={Math.min(data.today, data.settings.dailyLimit)} max={data.settings.dailyLimit} /></div>
          <div className="summary-lines"><div><span>Approved, active campaigns</span><strong>{data.campaigns}</strong></div><div><span>Messages queued</span><strong>{data.attention.queuedMessages}</strong></div><div><span>Enabled searches</span><strong>{data.jobs}</strong></div><div><span>{data.settings.weekdaysOnly ? 'Weekdays' : 'Every day'} · MYT</span><strong>{String(data.settings.sendStartHour).padStart(2, '0')}:00–{String(data.settings.sendEndHour).padStart(2, '0')}:00</strong></div>{['scheduled', 'limit'].includes(data.automation.state) && <div><span>Next sending window</span><strong>{dateTime(data.automation.nextWindowAt)}</strong></div>}<div><span>Last worker check-in</span><strong>{dateTime(data.settings.lastWorkerAt)}</strong></div></div>
          <button className="btn secondary full" onClick={() => go('automation')}>Manage automations<ArrowRight size={15} /></button>
        </section>
        {data.blockers.length > 0 && <section className="setup-card"><Settings2 size={22} /><h3>Connect your workspace</h3><p>These steps are needed before approved campaigns can send.</p><ul className="setup-steps">{data.blockers.map(blocker => <li key={blocker}><span />{blocker}</li>)}</ul><button className="text-button" onClick={() => go('settings')}>Open connection checklist<ArrowRight size={15} /></button></section>}
        <section className="panel"><div className="panel-heading"><h2>Recent activity</h2><button className="text-button" onClick={() => go('activity')}>View all<ArrowUpRight size={14} /></button></div><ActivityList data={data} compact /></section>
      </div>
    </div>
  </>;
}

export function ActivityList({ data, compact }: { data: DashboardData; compact?: boolean }) {
  return data.activity.length ? <div className="activity-list">{data.activity.slice(0, compact ? 5 : 15).map(activity => <div key={activity.id} className="activity-row"><span className={'activity-dot ' + (activity.kind === 'ERROR' ? 'danger' : '')} /><div><p>{activity.message}</p><small>{dateTime(activity.createdAt)}</small></div></div>)}</div> : <div className="quiet-state">Your workspace activity will appear here as you add leads and run campaigns.</div>;
}
