import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { login as apiLogin, type LoginResponse } from "../lib/api";

const STORAGE_KEY = "colas_auth";

interface AuthState {
  token: string | null;
  user: LoginResponse["user"] | null;
  requiresPasswordChange: boolean;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug?: string | null) => Promise<{ requiresPasswordChange: boolean }>;
  logout: () => void;
  clearRequiresPasswordChange: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null, requiresPasswordChange: false };
    const data = JSON.parse(raw) as LoginResponse & { requiresPasswordChange?: boolean };
    if (data?.token && data?.user) {
      return {
        token: data.token,
        user: data.user,
        requiresPasswordChange: Boolean(data.requiresPasswordChange),
      };
    }
  } catch {
    // ignore
  }
  return { token: null, user: null, requiresPasswordChange: false };
}

function saveStored(
  token: string | null,
  user: LoginResponse["user"] | null,
  requiresPasswordChange = false
) {
  if (token && user) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token, user, requiresPasswordChange })
    );
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadStored);

  useEffect(() => {
    setState(loadStored());
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string | null) => {
      const data = await apiLogin(email, password, tenantSlug);
      const mustChange = Boolean(data.requiresPasswordChange);
      setState({ token: data.token, user: data.user, requiresPasswordChange: mustChange });
      saveStored(data.token, data.user, mustChange);
      return { requiresPasswordChange: mustChange };
    },
    []
  );

  const logout = useCallback(() => {
    setState({ token: null, user: null, requiresPasswordChange: false });
    saveStored(null, null);
  }, []);

  const clearRequiresPasswordChange = useCallback(() => {
    setState((prev) =>
      prev.token && prev.user
        ? { ...prev, requiresPasswordChange: false }
        : prev
    );
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.token && data?.user) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...data, requiresPasswordChange: false })
          );
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    isAuthenticated: !!state.token,
    login,
    logout,
    clearRequiresPasswordChange,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
