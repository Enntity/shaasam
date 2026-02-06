'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';

type HumanAuthPanelProps = {
  kicker: string;
  title: string;
  copy: string;
  redirectTo: string;
  footer?: ReactNode;
};

export default function HumanAuthPanel({
  kicker,
  title,
  copy,
  redirectTo,
  footer,
}: HumanAuthPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams?.get('next') || '';
  const safeNext =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '';
  const destination = safeNext || redirectTo;

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [devCode, setDevCode] = useState('');

  const startVerification = async () => {
    setLoading(true);
    setError('');
    setStatus('');
    setDevCode('');
    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send code');
      }
      setStatus(data?.message || 'Verification code sent.');
      if (data?.devCode) {
        setDevCode(`Dev code: ${data.devCode}`);
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Verification failed');
      }
      setStatus('Verified! Redirecting...');
      router.push(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = step === 'phone' ? phone.trim().length > 0 : code.trim().length === 6;

  return (
    <section className="hero" style={{ marginTop: 36 }}>
      <div>
        <div className="kicker">{kicker}</div>
        <h1 className="hero-title">{title}</h1>
        <p className="hero-copy">{copy}</p>
      </div>
      <div className="panel">
        <div className="badge">Step {step === 'phone' ? '1' : '2'} of 2</div>
        <h2 style={{ margin: '12px 0' }}>
          {step === 'phone' ? 'Enter your phone number' : 'Enter your 6-digit code'}
        </h2>
        <div className="form">
          {step === 'phone' ? (
            <label className="label">
              Phone number
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+1 415 555 0123"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          ) : (
            <label className="label">
              Verification code
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          )}
          {step === 'code' ? (
            <div className="helper">
              Sent to {phone || 'your phone'} ·{' '}
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setCode('');
                  setStep('phone');
                  setStatus('');
                  setError('');
                }}
              >
                Use a different number
              </button>
            </div>
          ) : null}
          {error ? <div className="helper" style={{ color: '#d92d20' }}>{error}</div> : null}
          {status ? <div className="helper" style={{ color: '#157f6e' }}>{status}</div> : null}
          {devCode ? <div className="helper">{devCode}</div> : null}
          <button
            className="button button-primary"
            type="button"
            disabled={loading || !canSubmit}
            onClick={step === 'phone' ? startVerification : verifyCode}
          >
            {loading ? 'Working...' : step === 'phone' ? 'Send code' : 'Verify & continue'}
          </button>
          <div className="helper">
            By continuing you agree to light verification and responsible task routing.
          </div>
          {footer}
        </div>
      </div>
    </section>
  );
}
