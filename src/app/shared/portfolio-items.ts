export type PortfolioCategoryDef = {
  id: string;
  label: string;
  order?: number;
};

export type PortfolioItemDef = {
  id: string;
  url: string;
  title: string;
  categoryId: string;
  order?: number;
};

/** Categorias atribuíveis a fotos (o filtro "Todos" é só na UI). */
export const DEFAULT_PORTFOLIO_CATEGORIES: PortfolioCategoryDef[] = [
  { id: "cortes", label: "Cortes", order: 0 },
  { id: "barbas", label: "Barbas", order: 1 },
  { id: "completo", label: "Completo", order: 2 },
];

export const PORTFOLIO_ITEMS: PortfolioItemDef[] = [
  {
    id: "def-fade-classico",
    url: "https://images.unsplash.com/photo-1761931403671-d020a14928d9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "cortes",
    title: "Fade Clássico",
    order: 0,
  },
  {
    id: "def-barba-navalha",
    url: "https://images.unsplash.com/photo-1761148438883-e34e0289a214?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "barbas",
    title: "Barba com Navalha",
    order: 1,
  },
  {
    id: "def-combo",
    url: "https://images.unsplash.com/photo-1589985523654-936539ff49c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "completo",
    title: "Combo Corte + Barba",
    order: 2,
  },
  {
    id: "def-undercut",
    url: "https://images.unsplash.com/photo-1623766085518-610f6fe90a36?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "cortes",
    title: "Undercut Moderno",
    order: 3,
  },
  {
    id: "def-degrade",
    url: "https://images.unsplash.com/photo-1761931403663-050fbd8fb4c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "cortes",
    title: "Degradê Alto",
    order: 4,
  },
  {
    id: "def-barba-trad",
    url: "https://images.unsplash.com/photo-1589985494639-69e60c82cab2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "barbas",
    title: "Barba Tradicional",
    order: 5,
  },
  {
    id: "def-visual-completo",
    url: "https://images.unsplash.com/photo-1635273051264-0c44879bac27?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "completo",
    title: "Visual Completo",
    order: 6,
  },
  {
    id: "def-corte-moderno",
    url: "https://images.unsplash.com/photo-1759134248487-e8baaf31e33e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "cortes",
    title: "Corte Moderno",
    order: 7,
  },
  {
    id: "def-transformacao",
    url: "https://images.unsplash.com/photo-1759134155377-4207d89b39ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=800",
    categoryId: "completo",
    title: "Transformação Premium",
    order: 8,
  },
];

export function sortPortfolioByOrder<T extends { order?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Gera slug ASCII único para id de categoria (reservado: todos). */
export function slugifyPortfolioCategoryId(label: string, existingIds: string[]): string {
  const diacritics = /[\u0300-\u036f]/g;
  const base =
    label
      .normalize("NFD")
      .replace(diacritics, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "classe";
  const set = new Set(existingIds.map((x) => x.toLowerCase()));
  let id = base;
  let n = 2;
  while (set.has(id) || id === "todos") {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
