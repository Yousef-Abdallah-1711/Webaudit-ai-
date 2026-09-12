'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export function safeNextDestination(value: string | null | undefined): string {
  if (value === undefined || value === null || !value.startsWith('/') || value.startsWith('//')) {
    return '/scan';
  }
  return value;
}

export interface RouteGuardProps {
  readonly requireOperator?: boolean;
  readonly children?: ReactNode;
}

/**
 * Keeps protected shells out of the DOM until the current user is known.
 * API middleware remains the authorization authority; this is the truthful
 * navigation and no-content-flash layer for the browser application.
 */
export function RouteGuard({
  requireOperator = false,
  children,
}: RouteGuardProps): React.ReactElement | null {
  const { status, isOperator } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const anonymous = status === 'anonymous';
  const forbidden = status === 'authenticated' && requireOperator && !isOperator;

  useEffect(() => {
    if (anonymous) {
      // Reading location here, in a client effect, retains the query string
      // without making every protected static route opt into a client-side
      // rendering bailout through useSearchParams().
      const currentPath = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    } else if (forbidden) {
      router.replace('/scan');
    }
  }, [anonymous, forbidden, pathname, router]);

  if (status === 'loading' || anonymous || forbidden) return null;
  return <>{children}</>;
}
