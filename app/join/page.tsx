'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import LogoMark from '@/components/LogoMark';
import HumanAuthPanel from '@/components/HumanAuthPanel';

export default function JoinPage() {
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
            <Link href="/login">Log in</Link>
          </div>
        </nav>

        <Suspense fallback={<div className="panel">Loading verification...</div>}>
          <HumanAuthPanel
            kicker="Human onboarding"
            title="Start with your phone."
            copy="Get a one-time code, choose what you can help with, and set up payouts. No résumé needed for everyday tasks. Profiles need approval before accepting work."
            redirectTo="/dashboard"
            footer={
              <div className="helper">
                Already verified? <Link className="link-button" href="/login">Log in</Link>
              </div>
            }
          />
        </Suspense>
      </div>
    </main>
  );
}
