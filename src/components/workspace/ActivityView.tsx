'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge, dateTime, Empty, ErrorNotice, Loading, useResource } from './shared';
import { ActivityList, PageHeading } from './Dashboard';
import type { DashboardData, MessageRecord } from './types';

type History = { messages: MessageRecord[]; total: number; page: number; pages: number; pageSize: number };
const filters = [{ id: 'ALL', label: 'All messages' }, { id: 'ATTENTION', label: 'Needs attention' }, { id: 'REVIEW', label: 'Review' }, { id: 'QUEUED', label: 'Queued' }, { id: 'SENT', label: 'Accepted' }, { id: 'DELIVERED', label: 'Delivered' }, { id: 'CANCELLED', label: 'Cancelled' }];

export default function ActivityView({ refresh, data, goToLead }: { refresh: number; data: DashboardData; goToLead: (id: string) => void }) {
  const params = useSearchParams(), router = useRouter();
  const status = filters.some(filter => filter.id === params.get('delivery')) ? params.get('delivery')! : 'ALL';
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  useEffect(() => { const timeout = setTimeout(() => setSearch(query), 250); return () => clearTimeout(timeout); }, [query]);
  const result = useResource<History>('/api/activity?' + new URLSearchParams({ status, q: search, page: String(page) }), refresh, 15000);
  function selectStatus(value: string) {
    setPage(1);
    const next = new URLSearchParams(params); next.set('delivery', value);
    router.replace('/?' + next, { scroll: false });
  }
  return <>
    <PageHeading eyebrow="EVERY CONVERSATION, IN VIEW" title="Activity & delivery" description="Search your message history and find the sends that need attention." />
    <div className="panel">
      <div className="panel-heading"><div><h2>Email history</h2><p>Accepted means the provider accepted your request. It does not confirm inbox delivery.</p></div><span className="section-count">{result.data ? result.data.total.toLocaleString() + ' messages' : 'Loading'}</span></div>
      <div className="view-tabs" aria-label="Delivery filters">{filters.map(filter => <button key={filter.id} aria-pressed={status === filter.id} className={status === filter.id ? 'active' : ''} onClick={() => selectStatus(filter.id)}>{filter.label}</button>)}</div>
      <div className="lead-toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search message history" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search a business, email, campaign, or subject" /></label></div>
      <div className="history-notices"><ErrorNotice message={result.error} />{result.error && <button className="btn secondary small" onClick={result.retry}>Try again</button>}</div>
      {result.loading ? <Loading /> : result.data?.messages.length ? <div className="table-scroll"><table className="delivery-table"><thead><tr><th>Business / email</th><th>Campaign / message</th><th>Status</th><th>Last detail · MYT</th></tr></thead><tbody>{result.data.messages.map(message => <tr key={message.id}>
        <td><button className="business-link" aria-label={'Open lead ' + message.enrollment.lead.name} onClick={() => goToLead(message.enrollment.lead.id)}><strong>{message.enrollment.lead.name}</strong><ArrowUpRight size={14} /></button><small>{message.recipient}</small></td>
        <td><strong>{message.enrollment.campaign.name}</strong><small>{message.step ? 'Follow-up' : 'Introduction'} · {message.subject}</small></td>
        <td><Badge value={message.status === 'SENT' ? 'ACCEPTED' : message.status} /><small>{message.provider === 'gmail' ? 'Gmail' : 'Resend'}</small></td>
        <td className="detail-cell">{message.error || dateTime(message.sentAt || message.scheduledAt)}</td>
      </tr>)}</tbody></table></div> : !result.error ? <Empty title={search || status !== 'ALL' ? 'No messages match this view' : 'Your conversations will appear here'} text={search || status !== 'ALL' ? 'Try another search or return to all messages.' : 'Approve a campaign when you are ready. Queued messages and send results will be recorded here.'} /> : null}
      {result.data && <div className="pagination"><span>{result.data.total ? ((result.data.page - 1) * result.data.pageSize + 1) + '–' + Math.min(result.data.page * result.data.pageSize, result.data.total) + ' of ' + result.data.total : '0 messages'}</span><div className="button-row"><button className="btn secondary small" disabled={result.isRefreshing || result.data.page <= 1} aria-label="Previous messages" onClick={() => setPage(result.data!.page - 1)}><ChevronLeft size={16} />Previous</button><span>Page {result.data.page} of {result.data.pages}</span><button className="btn secondary small" disabled={result.isRefreshing || result.data.page >= result.data.pages} aria-label="Next messages" onClick={() => setPage(result.data!.page + 1)}>Next<ChevronRight size={16} /></button></div></div>}
      {status === 'REVIEW' || status === 'ATTENTION' ? <div className="panel-foot">Review uncertain sends in your provider’s sent folder. They are held to prevent duplicate emails.</div> : null}
    </div>
    <div className="panel"><div className="panel-heading"><h2>Workspace timeline</h2><span className="muted">Latest 15 actions</span></div><ActivityList data={data} /></div>
  </>;
}
