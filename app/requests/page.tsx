'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoMark from '@/components/LogoMark';

type RequestItem = {
  id: string;
  title: string;
  description: string;
  skills: string[];
  budget?: number | null;
  requester?: { name?: string | null; org?: string | null };
  status: string;
  createdAt?: string;
};

type RequestsResponse = {
  available: RequestItem[];
  mine: RequestItem[];
};

export default function RequestsPage() {
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/humans/requests');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorCode(res.status);
        throw new Error(body?.error || 'Unable to load requests.');
      }
      setErrorCode(null);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: string, action: string) => {
    setStatus('');
    setError('');
    try {
      const res = await fetch(`/api/humans/requests/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || 'Action failed.');
      }
      setStatus(`Request ${action}d.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const errorTitle =
    errorCode === 401
      ? 'Log in to view tasks'
      : errorCode === 403
        ? 'Profile pending review'
        : errorCode === 404
          ? 'Finish your profile'
          : 'Unable to load requests';

  const errorBody =
    errorCode === 401
      ? 'Verify your phone to access requests.'
      : errorCode === 403
        ? 'Complete your profile while we review. Tasks unlock after approval.'
        : errorCode === 404
          ? 'We could not find a profile for this session.'
          : error;

  return (
    <main>
      <div className="page">
        <nav className="nav">
          <div className="logo">
            <LogoMark className="logo-mark" />
            Shaasam
          </div>
          <div className="nav-links">
            <Link href="/">Home</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/requests">Requests</Link>
          </div>
        </nav>

        <section className="hero" style={{ marginTop: 32 }}>
          <div>
            <div className="kicker">Requests inbox</div>
            <h1 className="hero-title">Claim work that fits your skills.</h1>
            <p className="hero-copy">
              Accept a request to begin. Mark it in progress or complete when finished.
            </p>
          </div>
          <div className="panel">
            <div className="form">
              {error ? <div className="helper" style={{ color: '#d92d20' }}>{error}</div> : null}
              {status ? <div className="helper" style={{ color: '#157f6e' }}>{status}</div> : null}
              <button className="button button-secondary" type="button" onClick={load} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section style={{ marginTop: 24 }}>
            <div className="card">
              <h3>{errorTitle}</h3>
              <p>{errorBody}</p>
              <div className="hero-actions" style={{ marginTop: 12 }}>
                {errorCode === 401 ? (
                  <Link className="button button-primary" href="/login">
                    Log in
                  </Link>
                ) : null}
                {errorCode === 403 || errorCode === 404 ? (
                  <Link className="button button-secondary" href="/dashboard">
                    Update profile
                  </Link>
                ) : null}
                <Link className="button button-secondary" href="/join">
                  Verify phone
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section style={{ marginTop: 48 }}>
          <h2 className="section-title">Available requests</h2>
          {loading ? (
            <div className="card">Loading...</div>
          ) : data?.available?.length ? (
            <div className="grid">
              {data.available.map((item) => (
                <div key={item.id} className="card">
                  <h3>{item.title}</h3>
                  <p>{item.description || 'No description provided.'}</p>
                  <div className="helper" style={{ marginTop: 10 }}>
                    Skills: {item.skills?.length ? item.skills.join(', ') : 'General'}
                  </div>
                  <div className="helper" style={{ marginTop: 6 }}>
                    Budget: {item.budget ? `$${item.budget}` : 'Not specified'}
                  </div>
                  <div className="helper" style={{ marginTop: 6 }}>
                    Requested by: {item.requester?.name || 'Agent'} {item.requester?.org ? `(${item.requester.org})` : ''}
                  </div>
                  <div className="admin-actions">
                    <button className="button button-primary" type="button" onClick={() => act(item.id, 'accept')}>
                      Accept
                    </button>
                    <button className="button button-secondary" type="button" onClick={() => act(item.id, 'decline')}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">No open requests yet.</div>
          )}
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 className="section-title">My active work</h2>
          {loading ? (
            <div className="card">Loading...</div>
          ) : data?.mine?.length ? (
            <div className="grid">
              {data.mine.map((item) => (
                <div key={item.id} className="card">
                  <h3>{item.title}</h3>
                  <p>{item.description || 'No description provided.'}</p>
                  <div className="helper" style={{ marginTop: 10 }}>
                    Status: {item.status}
                  </div>
                  <div className="admin-actions">
                    {item.status === 'accepted' ? (
                      <button className="button button-primary" type="button" onClick={() => act(item.id, 'start')}>
                        Start work
                      </button>
                    ) : null}
                    {item.status === 'in_progress' || item.status === 'accepted' ? (
                      <button className="button button-secondary" type="button" onClick={() => act(item.id, 'complete')}>
                        Mark complete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">No active requests yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}
