/**
 * Serviço de API centralizado
 * Wrapper para fetch com autenticação JWT
 */

const rawApiUrl = import.meta.env.VITE_API_URL;
const devFallbackApiUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
export const API_URL = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, "")
  : devFallbackApiUrl;
const AUTH_STORAGE_KEY = "barbearia_auth";

// Tipos
interface RequestOptions extends RequestInit {
  params?: Record<string, any>;
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
  ok: boolean;
}

/**
 * Faz uma requisição autenticada
 */
async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { params, ...fetchOptions } = options;

  // Construir URL com query params
  let url = `${API_URL}${endpoint}`;
  if (params) {
    const queryString = new URLSearchParams(params).toString();
    url = `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
  }

  // Adicionar headers padrão
  const headers = new Headers(fetchOptions.headers || {});
  headers.set("Content-Type", "application/json");

  // Adicionar token JWT se disponível
  const authItem = localStorage.getItem(AUTH_STORAGE_KEY);
  let token = localStorage.getItem("access_token");
  if (authItem) {
    try {
      const auth = JSON.parse(authItem) as { access?: string; access_token?: string };
      token = auth.access ?? auth.access_token ?? token;
    } catch {
      // fallback to access_token
    }
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json().catch(() => null);

    return {
      data,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    throw new Error(
      `API Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * GET request
 */
export const get = <T = any>(endpoint: string, options?: RequestOptions) =>
  request<T>(endpoint, { ...options, method: "GET" });

/**
 * POST request
 */
export const post = <T = any>(
  endpoint: string,
  data?: any,
  options?: RequestOptions
) =>
  request<T>(endpoint, {
    ...options,
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
  });

/**
 * PATCH request
 */
export const patch = <T = any>(
  endpoint: string,
  data?: any,
  options?: RequestOptions
) =>
  request<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });

/**
 * DELETE request
 */
export const del = <T = any>(endpoint: string, options?: RequestOptions) =>
  request<T>(endpoint, { ...options, method: "DELETE" });

/**
 * PUT request
 */
export const put = <T = any>(
  endpoint: string,
  data?: any,
  options?: RequestOptions
) =>
  request<T>(endpoint, {
    ...options,
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });

/**
 * POST multipart (ex.: upload de imagem). Não define Content-Type para o browser enviar boundary.
 */
export async function postMultipart<T = any>(
  endpoint: string,
  formData: FormData,
  options: Omit<RequestOptions, "body"> = {}
): Promise<ApiResponse<T>> {
  let url = `${API_URL}${endpoint}`;
  if (options.params) {
    const queryString = new URLSearchParams(options.params).toString();
    url = `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
  }

  const headers = new Headers(options.headers || {});
  const authItem = localStorage.getItem(AUTH_STORAGE_KEY);
  let token = localStorage.getItem("access_token");
  if (authItem) {
    try {
      const auth = JSON.parse(authItem) as { access?: string; access_token?: string };
      token = auth.access ?? auth.access_token ?? token;
    } catch {
      // ignore
    }
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    method: "POST",
    body: formData,
    headers,
  });
  const data = await response.json().catch(() => null);
  return { data, status: response.status, ok: response.ok };
}

export default {
  get,
  post,
  patch,
  delete: del,
  put,
  postMultipart,
  request,
  API_URL,
};
