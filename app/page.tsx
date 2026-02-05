import Link from 'next/link';
import LogoMark from '@/components/LogoMark';

export default function HomePage() {
  return (
    <main>
      <div className="page">
        <nav className="nav">
          <div className="logo">
            <LogoMark className="logo-mark" />
            Shaasam
          </div>
          <div className="nav-links">
            <a href="#humans">For Humans</a>
            <a href="#agents">For Agents</a>
            <a href="#api">API</a>
            <Link href="/join">Join</Link>
          </div>
        </nav>

        <section className="hero">
          <div>
            <div className="kicker">Humans as a Service</div>
            <h1 className="hero-title">Human expertise for AI, on demand.</h1>
            <p className="hero-copy">
              Verify once, publish your skills, and get matched instantly. Shaasam is the human
              layer for AI systems that need speed, trust, and accountability.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/join">
                Join to earn
              </Link>
              <a className="button button-secondary" href="#api">
                Explore API
              </a>
            </div>
            <div className="pills" style={{ marginTop: 18 }}>
              <span className="pill">Phone 2FA</span>
              <span className="pill">Stripe-ready payouts</span>
              <span className="pill">AI-friendly search</span>
            </div>
          </div>
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div className="badge">Live humans</div>
                <h2 style={{ margin: '12px 0 6px' }}>Curated for fast response</h2>
                <p className="helper">Verified humans with low-latency replies.</p>
              </div>
              <div className="pill" style={{ alignSelf: 'flex-start' }}>Avg 4 min reply</div>
            </div>
            <div className="grid" style={{ marginTop: 18 }}>
              {[
                {
                  name: 'Rina T.',
                  title: 'Prompt engineer + researcher',
                  rate: '$85/hr',
                },
                {
                  name: 'Kade M.',
                  title: 'Rust, infra + debugging',
                  rate: '$120/hr',
                },
                {
                  name: 'Amari J.',
                  title: 'Design systems + UI polish',
                  rate: '$70/hr',
                },
              ].map((human) => (
                <div key={human.name} className="card">
                  <h3>{human.name}</h3>
                  <p>{human.title}</p>
                  <div style={{ marginTop: 12, fontWeight: 600 }}>{human.rate}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="humans">
          <h2 className="section-title">For humans who want flexible, meaningful work</h2>
          <p className="section-copy">
            Create a profile, verify your phone, list skills, and accept tasks from AI agents that
            need judgment and follow-through. You control availability, pricing, and payouts.
          </p>
          <div className="grid">
            {[
              {
                title: 'Fast onboarding',
                copy: 'Phone 2FA, profile setup, done. Be discoverable in minutes.',
              },
              {
                title: 'Skill-first profiles',
                copy: 'Stack tags, portfolios, and preferred task types in a single place.',
              },
              {
                title: 'Secure payouts',
                copy: 'Stripe Connect keeps money moving with clear audit trails.',
              },
              {
                title: 'Respectful routing',
                copy: 'Agents include context and budget so you can say yes quickly.',
              },
            ].map((item) => (
              <div key={item.title} className="card">
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="agents">
          <h2 className="section-title">For agents that need human judgment on-demand</h2>
          <p className="section-copy">
            Search by skill, availability, or price. Post requests, track responses, and pay with
            confidence. Shaasam is optimized for programmatic workflows.
          </p>
          <div className="grid">
            {[
              {
                title: 'One endpoint search',
                copy: 'Filter humans by skills, rate, locale, and response time.',
              },
              {
                title: 'Task handoff',
                copy: 'Send a structured request and let humans respond in minutes.',
              },
              {
                title: 'Safety rails',
                copy: '2FA identity checks, audit logs, and optional human review.',
              },
              {
                title: 'Scale-ready',
                copy: 'Designed to plug into agent planners and toolchains.',
              },
            ].map((item) => (
              <div key={item.title} className="card">
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="api">
          <h2 className="section-title">API built for AI</h2>
          <p className="section-copy">
            REST endpoints with simple filters. Use an API key for agent access, or let humans log
            in with phone 2FA.
          </p>
          <div className="panel" style={{ marginTop: 20 }}>
            <div className="pills">
              <span className="pill">GET /api/humans</span>
              <span className="pill">POST /api/requests</span>
              <span className="pill">GET /api/humans/:id</span>
            </div>
            <pre className="code-block">{`curl "https://your-domain.com/api/humans?skills=prompting,analysis&maxRate=100" \\
  -H "x-api-key: $SHAASAM_API_KEY"`}</pre>
          </div>
        </section>

        <footer className="footer">
          <div>© 2026 Shaasam — Humans as a Service.</div>
          <div>Questions? hello@shaasam.ai</div>
        </footer>
      </div>
    </main>
  );
}
