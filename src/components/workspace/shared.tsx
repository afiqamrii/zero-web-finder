'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, LoaderCircle, X, ArrowUpRight } from 'lucide-react';
export async function api<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method, signal, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (res.status === 401) throw new Error('Your session expired. Refresh the page to sign in again.');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data as T;
}
export function useResource<T>(url: string, refresh = 0, interval = 0) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let fetching = false;
    const load = async () => {
      if (fetching) return; fetching = true;
      try { const value = await api<T>(url, 'GET', undefined, controller.signal); setData(value); setError(''); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load data.'); }
      finally { fetching = false; }
    };
    void load();
    const timer = interval ? setInterval(() => { if (document.visibilityState === 'visible') void load(); }, interval) : null;
    return () => { controller.abort(); if (timer) clearInterval(timer); };
  }, [url, refresh, interval]);
  return { data, error };
}
export function ErrorNotice({ message }: { message: string }) { return message ? <div className="notice error" role="alert"><AlertCircle size={18} /><span>{message}</span></div> : null; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={20} /> Loading your workspace…</div>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><span className="empty-icon"><ArrowUpRight size={24} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Badge({ value }: { value: string }) { return <span className={`badge ${['ACTIVE', 'WON', 'COMPLETED', 'DELIVERED', 'REPLIED'].includes(value) ? 'green' : ['FAILED', 'BOUNCED', 'COMPLAINED', 'REVIEW', 'DO_NOT_CONTACT'].includes(value) ? 'red' : ['QUEUED', 'DRAFT', 'PAUSED', 'RETRY'].includes(value) ? 'amber' : ''}`}>{value.replaceAll('_', ' ').toLowerCase()}</span>; }
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`workspace-dialog ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={20} /></button></div>{children}</dialog>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>; }
export function dateTime(date?: string | null) { return date ? new Date(date).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not yet'; }
