import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { API_URL } from "@/services/api";

type UserRole = "cliente" | "admin" | "barbeiro" | null;

export type PendingPackageNotice = {
  id: number;
  package_name: string;
  reason: string;
};

interface User {
  id?: number;
  username: string;
  role: UserRole;
  name: string;
  email?: string;
  phone?: string;
  /** Avisos de pacote expirado a mostrar no próximo acesso (cliente). */
  pending_package_notices?: PendingPackageNotice[];
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response | null>;
  updateUser: (
    partial: { name?: string; email?: string; phone?: string },
  ) => Promise<User>;
  /** Recarrega nome, e-mail, telefone e papel a partir do servidor (ex.: após admin editar o próprio perfil). */
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  getAuthHeaders: () => { Authorization: string; "Content-Type": string } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_STORAGE_KEY = "barbearia_auth";

function mapApiUserToContextUser(data: {
  id?: number;
  username?: string;
  role?: string | null;
  first_name?: string | null;
  email?: string | null;
  phone?: string | null;
  pending_package_notices?: unknown;
}): User {
  const username = String(data.username || "");
  const raw = data.pending_package_notices;
  const pending_package_notices = Array.isArray(raw)
    ? (raw as PendingPackageNotice[])
        .filter((x) => x && typeof x.id === "number")
        .map((x) => ({
          id: x.id,
          package_name: String(x.package_name || "Pacote"),
          reason: String(x.reason || ""),
        }))
    : undefined;
  return {
    id: typeof data.id === "number" ? data.id : undefined,
    username,
    role: (data.role as UserRole) ?? null,
    name: (data.first_name && String(data.first_name).trim()) || username,
    email: data.email ?? undefined,
    phone: data.phone ?? undefined,
    pending_package_notices:
      pending_package_notices && pending_package_notices.length > 0 ? pending_package_notices : undefined,
  };
}

type StoredAuth = {
  access?: string;
  refresh?: string;
  access_token?: string;
  refresh_token?: string;
  user: User;
};

function getBackendErrorMessage(errorData: any, fallback: string) {
  if (!errorData) {
    return fallback;
  }
  if (typeof errorData.detail === "string") {
    return errorData.detail;
  }
  if (Array.isArray(errorData.non_field_errors) && errorData.non_field_errors.length > 0) {
    return String(errorData.non_field_errors[0]);
  }
  if (typeof errorData.message === "string") {
    return errorData.message;
  }
  return fallback;
}

function isAuthTimingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(import.meta.env.DEV) || localStorage.getItem("DEBUG_AUTH") === "1";
}

