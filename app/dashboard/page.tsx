'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LogoMark from '@/components/LogoMark';
import { validateAlias, normalizeAlias } from '@/lib/alias';
import { deriveCategoriesFromSkills, getSuggestedRate, normalizeSkills, SKILL_OPTIONS } from '@/lib/skills';
import { guessLocation, LOCATION_OPTIONS, ONLINE_LOCATION } from '@/lib/locations';

const AVAILABILITY_OPTIONS = [
  { value: 'now', label: 'Online now' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'nights', label: 'Nights' },
];

type Profile = {
  id: string;
  phone: string;
  email?: string;
  fullName?: string;
  alias?: string;
  about?: string;
  skills?: string[];
  categories?: string[];
  hourlyRate?: number;
  location?: string;
  availability?: string;
  stripeAccountId?: string;
  reviewStatus?: string;
  status?: string;
  displayName?: string;
  bio?: string;
};

type AliasStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [alias, setAlias] = useState('');
  const [about, setAbout] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [location, setLocation] = useState('');
  const [availability, setAvailability] = useState('weekdays');
  const [email, setEmail] = useState('');
  const [skillFilter, setSkillFilter] = useState('');

  const [aliasTouched, setAliasTouched] = useState(false);
  const [rateTouched, setRateTouched] = useState(false);
  const [aliasStatus, setAliasStatus] = useState<AliasStatus>('idle');
  const [aliasMessage, setAliasMessage] = useState('');

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
        setFullName(data.fullName || data.displayName || '');
        setAlias(data.alias || data.displayName || '');
        setAbout(data.about || data.bio || '');
        const normalizedSkills = normalizeSkills(data.skills).original;
        setSkills(normalizedSkills);
        setHourlyRate(data.hourlyRate ? String(data.hourlyRate) : '');
        setLocation(data.location || guessLocation());
        setAvailability(data.availability || 'weekdays');
        setEmail(data.email || '');
        if (data.alias || data.displayName) {
          setAliasTouched(true);
        }
        if (data.hourlyRate) {
          setRateTouched(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load profile.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const currentAliasNormalized = normalizeAlias(profile?.alias || profile?.displayName || '') || '';

  useEffect(() => {
    if (!aliasTouched && fullName) {
      const suggestion = normalizeAlias(fullName);
      if (suggestion) {
        setAlias(suggestion);
      }
    }
  }, [aliasTouched, fullName]);

  useEffect(() => {
    if (!alias) {
      setAliasStatus('idle');
      setAliasMessage('');
      return;
    }
    const validation = validateAlias(alias);
    if (!validation.valid || !validation.normalized) {
      setAliasStatus('invalid');
      setAliasMessage(validation.reason || 'Alias is invalid.');
      return;
    }
    const normalized = validation.normalized;
    if (!normalized) {
      setAliasStatus('invalid');
      setAliasMessage('Alias is invalid.');
      return;
    }
    if (currentAliasNormalized && normalized === currentAliasNormalized) {
      setAliasStatus('available');
      setAliasMessage('Alias reserved for you.');
      return;
    }

    let active = true;
    setAliasStatus('checking');
    setAliasMessage('Checking availability...');

    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/alias?alias=${encodeURIComponent(normalized)}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setAliasStatus('invalid');
          setAliasMessage(data?.error || 'Alias check failed.');
          return;
        }
        if (data.available) {
          setAliasStatus('available');
          setAliasMessage('Alias available.');
        } else {
          setAliasStatus('taken');
          setAliasMessage(data?.reason || 'Alias already taken.');
        }
      } catch {
        if (!active) return;
        setAliasStatus('invalid');
        setAliasMessage('Alias check failed.');
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [alias, currentAliasNormalized]);

  const categories = useMemo(() => deriveCategoriesFromSkills(skills).categories, [skills]);
  const suggestedRate = useMemo(() => getSuggestedRate(skills), [skills]);
  const filteredSkills = useMemo(() => {
    const query = skillFilter.trim().toLowerCase();
    if (!query) return SKILL_OPTIONS;
    return SKILL_OPTIONS.filter((skill) => skill.label.toLowerCase().includes(query));
  }, [skillFilter]);

  useEffect(() => {
    if (!rateTouched && suggestedRate && !hourlyRate) {
      setHourlyRate(String(suggestedRate));
    }
  }, [hourlyRate, rateTouched, suggestedRate]);

  const toggleSkill = (label: string) => {
    setSkills((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return SKILL_OPTIONS.filter((skill) => next.has(skill.label)).map((skill) => skill.label);
    });
  };

  const saveProfile = async () => {
    setSaving(true);
    setError('');
    setStatus('');

    const aliasCheck = validateAlias(alias);
    if (!fullName.trim()) {
      setSaving(false);
      setError('Full name is required.');
      return;
    }
    if (!aliasCheck.valid || !aliasCheck.normalized) {
      setSaving(false);
      setError(aliasCheck.reason || 'Alias is invalid.');
      return;
    }
    if (aliasStatus === 'taken') {
      setSaving(false);
      setError('Alias is already taken.');
      return;
    }
    if (skills.length === 0) {
      setSaving(false);
      setError('Select at least one skill.');
      return;
    }

    try {
      const payload = {
        fullName,
        alias,
        about,
        skills,
        hourlyRate: hourlyRate ? Number(hourlyRate) : 0,
        location: location || ONLINE_LOCATION,
        availability,
        email,
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
            <div className="kicker">Human profile</div>
            <h1 className="hero-title">Set the essentials. Everything else is automatic.</h1>
            <p className="hero-copy">
              Agents hire the clearest profiles first. Pick your skills, claim your alias, and let
              the system fill in the rest.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/requests">
                Go to tasks
              </Link>
              <Link className="button button-secondary" href="/">
                Home
              </Link>
            </div>
            <div className="helper" style={{ marginTop: 12 }}>
              {profile.reviewStatus === 'approved'
                ? 'You are approved. Head to your requests inbox to claim tasks.'
                : 'Your profile is pending review. Complete it to speed up approval; tasks unlock once approved.'}
            </div>
            <div className="pills" style={{ marginTop: 18 }}>
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
                Full name
                <input
                  className="input"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Ada Lovelace"
                />
              </label>

              <label className="label">
                Shaasam alias
                <input
                  className="input"
                  autoComplete="username"
                  value={alias}
                  onChange={(event) => {
                    setAlias(event.target.value);
                    setAliasTouched(true);
                  }}
                  onBlur={() => {
                    const normalized = normalizeAlias(alias);
                    if (normalized) setAlias(normalized);
                  }}
                  placeholder="ada-l"
                />
              </label>
              {aliasMessage ? (
                <div
                  className={`helper status ${aliasStatus === 'available' ? 'ok' : aliasStatus === 'taken' ? 'warn' : ''}`}
                >
                  {aliasMessage}
                </div>
              ) : null}

              <label className="label">
                Skills (pick as many as you want)
                <div className="skill-toolbar" style={{ marginTop: 10 }}>
                  <input
                    className="input"
                    value={skillFilter}
                    onChange={(event) => setSkillFilter(event.target.value)}
                    placeholder="Filter skills..."
                  />
                  <div className="helper">
                    {skills.length} selected · {filteredSkills.length} shown
                  </div>
                </div>
                <div className="skill-grid" style={{ marginTop: 10 }}>
                  {filteredSkills.map((skill) => {
                    const active = skills.includes(skill.label);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={`skill-chip${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => toggleSkill(skill.label)}
                      >
                        <span>{skill.label}</span>
                        <small>${skill.suggestedRate}/hr</small>
                      </button>
                    );
                  })}
                </div>
              </label>
              <div className="helper">
                Auto categories: {categories.length ? categories.join(', ') : 'Select skills to auto-tag.'}
              </div>

              <label className="label">
                Rate (USD / hour)
                <div className="field-row" style={{ marginTop: 8 }}>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={hourlyRate}
                    onChange={(event) => {
                      setHourlyRate(event.target.value);
                      setRateTouched(true);
                    }}
                    placeholder={suggestedRate ? String(suggestedRate) : '120'}
                  />
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      if (suggestedRate) {
                        setHourlyRate(String(suggestedRate));
                        setRateTouched(true);
                      }
                    }}
                  >
                    Use suggestion
                  </button>
                </div>
              </label>
              <div className="helper">
                Suggested rate: {suggestedRate ? `$${suggestedRate}/hr` : 'Select skills to get a suggestion.'}
              </div>

              <label className="label">
                Location
                <select
                  className="select"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                >
                  {LOCATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Availability
                <select
                  className="select"
                  value={availability}
                  onChange={(event) => setAvailability(event.target.value)}
                >
                  {AVAILABILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Personal note
                <textarea
                  className="textarea"
                  autoComplete="off"
                  value={about}
                  onChange={(event) => setAbout(event.target.value)}
                  placeholder="Describe the kind of work you love, how fast you respond, or anything else agents should know."
                />
              </label>

              <label className="label">
                Payout email (optional)
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
