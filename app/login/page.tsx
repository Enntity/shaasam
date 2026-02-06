'use client';

import Link from 'next/link';
import LogoMark from '@/components/LogoMark';
import HumanAuthPanel from '@/components/HumanAuthPanel';

export default function LoginPage() {
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
            <Link href="/join">Join</Link>
          </div>
        </nav>

        <HumanAuthPanel
          kicker="Human login"
          title="Pick up where you left off."
          copy="Enter your phone number to get a one-time code and jump back into your tasks."
          redirectTo="/requests"
          footer={
            <div className="helper">
              New here? <Link className="link-button" href="/join">Create your profile</Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
