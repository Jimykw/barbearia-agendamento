import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, get } from "@/services/api";

export const PORTFOLIO_UPDATED_EVENT = "barbearia-portfolio-updated";
import {
  DEFAULT_PORTFOLIO_CATEGORIES,
  PORTFOLIO_ITEMS,
  sortPortfolioByOrder,
  type PortfolioCategoryDef,
  type PortfolioItemDef,
} from "@/app/shared/portfolio-items";

type PortfolioApiOk = {
  configured: true;
  categories: PortfolioCategoryDef[];
  items: PortfolioItemDef[];
  updated_at?: string;
};

type PortfolioApiEmpty = { configured: false };

type PortfolioApiResponse = PortfolioApiOk | PortfolioApiEmpty;

export function usePortfolioConfig() {
  const [server, setServer] = useState<PortfolioApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!API_URL) {
      setLoading(false);
      setServer(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    void (async () => {
      try {
        const res = await get<PortfolioApiResponse>("/api/portfolio/");
        if (cancelled) return;
        if (res.ok && res.data && typeof res.data === "object" && "configured" in res.data) {
          setServer(res.data);
        } else {
          setServer(null);
          if (!res.ok) setFetchError("Não foi possível carregar o portfólio.");
        }
      } catch (e) {
        if (!cancelled) {
          setServer(null);
          setFetchError(e instanceof Error ? e.message : "Erro de rede.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, onUpdate);
  }, []);

  const assignableCategories = useMemo(() => {
    if (server?.configured && Array.isArray(server.categories) && server.categories.length > 0) {
      return sortPortfolioByOrder(server.categories);
    }
    return sortPortfolioByOrder(DEFAULT_PORTFOLIO_CATEGORIES);
  }, [server]);

  const items = useMemo(() => {
    if (server?.configured && Array.isArray(server.items)) {
      return sortPortfolioByOrder(server.items);
    }
    return sortPortfolioByOrder(PORTFOLIO_ITEMS);
  }, [server]);

  const filterCategories = useMemo(() => {
    return [{ id: "todos", label: "Todos", order: -999 }, ...assignableCategories.map((c) => ({ ...c }))];
  }, [assignableCategories]);

  const categoryLabelById = useMemo(() => {
    const m: Record<string, string> = { todos: "Todos" };
    for (const c of assignableCategories) {
      m[c.id] = c.label;
    }
    return m;
  }, [assignableCategories]);

  const configuredOnServer = Boolean(server?.configured);

  return {
    loading,
    fetchError,
    refetch,
    assignableCategories,
    filterCategories,
    items,
    categoryLabelById,
    configuredOnServer,
  };
}
