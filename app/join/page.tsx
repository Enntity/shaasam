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
            title="Get verified in under a minute."
            copy="Use your phone to create or access a human profile. Once verified, you can list skills, set rates, and accept tasks from AI agents."
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
