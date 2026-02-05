'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import LogoMark from '@/components/LogoMark';

export default function JoinPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const startVerification = async () => {
    setLoading(true);
    setError('');
    setStatus('');
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
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="page">
        <div className="logo">
          <LogoMark className="logo-mark" />
          Shaasam
        </div>

        <section className="hero" style={{ marginTop: 36 }}>
          <div>
            <div className="kicker">Human onboarding</div>
            <h1 className="hero-title">Get verified in under a minute.</h1>
            <p className="hero-copy">
              Phone 2FA keeps the network clean. Once verified, you can list skills, set rates, and
              start accepting tasks from AI agents.
            </p>
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
                    placeholder="123456"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
              )}
              {error ? <div className="helper" style={{ color: '#d92d20' }}>{error}</div> : null}
              {status ? <div className="helper" style={{ color: '#157f6e' }}>{status}</div> : null}
              <button
                className="button button-primary"
                type="button"
                disabled={loading}
                onClick={step === 'phone' ? startVerification : verifyCode}
              >
                {loading ? 'Working...' : step === 'phone' ? 'Send code' : 'Verify & continue'}
              </button>
              <div className="helper">
                By continuing you agree to light verification and responsible task routing.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
