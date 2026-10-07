import type { ReactNode } from 'react';
import { MinimalAuthHeader } from '../../components/auth/MinimalAuthHeader';
import { PublicFooter } from '../../components/public';

export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-surface-marketing font-marketing text-marketing-primary">
      <MinimalAuthHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
