import type { ReactNode } from 'react';
import { MinimalAuthHeader } from '../../components/auth/MinimalAuthHeader';
import styles from './layout.module.css';

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>): React.ReactElement {
  return (
    <div className={styles.shell}>
      <MinimalAuthHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
