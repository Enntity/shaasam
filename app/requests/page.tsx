'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Task = { id: string; title: string; description: string; acceptanceCriteria: string; skills: string[];
  budgetCents: number; humanReceivesCents: number; durationMinutes: number; status: string;
  paymentStatus: string | null; reportedAt: string | null; result: string | null };
const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export default function RequestsPage() {
  const [data, setData] = useState<{ available: Task[]; mine: Task[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, string>>({});
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/humans/requests');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load tasks.');
      setData(body); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load tasks.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const act = async (id: string, action: string) => {
    setBusy(id); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/humans/requests/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, result: results[id], reason: reports[id] }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update task.');
      setMessage(({ accept: 'Task accepted. Wait for funding before starting.', decline: 'Task declined.', start: 'Work started.', complete: 'Result submitted. Waiting for the agent to review and release payment.', report: 'Problem reported. Settlement is paused for support review.' } as Record<string, string>)[action]);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update task.'); }
    finally { setBusy(''); }
  };
  const card = (task: Task, mine: boolean) => <article className="card" key={task.id}>
    <h3>{task.title}</h3><p>{task.description}</p>
    <p style={{ marginTop: 12 }}><strong>{dollars(task.budgetCents)} budget</strong> · about {task.durationMinutes} min</p>
    <p>{dollars(task.humanReceivesCents)} after platform fee, before any applicable taxes or payout fees.</p>
    <h4>What to deliver</h4><p>{task.acceptanceCriteria}</p>
    {mine ? <>
      <p style={{ marginTop: 12 }}>Task: {task.status.replace('_', ' ')} · Payment: {task.paymentStatus === 'requires_capture' ? 'authorized' : task.paymentStatus === 'succeeded' ? 'released to Stripe' : task.paymentStatus || 'awaiting funding'}</p>
      {task.reportedAt ? <p role="status">Problem reported. Settlement is paused for support review.</p> : null}
      {task.result ? <><h4>Your result</h4><p className="result-text">{task.result}</p></> : null}
      {task.status === 'accepted' && !task.reportedAt ? <div className="admin-actions"><button className="button button-primary" disabled={Boolean(busy) || task.paymentStatus !== 'requires_capture'} onClick={() => act(task.id, 'start')}>Start work</button><p className="helper">Refresh after the agent funds this task. Authorization is checked again when you start.</p></div> : null}
      {task.status === 'in_progress' && !task.reportedAt ? <form className="form" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); void act(task.id, 'complete'); }}><label className="label">Your result<textarea className="textarea" required maxLength={4000} value={results[task.id] || ''} onChange={(e) => setResults({ ...results, [task.id]: e.target.value })} placeholder="Describe what you did and the outcome. Include a link if needed. Never include passwords or private information." /></label><button className="button button-primary" disabled={Boolean(busy)} type="submit">Submit result</button></form> : null}
      {!task.reportedAt && !['succeeded', 'canceled', 'refunded'].includes(task.paymentStatus || '') && task.status !== 'canceled' ? <details style={{ marginTop: 20 }}><summary>Report a problem</summary><form className="form" onSubmit={(e) => { e.preventDefault(); void act(task.id, 'report'); }}><label className="label">What happened?<textarea className="textarea" required maxLength={2000} value={reports[task.id] || ''} onChange={(e) => setReports({ ...reports, [task.id]: e.target.value })} /></label><button className="button button-secondary" disabled={Boolean(busy)} type="submit">Report and pause settlement</button></form></details> : null}
    </> : <div className="admin-actions"><button className="button button-primary" disabled={Boolean(busy)} onClick={() => act(task.id, 'accept')}>Accept task</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => act(task.id, 'decline')}>Pass</button></div>}
    <p className="helper" style={{ marginTop: 16 }}>Task ID: {task.id}</p>
  </article>;
  return <main><div className="page"><nav className="nav"><Link className="logo" href="/">Shaasam</Link><div className="nav-links"><Link href="/dashboard">Profile & payouts</Link><Link href="/safety">Help & safety</Link></div></nav>
    <h1 className="hero-title" style={{ marginTop: 48 }}>Choose a task that fits.</h1><p className="hero-copy">Read the brief and the pay. Accept only work you want to do. Wait for funding before you start.</p>
    {error ? <div className="card" role="alert"><p>{error}</p><Link className="link-button" href="/dashboard">Check your profile and payouts</Link> · <Link className="link-button" href="/login">Log in</Link></div> : null}
    {message ? <p role="status">{message}</p> : null}
    <button className="button button-secondary" onClick={load} disabled={loading || Boolean(busy)}>{loading ? 'Refreshing…' : 'Refresh tasks'}</button>
    <h2 className="section-title">My tasks</h2><div className="grid">{data?.mine.length ? data.mine.map(t => card(t, true)) : <p>{loading ? 'Loading tasks…' : 'Accepted tasks and submitted results appear here.'}</p>}</div>
    <h2 className="section-title">Available tasks</h2><div className="grid">{data?.available.length ? data.available.map(t => card(t, false)) : <p>{loading ? 'Loading tasks…' : 'No matching tasks right now. Check back later or update what you can help with.'}</p>}</div>
  </div></main>;
}
