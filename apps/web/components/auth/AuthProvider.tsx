'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  refreshAccessToken,
  setAccessToken,
  subscribeToUnauthorized,
  type CurrentUser,
} from '../../lib/api';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: CurrentUser | null;
  readonly isOperator: boolean;
  readonly refresh: () => Promise<CurrentUser | null>;
  readonly login: (email: string, password: string) => Promise<CurrentUser>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children?: ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const resolvingIdentity = useRef(false);

  const refresh = useCallback(async (): Promise<CurrentUser | null> => {
    resolvingIdentity.current = true;
    try {
      const currentUser = await getMe();
      setUser(currentUser);
      setStatus('authenticated');
      return currentUser;
    } catch {
      try {
        await refreshAccessToken();
        const currentUser = await getMe();
        setUser(currentUser);
        setStatus('authenticated');
        return currentUser;
      } catch {
        // A bearer token and refresh cookie are no longer proof of identity
        // after the API rejects them. Clear both local UI identity and the
        // stored bearer token so a stale privileged shell cannot survive.
        setAccessToken(undefined);
        setUser(null);
        setStatus('anonymous');
        return null;
      }
    } finally {
      resolvingIdentity.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeToUnauthorized(() => {
      // A failed identity check may still recover by exchanging a valid
      // refresh cookie. Every other 401 immediately removes privileged UI.
      if (resolvingIdentity.current) return;
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<CurrentUser> => {
      await apiLogin(email, password);
      const currentUser = await refresh();
      if (currentUser === null) {
        throw new Error('The account could not be confirmed after sign-in.');
      }
      return currentUser;
    },
    [refresh],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } finally {
      // The local credential/state must be removed even if the network is gone;
      // otherwise a stale authenticated shell could remain visible.
      setAccessToken(undefined);
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isOperator: user?.isOperator === true,
      refresh,
      login,
      logout,
    }),
    [login, logout, refresh, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return value;
}
