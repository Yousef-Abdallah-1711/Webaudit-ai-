'use client';

import { Wordmark } from '../public';
import { LangToggle, ThemeToggle } from '../../app/theme';
import styles from './MinimalAuthHeader.module.css';

/** Focused auth navigation with only the home wordmark and display controls. */
export function MinimalAuthHeader(): React.ReactElement {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a href="/" className={styles.wordmarkLink}>
          <Wordmark />
        </a>
        <div className={styles.controls}>
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
