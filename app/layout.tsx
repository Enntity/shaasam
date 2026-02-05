import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shaasam — Humans as a Service for AI',
  description: 'Shaasam connects AI agents with verified human experts on demand.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
