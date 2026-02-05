'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import LogoMark from '@/components/LogoMark';

const STORAGE_KEY = 'shaasam_admin_key';

type AdminUser = {
  id: string;
  displayName?: string;
  email?: string;
  headline?: string;
  skills?: string[];
  categories?: string[];
  reviewStatus?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [reviewFilter, setReviewFilter] = useState('pending');
  const [accountFilter, setAccountFilter] = useState('all');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) || '';
    setAdminKey(stored);
    setSavedKey(stored);
  }, []);

  const canQuery = useMemo(() => savedKey.length > 0, [savedKey]);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (reviewFilter !== 'all') params.set('reviewStatus', reviewFilter);
    if (accountFilter !== 'all') params.set('status', accountFilter);
    return params.toString();
  };

  const loadUsers = useCallback(async () => {
    if (!savedKey) return;
    setLoading(true);
    setError('');
    setStatusMessage('');
    try {
      const query = buildQuery();
      const res = await fetch(`/api/admin/users${query ? `?${query}` : ''}`, {
        headers: {
          'x-admin-key': savedKey,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to load users');
      }
      setUsers(data?.data || []);
      setStatusMessage(`Loaded ${data?.data?.length || 0} users.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  }, [accountFilter, reviewFilter, savedKey]);

  const saveKey = () => {
    if (!adminKey.trim()) {
      setError('Enter an admin key.');
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, adminKey.trim());
    setSavedKey(adminKey.trim());
    setStatusMessage('Admin key saved.');
    setError('');
  };

  const clearKey = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setAdminKey('');
    setSavedKey('');
    setUsers([]);
    setStatusMessage('Admin key cleared.');
  };

  const reviewUser = async (userId: string, payload: Record<string, string>) => {
    if (!savedKey) return;
    setLoading(true);
    setError('');
    setStatusMessage('');
    try {
      const res = await fetch(`/api/admin/users/${userId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': savedKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Update failed');
      }
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, reviewStatus: data.reviewStatus, status: data.status }
            : user
        )
      );
      setStatusMessage('User updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (savedKey) {
      loadUsers();
    }
  }, [savedKey, loadUsers]);

  return (
    <main>
      <div className="page">
        <nav className="nav">
          <div className="logo">
            <LogoMark className="logo-mark" />
            Shaasam
          </div>
        </nav>

        <section className="hero" style={{ marginTop: 32 }}>
          <div>
            <div className="kicker">Admin console</div>
            <h1 className="hero-title">Moderation + approvals</h1>
            <p className="hero-copy">
              Review humans, approve profiles, and keep the marketplace clean. Admin key required.
            </p>
          </div>
          <div className="panel">
            <div className="form">
              <label className="label">
                Admin key
                <input
                  className="input"
                  type="password"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Enter admin key"
                />
              </label>
              <div className="hero-actions" style={{ marginTop: 6 }}>
                <button className="button button-primary" type="button" onClick={saveKey}>
                  Save key
                </button>
                <button className="button button-secondary" type="button" onClick={clearKey}>
                  Clear key
                </button>
              </div>
              {error ? <div className="helper" style={{ color: '#d92d20' }}>{error}</div> : null}
              {statusMessage ? (
                <div className="helper" style={{ color: '#157f6e' }}>{statusMessage}</div>
              ) : null}
            </div>
          </div>
        </section>

        <section style={{ marginTop: 48 }}>
          <div className="admin-controls">
            <div className="admin-filter">
              <label className="label">
                Review status
                <select
                  className="select"
                  value={reviewFilter}
                  onChange={(event) => setReviewFilter(event.target.value)}
                  disabled={!canQuery}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label className="label">
                Account status
                <select
                  className="select"
                  value={accountFilter}
                  onChange={(event) => setAccountFilter(event.target.value)}
                  disabled={!canQuery}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
            </div>
            <button
              className="button button-secondary"
              type="button"
              onClick={loadUsers}
              disabled={!canQuery || loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="admin-grid">
            {users.length === 0 ? (
              <div className="card">No users found for this filter.</div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <h3>{user.displayName || 'Unnamed'}</h3>
                      <p>{user.headline || '—'}</p>
                      <div className="helper" style={{ marginTop: 6 }}>
                        {user.email || 'No email'}
                      </div>
                    </div>
                    <div className="pills" style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span className="pill">Review: {user.reviewStatus || 'pending'}</span>
                      <span className="pill">Status: {user.status || 'active'}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div className="helper">Skills: {(user.skills || []).join(', ') || '—'}</div>
                    <div className="helper">
                      Categories: {(user.categories || []).join(', ') || '—'}
                    </div>
                  </div>

                  <div className="helper" style={{ marginTop: 12 }}>
                    Created: {formatDate(user.createdAt)} · Updated: {formatDate(user.updatedAt)}
                  </div>

                  <div className="admin-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => reviewUser(user.id, { reviewStatus: 'approved', status: 'active' })}
                    >
                      Approve
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => reviewUser(user.id, { reviewStatus: 'rejected', status: 'suspended' })}
                    >
                      Reject
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => reviewUser(user.id, { status: 'suspended' })}
                    >
                      Suspend
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => reviewUser(user.id, { status: 'active' })}
                    >
                      Reinstate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
