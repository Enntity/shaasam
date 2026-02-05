'use client';

import { useEffect, useState } from 'react';
import { CATEGORY_OPTIONS } from '@/lib/categories';
import LogoMark from '@/components/LogoMark';

type Profile = {
  id: string;
  phone: string;
  email?: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  skills?: string[];
  categories?: string[];
  hourlyRate?: number;
  location?: string;
  availability?: string;
  stripeAccountId?: string;
  reviewStatus?: string;
  status?: string;
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [skillsInput, setSkillsInput] = useState('');
  const [categoriesInput, setCategoriesInput] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) {
          throw new Error('Please verify your phone first.');
        }
        const data = await res.json();
        setProfile(data);
        setSkillsInput((data.skills || []).join(', '));
        setCategoriesInput((data.categories || []).join(', '));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load profile.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const payload = {
        ...profile,
        skills: skillsInput
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        categories: categoriesInput
          .split(',')
          .map((category) => category.trim())
          .filter(Boolean),
      };
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save');
      }
      setProfile(data);
      setStatus('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const connectStripe = async () => {
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/payments/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Stripe connection failed');
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stripe connection failed');
    }
  };

  if (loading) {
    return (
      <main>
        <div className="page">Loading...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main>
        <div className="page">
          <h1 className="hero-title">Verify your phone</h1>
          <p className="hero-copy">We need to finish phone verification before you can edit.</p>
          <a className="button button-primary" href="/join">
            Go to verification
          </a>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="page">
        <div className="logo">
          <LogoMark className="logo-mark" />
          Shaasam
        </div>

        <section className="hero" style={{ marginTop: 32 }}>
          <div>
            <div className="kicker">Your human profile</div>
            <h1 className="hero-title">Make your skills discoverable.</h1>
            <p className="hero-copy">
              Agents search by tags, rates, and availability. A clean profile means better matches.
            </p>
            <div className="pills">
              <span className="pill">Verified: {profile.phone}</span>
              {profile.stripeAccountId ? (
                <span className="pill">Stripe connected</span>
              ) : (
                <span className="pill">Stripe pending</span>
              )}
              <span className="pill">Review: {profile.reviewStatus || 'pending'}</span>
            </div>
          </div>
          <div className="panel">
            <div className="form">
              <label className="label">
                Email (for payouts + receipts)
                <input
                  className="input"
                  type="email"
                  value={profile.email || ''}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev ? { ...prev, email: event.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="label">
                Display name
                <input
                  className="input"
                  value={profile.displayName || ''}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev ? { ...prev, displayName: event.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="label">
                Headline
                <input
                  className="input"
                  value={profile.headline || ''}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev ? { ...prev, headline: event.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="label">
                Skills (comma separated)
                <input
                  className="input"
                  value={skillsInput}
                  onChange={(event) => setSkillsInput(event.target.value)}
                />
              </label>
              <label className="label">
                Categories (comma separated)
                <input
                  className="input"
                  value={categoriesInput}
                  onChange={(event) => setCategoriesInput(event.target.value)}
                  placeholder="prompting, research, debugging"
                />
                <div className="helper" style={{ marginTop: 6 }}>
                  Suggested: {CATEGORY_OPTIONS.map((item) => item.label).slice(0, 6).join(', ')}
                </div>
              </label>
              <label className="label">
                Hourly rate (USD)
                <input
                  className="input"
                  type="number"
                  value={profile.hourlyRate || ''}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev
                        ? { ...prev, hourlyRate: Number(event.target.value) || 0 }
                        : prev
                    )
                  }
                />
              </label>
              <label className="label">
                Location
                <input
                  className="input"
                  value={profile.location || ''}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev ? { ...prev, location: event.target.value } : prev
                    )
                  }
                />
              </label>
              <label className="label">
                Availability
                <select
                  className="select"
                  value={profile.availability || 'weekdays'}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev ? { ...prev, availability: event.target.value } : prev
                    )
                  }
                >
                  <option value="now">Online now</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekends">Weekends</option>
                  <option value="nights">Nights</option>
                </select>
              </label>
              <label className="label">
                Bio
                <textarea
                  className="textarea"
                  value={profile.bio || ''}
                  onChange={(event) =>
                    setProfile((prev) =>
                      prev ? { ...prev, bio: event.target.value } : prev
                    )
                  }
                />
              </label>
              {error ? <div className="helper" style={{ color: '#d92d20' }}>{error}</div> : null}
              {status ? <div className="helper" style={{ color: '#157f6e' }}>{status}</div> : null}
              <button
                className="button button-primary"
                type="button"
                onClick={saveProfile}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              <button className="button button-secondary" type="button" onClick={connectStripe}>
                {profile.stripeAccountId ? 'Update Stripe payout' : 'Connect Stripe payout'}
              </button>
              <div className="helper">
                Stripe Connect is optional in dev. Configure it to enable real payouts.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
