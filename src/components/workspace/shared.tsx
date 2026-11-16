'use client';
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, LoaderCircle, X, ArrowUpRight } from 'lucide-react';
export async function api<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(url === '/api/automation' && method === 'POST' ? 300000 : 30000);
  const res = await fetch(url, { method, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (res.status === 401) throw new Error('Your session expired. Refresh the page to sign in again.');
  let data;
  try { data = await res.json(); }
  catch { throw new Error('The server returned an unexpected response. Try again shortly.'); }
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Something went wrong. Try again.');
  return data as T;
}
export function useResource<T>(url: string, refresh = 0, interval = 0) {
  const [result, setResult] = useState<{ url: string; data: T | null; error: string; updatedAt: number | null; pending: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let fetching = false;
    const load = async () => {
      if (fetching) return; fetching = true;
      setResult(previous => previous?.url === url ? { ...previous, pending: true } : { url, data: null, error: '', updatedAt: null, pending: true });
      try {
        const data = await api<T>(url, 'GET', undefined, controller.signal);
        if (!controller.signal.aborted) setResult({ url, data, error: '', updatedAt: Date.now(), pending: false });
      }
      catch (e) {
        if (!controller.signal.aborted) setResult(previous => ({
          url, data: previous?.url === url ? previous.data : null,
          updatedAt: previous?.url === url ? previous.updatedAt : null, pending: false,
          error: e instanceof Error && e.name === 'TimeoutError' ? 'This request took too long. Please try again.' : e instanceof Error ? e.message : 'Could not load data.',
        }));
      }
      finally { fetching = false; }
    };
    void load();
    const timer = interval ? setInterval(() => { if (document.visibilityState === 'visible') void load(); }, interval) : null;
    const onVisible = () => { if (interval && document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [url, refresh, interval, attempt]);
  const current = result?.url === url ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? '', loading: !current || (!current.data && current.pending), isRefreshing: current?.pending ?? true, updatedAt: current?.updatedAt ?? null, retry };
}
export function ErrorNotice({ message }: { message: string }) { return message ? <div className="notice error" role="alert"><AlertCircle size={18} /><span>{message}{message.includes('session expired') ? <> <a className="text-button" href="/login">Sign in again</a></> : null}</span></div> : null; }
export function Loading() { return <div className="loading" role="status"><LoaderCircle className="spin" size={20} /> Loading your workspace…</div>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><span className="empty-icon"><ArrowUpRight size={24} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Badge({ value }: { value: string }) { return <span className={`badge ${['ACTIVE', 'WON', 'COMPLETED', 'DELIVERED', 'REPLIED'].includes(value) ? 'green' : ['FAILED', 'BOUNCED', 'COMPLAINED', 'REVIEW', 'DO_NOT_CONTACT'].includes(value) ? 'red' : ['QUEUED', 'DRAFT', 'PAUSED', 'RETRY'].includes(value) ? 'amber' : ''}`}>{value.replaceAll('_', ' ').toLowerCase()}</span>; }
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={`workspace-dialog ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
  }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={close} aria-label="Close dialog"><X size={20} /></button></div>{children}</dialog>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const generatedId = useId(), hintId = generatedId + '-hint';
  const validControl = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children);
  const controlId = validControl ? children.props.id || generatedId : undefined;
  const control = validControl
    ? cloneElement(children, { id: controlId, 'aria-describedby': [children.props['aria-describedby'], hint ? hintId : undefined].filter(Boolean).join(' ') || undefined })
    : children;
  return <div className="field"><label htmlFor={controlId}><span>{label}</span></label>{control}{hint ? <small id={hintId}>{hint}</small> : null}</div>;
}
export function dateTime(date?: string | null) { return date ? new Date(date).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not yet'; }
