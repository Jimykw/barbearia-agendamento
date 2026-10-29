import { useEffect, useRef } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { useAuth } from "@/app/context/AuthContext";
import { HOME_PATH, clearLoginIntent, hasLoginIntent } from "@/lib/authRoutes";
import Login from "@/app/pages/Login";

/**
 * Só renderiza o formulário de login com intenção explícita (botão Login).
 * Qualquer acesso directo a /entrar sem intenção vai para Início (/).
 */
export default function LoginGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const allowedRef = useRef(false);

  const allowedNow =
    searchParams.get("intent") === "1" || hasLoginIntent(location.state);
  if (allowedNow) {
    allowedRef.current = true;
  }

  useEffect(() => () => clearLoginIntent(), []);

  if (isLoading) {
    return null;
  }

  if (isAuthenticated || !allowedRef.current) {
    return <Navigate to={HOME_PATH} replace />;
  }

  return <Login />;
}
