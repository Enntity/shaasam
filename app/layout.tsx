import './globals.css';
import type { Metadata } from 'next';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'Shaasam — Humans as a Service for AI',
  description: 'Find people for short tasks, from everyday checks to specialist work. Clear briefs, fixed budgets, and Stripe payments.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
