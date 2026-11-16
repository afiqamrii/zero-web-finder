'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Search, CornerDownLeft } from 'lucide-react';
import { ErrorNotice, Modal, useResource } from './shared';
import type { LeadRecord } from './types';
import './command-menu.css';

type Destination = { id: string; label: string; description: string };
type Props = { destinations: Destination[]; close: () => void; navigate: (id: string) => void; openLead: (id: string) => void };

export default function CommandMenu({ destinations, close, navigate, openLead }: Props) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 200); return () => clearTimeout(timer); }, [query]);
  const matches = destinations.filter(item => (item.label + ' ' + item.description).toLowerCase().includes(query.trim().toLowerCase()));
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const choices = Array.from(region.current?.querySelectorAll<HTMLElement>('[data-command]') ?? []);
    if (!choices.length) return;
    event.preventDefault();
    const index = choices.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') choices[(index + 1) % choices.length].focus();
    else if (index <= 0) input.current?.focus();
    else choices[index - 1].focus();
  }
  return <Modal title="Search your workspace" close={close}>
    <div className="command-menu" ref={region} onKeyDown={keyboard}>
      <label className="command-search"><Search size={20} /><input ref={input} aria-label="Find a lead or page" value={query} maxLength={100} placeholder="Find a business or jump to a page…" onChange={event => setQuery(event.target.value)} autoComplete="off" /></label>
      {matches.length > 0 && <div className="command-group"><h3>Go to</h3>{matches.map(item => <button type="button" data-command key={item.id} onClick={() => navigate(item.id)}><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={17} /></button>)}</div>}
      {query.trim().length >= 2 ? search === query.trim() ? <LeadResults query={search} openLead={openLead} /> : <p className="command-status" role="status">Searching…</p> : <p className="command-status">Type at least 2 characters to find a saved business, email, or location.</p>}
      <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><CornerDownLeft size={13} /> open</span><span><kbd>esc</kbd> close</span></div>
    </div>
  </Modal>;
}

function LeadResults({ query, openLead }: { query: string; openLead: (id: string) => void }) {
  const { data, error, loading, retry } = useResource<{ leads: LeadRecord[]; total: number }>('/api/leads?' + new URLSearchParams({ q: query, sort: 'priority' }));
  return <div className="command-group"><h3>Businesses {data ? <span>· {data.total} found</span> : null}</h3>
    <ErrorNotice message={error} />
    {error ? <button className="text-button" onClick={retry}>Retry search</button> : null}
    {loading ? <p className="command-status" role="status">Searching saved leads…</p> : null}
    {data?.leads.slice(0, 6).map(lead => <button data-command type="button" key={lead.id} onClick={() => openLead(lead.id)}><span><strong>{lead.name}</strong><small>{lead.category} · {lead.address || lead.email || 'Location not added'}</small></span><ArrowUpRight size={17} /></button>)}
    {data && !data.total ? <p className="command-status">No saved business matches “{query}”.</p> : null}
    {data && data.total > 6 ? <p className="command-status">Showing the first 6 matches. Refine your search to narrow the list.</p> : null}
  </div>;
}