function authTimingLog(phase: string, ms: number): void {
  if (!isAuthTimingEnabled()) return;
  // eslint-disable-next-line no-console -- diagnóstico opcional (DEV ou DEBUG_AUTH=1)
  console.info(`[auth_timing] ${phase}: ${ms.toFixed(0)}ms`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!savedAuth) return null;
    try {
      const auth = JSON.parse(savedAuth) as StoredAuth;
      return auth.user ?? null;
    } catch {
      return null;
    }
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth) as StoredAuth;
        return auth.access ?? auth.access_token ?? null;
      } catch {
        // ignore malformed cache and fallback to legacy key
      }
    }
    return localStorage.getItem("access_token");
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshAccessToken = async (refreshToken: string): Promise<string | null> => {
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${API_URL}/api/auth/token/refresh/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const newAccess = typeof data.access === "string" ? data.access : null;
      if (!newAccess) return null;

      setAccessToken(newAccess);
      localStorage.setItem("access_token", newAccess);

      const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (savedAuth) {
        try {
          const storedAuth = JSON.parse(savedAuth) as StoredAuth;
          localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({
              ...storedAuth,
              access: newAccess,
              access_token: newAccess,
            }),
          );
        } catch {
          // keep legacy keys as fallback
        }
      }
      return newAccess;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      let token: string | null = null;
      let refreshToken: string | null = null;

      if (savedAuth) {
        try {
          const auth = JSON.parse(savedAuth) as StoredAuth;
          token = auth.access ?? auth.access_token ?? null;
          refreshToken = auth.refresh ?? auth.refresh_token ?? null;
        } catch {
          token = null;
          refreshToken = null;
        }
      }

      if (!token) {
        token = localStorage.getItem("access_token");
      }
      if (!refreshToken) {
        refreshToken = localStorage.getItem("refresh_token");
      }

      if (!token) {
        setUser(null);
        setAccessToken(null);
        setIsLoading(false);
        return;
      }

      setAccessToken(token);

      try {
        const response = await fetch(`${API_URL}/api/auth/user/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          if ((response.status === 401 || response.status === 403) && refreshToken) {
            const renewedAccess = await refreshAccessToken(refreshToken);
            if (renewedAccess) {
              const retryResponse = await fetch(`${API_URL}/api/auth/user/`, {
                headers: {
                  Authorization: `Bearer ${renewedAccess}`,
                  "Content-Type": "application/json",
                },
              });
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                const loadedUser = mapApiUserToContextUser(retryData);
                setUser(loadedUser);
                if (savedAuth) {
                  const storedAuth = JSON.parse(savedAuth) as StoredAuth;
                  localStorage.setItem(
                    AUTH_STORAGE_KEY,
                    JSON.stringify({ ...storedAuth, user: loadedUser, access: renewedAccess, access_token: renewedAccess }),
                  );
                }
                setIsLoading(false);
                return;
              }
            }
          }
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
          setAccessToken(null);
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        const loadedUser = mapApiUserToContextUser(data);
        setUser(loadedUser);

        if (savedAuth) {
          const storedAuth = JSON.parse(savedAuth) as StoredAuth;
          localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({ ...storedAuth, user: loadedUser }),
          );
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const response = await fetch(`${API_URL}/api/auth/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    const t1 = typeof performance !== "undefined" ? performance.now() : 0;
    authTimingLog("login POST /api/auth/login/ (fetch completo)", t1 - t0);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message = getBackendErrorMessage(errorData, "Usuário ou senha incorretos.");
      throw new Error(message);
    }

    const tJson0 = typeof performance !== "undefined" ? performance.now() : 0;
    const data = (await response.json()) as {
      access: string;
      refresh: string;
      user?: Record<string, unknown>;
    };
    const tJson1 = typeof performance !== "undefined" ? performance.now() : 0;
    authTimingLog("login resposta JSON parse", tJson1 - tJson0);

    let loggedUser: User;
    if (data.user && typeof data.user === "object") {
      authTimingLog("login caminho feliz: 1 HTTP (sem GET /api/auth/user/)", 0);
      loggedUser = mapApiUserToContextUser(
        data.user as {
          id?: number;
          username?: string;
          role?: string | null;
          first_name?: string | null;
          email?: string | null;
          phone?: string | null;
          pending_package_notices?: unknown;
        },
      );
    } else {
      if (isAuthTimingEnabled()) {
        // eslint-disable-next-line no-console -- diagnóstico opcional
        console.warn(
          "[auth_timing] Login sem `user` no JSON: será feito GET /api/auth/user/ (verificar backend ou proxy).",
        );
      }
      const tUser0 = typeof performance !== "undefined" ? performance.now() : 0;
      const userResponse = await fetch(`${API_URL}/api/auth/user/`, {
        headers: {
          Authorization: `Bearer ${data.access}`,
          "Content-Type": "application/json",
        },
      });
      const tUser1 = typeof performance !== "undefined" ? performance.now() : 0;
      authTimingLog("login fallback GET /api/auth/user/", tUser1 - tUser0);

      if (!userResponse.ok) {
        const errorData = await userResponse.json().catch(() => null);
        const message = getBackendErrorMessage(errorData, "Não foi possível recuperar os dados do usuário.");
        throw new Error(message);
      }

      const userData = await userResponse.json();
      loggedUser = mapApiUserToContextUser(userData);
    }

    const tEnd = typeof performance !== "undefined" ? performance.now() : 0;
    authTimingLog("login função total (até gravar estado)", tEnd - t0);

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        access: data.access,
        refresh: data.refresh,
        access_token: data.access,
        refresh_token: data.refresh,
        user: loggedUser,
      }),
    );
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    setAccessToken(data.access);
    setUser(loggedUser);
    return loggedUser;
  };

  const getAuthHeaders = () => {
    const liveAccessToken = accessToken || localStorage.getItem("access_token");
    if (!liveAccessToken) {
      return null;
    }
    if (!accessToken && liveAccessToken) {
      setAccessToken(liveAccessToken);
    }
    return {
      Authorization: `Bearer ${liveAccessToken}`,
      "Content-Type": "application/json",
    };
  };

  const authFetch = async (input: string, init: RequestInit = {}): Promise<Response | null> => {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    let refreshToken = localStorage.getItem("refresh_token");
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth) as StoredAuth;
        refreshToken = auth.refresh ?? auth.refresh_token ?? refreshToken;
      } catch {
        // ignore malformed auth cache
      }
    }

    let token = accessToken || localStorage.getItem("access_token");
    if (!token) {
      if (refreshToken) {
        token = await refreshAccessToken(refreshToken);
      }
      if (!token) return null;
    }

    const baseHeaders = new Headers(init.headers ?? {});
    if (!baseHeaders.has("Authorization")) {
      baseHeaders.set("Authorization", `Bearer ${token}`);
    }
    if (init.body && !baseHeaders.has("Content-Type")) {
      baseHeaders.set("Content-Type", "application/json");
    }

    let response = await fetch(input, { ...init, headers: baseHeaders });
    if ((response.status === 401 || response.status === 403) && refreshToken) {
      const renewedToken = await refreshAccessToken(refreshToken);
      if (!renewedToken) return response;

      const retryHeaders = new Headers(init.headers ?? {});
      retryHeaders.set("Authorization", `Bearer ${renewedToken}`);
      if (init.body && !retryHeaders.has("Content-Type")) {
        retryHeaders.set("Content-Type", "application/json");
      }
      response = await fetch(input, { ...init, headers: retryHeaders });
    }
    return response;
  };

  const updateUser = async (
    partial: { name?: string; email?: string; phone?: string },
  ): Promise<User> => {
    if (!accessToken) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const payload: Record<string, string> = {};
    if (partial.name !== undefined) payload.first_name = partial.name;
    if (partial.email !== undefined) payload.email = partial.email;
    if (partial.phone !== undefined) payload.phone = partial.phone;

    const response = await fetch(`${API_URL}/api/auth/user/`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message = getBackendErrorMessage(
        errorData,
        "Não foi possível atualizar o perfil.",
      );
      throw new Error(message);
    }

    const data = await response.json();
    const updatedUser = mapApiUserToContextUser(data);
    setUser(updatedUser);

    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedAuth) {
      try {
        const storedAuth = JSON.parse(savedAuth) as StoredAuth;
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ ...storedAuth, user: updatedUser }),
        );
      } catch {
        // Storage corrompido — ignora silenciosamente; estado in-memory continua válido.
      }
    }

    return updatedUser;
  };

  const logout = async () => {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    const fallbackRefresh = localStorage.getItem("refresh_token");
    let refresh = fallbackRefresh || "";
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth) as StoredAuth;
        refresh = auth.refresh ?? auth.refresh_token ?? refresh;
      } catch {
        // ignore malformed auth cache and continue with local cleanup
      }
    }
    if (accessToken && refresh) {
      try {
        await fetch(`${API_URL}/api/auth/logout/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh }),
        });
      } catch {
        // ignore backend logout failures and clear local session anyway
      }
    }
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/";
  };

  const refreshProfile = useCallback(async () => {
    const token =
      accessToken ||
      (typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
    if (!token || !API_URL) return;
    try {
      const response = await fetch(`${API_URL}/api/auth/user/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      const next = mapApiUserToContextUser(data);
      setUser(next);
      const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (savedAuth) {
        try {
          const storedAuth = JSON.parse(savedAuth) as StoredAuth;
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...storedAuth, user: next }));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }, [accessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        authFetch,
        updateUser,
        refreshProfile,
        isAuthenticated: !!user,
        isLoading,
        getAuthHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
