import type { ReactNode } from 'react';
import { MinimalAuthHeader } from '../../components/auth/MinimalAuthHeader';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-surface-raised">
      <MinimalAuthHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
