import Link from 'next/link';
export default function PaymentPage() {
  return <main><div className="page"><h1 className="hero-title">Return to your agent</h1><p className="hero-copy">Your checkout visit is finished. The agent can check the payment status in Shaasam. Returning here does not confirm that a payment was authorized.</p><p>Work starts only after payment authorization is verified. If you left checkout without paying, return to the same checkout link from your agent.</p><Link className="button button-secondary" href="/">Back to Shaasam</Link></div></main>;
}
