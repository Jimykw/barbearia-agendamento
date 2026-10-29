/** Página pública inicial (aba Início). */
export const HOME_PATH = "/";

/**
 * Formulário de credenciais (só linkado no menu).
 * A rota /login redireciona sempre para HOME_PATH (Django + React).
 */
export const LOGIN_PATH = "/entrar";

/** sessionStorage: definido ao clicar em "Login" no menu antes de navegar. */
export const LOGIN_INTENT_KEY = "barbearia_login_intent";

export type LoginLocationState = {
  fromLoginIntent?: boolean;
};

export const loginLocationState: LoginLocationState = { fromLoginIntent: true };

export function setLoginIntent(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LOGIN_INTENT_KEY, "1");
}

export function clearLoginIntent(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LOGIN_INTENT_KEY);
}

export function hasLoginIntent(locationState: unknown): boolean {
  if (typeof window !== "undefined" && sessionStorage.getItem(LOGIN_INTENT_KEY) === "1") {
    return true;
  }
  const state = locationState as LoginLocationState | null;
  return Boolean(state?.fromLoginIntent);
}
