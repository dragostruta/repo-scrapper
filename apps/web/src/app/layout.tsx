import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Code Documentation Assistant',
  description: 'Ask grounded questions about any codebase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
