'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try { const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: new FormData(e.currentTarget).get('password') }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); router.replace('/'); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); setBusy(false); }
  }
  return <main className="login-page"><section className="login-story"><div className="brand"><span className="brand-mark"><Zap size={23} fill="currentColor" /></span><span>zero<span className="brand-sub">WEB FINDER</span></span></div><div><span className="eyebrow">YOUR INDEPENDENT BUSINESS, CONNECTED</span><h1>More projects.<br />Less busywork.</h1><p>Find the right businesses, start better conversations, and keep every opportunity moving.</p><div className="login-steps"><span>01 Discover</span><span>02 Connect</span><span>03 Grow</span></div></div><small>A workspace built around your next client.</small></section><section className="login-form"><div><ShieldCheck size={30} className="green-text" /><h2>Your business starts here.</h2><p className="muted">Sign in to your private workspace.</p><form onSubmit={login}><label className="field"><span>Workspace password</span><input name="password" type="password" autoComplete="current-password" required minLength={12} autoFocus /></label>{error && <p className="notice error" role="alert">{error}</p>}<button className="btn primary full" disabled={busy}>{busy ? 'Signing in…' : 'Open workspace'}<ArrowRight size={18} /></button></form><p className="login-note">Owner access only. Your leads and campaign controls stay private.</p></div></section></main>;
}
