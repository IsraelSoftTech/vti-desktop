import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  monitorParent as apiMonitorParent,
  type AttendanceUser,
} from "../api/auth";

type AuthContextValue = {
  user: AttendanceUser | null;
  loading: boolean;
  signingIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  monitor: (phone: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AttendanceUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setSigningIn(true);
    try {
      const session = await apiLogin(username, password);
      setUser(session);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const monitor = useCallback(async (phone: string) => {
    setSigningIn(true);
    try {
      const session = await apiMonitorParent(phone);
      setUser(session);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signingIn, login, monitor, refreshUser, logout }),
    [user, loading, signingIn, login, monitor, refreshUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
