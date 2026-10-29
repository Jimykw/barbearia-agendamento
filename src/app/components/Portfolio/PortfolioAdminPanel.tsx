import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { API_URL, del, postMultipart, put } from "@/services/api";
import { PORTFOLIO_UPDATED_EVENT } from "@/hooks/usePortfolioConfig";
import type { PortfolioCategoryDef, PortfolioItemDef } from "@/app/shared/portfolio-items";
import { slugifyPortfolioCategoryId } from "@/app/shared/portfolio-items";

type UploadTarget = { type: "new" } | { type: "item"; id: string };

type Props = {
  seedCategories: PortfolioCategoryDef[];
  seedItems: PortfolioItemDef[];
  loadingSeeds: boolean;
  configuredOnServer: boolean;
};

export function PortfolioAdminPanel({
  seedCategories,
  seedItems,
  loadingSeeds,
  configuredOnServer,
}: Props) {
  const [categories, setCategories] = useState<PortfolioCategoryDef[]>([]);
  const [items, setItems] = useState<PortfolioItemDef[]>([]);
  const [newClassLabel, setNewClassLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  /** Qual envio está em andamento: "new" ou id do item (evita spinner em todos os botões). */
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<UploadTarget | null>(null);

  useEffect(() => {
    if (loadingSeeds) return;
    setCategories(seedCategories.map((c) => ({ ...c })));
    setItems(seedItems.map((i) => ({ ...i })));
  }, [loadingSeeds, seedCategories, seedItems]);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!newCategoryId || !categories.some((c) => c.id === newCategoryId)) {
      setNewCategoryId(categories[0].id);
    }
  }, [categories, newCategoryId]);

  const openFilePicker = (target: UploadTarget) => {
    setMessage(null);
    if (!API_URL) {
      setMessage({ type: "err", text: "Defina VITE_API_URL e inicie o backend para enviar imagens." });
      return;
    }
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || !target || !API_URL) return;

    const busyKey = target.type === "new" ? "new" : target.id;
    setUploadingFor(busyKey);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await postMultipart<{ url?: string; detail?: string }>("/api/portfolio/upload/", fd);
      const url = res.data && typeof res.data === "object" && "url" in res.data ? res.data.url : undefined;
      if (!res.ok || !url) {
        const detail =
          res.data && typeof res.data === "object" && "detail" in res.data
            ? String((res.data as { detail?: string }).detail)
            : null;
        setMessage({ type: "err", text: detail || "Falha no envio da imagem." });
        return;
      }
      if (target.type === "new") {
        setNewUrl(url);
        const stem = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
        if (stem) {
          setNewTitle((prev) => (prev.trim() ? prev : stem));
        }
        setMessage({ type: "ok", text: "Imagem enviada. Ajuste a legenda se quiser e clique em Adicionar imagem." });
      } else {
        setItems((prev) => prev.map((x) => (x.id === target.id ? { ...x, url } : x)));
        setMessage({ type: "ok", text: "Imagem deste item atualizada. Salve no site para publicar." });
      }
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Erro no envio." });
    } finally {
      setUploadingFor(null);
    }
  };

  const handleSave = async () => {
    setMessage(null);
    if (!API_URL) {
      setMessage({ type: "err", text: "Defina VITE_API_URL e inicie o backend para salvar." });
      return;
    }
    const trimmedCats = categories.map((c) => ({ ...c, label: c.label.trim() })).filter((c) => c.label);
    if (trimmedCats.length === 0) {
      setMessage({ type: "err", text: "Cadastre pelo menos uma classe de corte com nome." });
      return;
    }
    const catIds = new Set(trimmedCats.map((c) => c.id));
    for (const it of items) {
      if (!catIds.has(it.categoryId)) {
        setMessage({
          type: "err",
          text: `O item "${it.title || it.id}" usa uma classe que não existe mais.`,
        });
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        categories: trimmedCats.map((c, order) => ({ id: c.id, label: c.label, order })),
        items: items.map((it, order) => ({
          id: it.id,
          url: it.url.trim(),
          title: it.title.trim(),
          categoryId: it.categoryId,
          order,
        })),
      };
      const res = await put<{
        configured?: boolean;
        categories?: PortfolioCategoryDef[];
        items?: PortfolioItemDef[];
        detail?: string;
      }>("/api/portfolio/", payload);
      if (res.ok && res.data?.configured && res.data.categories && res.data.items) {
        setCategories(res.data.categories.map((c) => ({ ...c })));
        setItems(res.data.items.map((i) => ({ ...i })));
        setMessage({ type: "ok", text: "Portfólio salvo. As alterações já aparecem no site." });
        window.dispatchEvent(new Event(PORTFOLIO_UPDATED_EVENT));
      } else {
        const err =
          typeof res.data === "object" && res.data && "detail" in res.data
            ? String((res.data as { detail?: string }).detail)
            : JSON.stringify(res.data ?? {});
        setMessage({ type: "err", text: err || "Não foi possível salvar. Verifique os dados." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!API_URL) return;
    if (!window.confirm("Remover a personalização e voltar ao portfólio padrão do site?")) return;
    setResetting(true);
    setMessage(null);
    try {
      const res = await del("/api/portfolio/");
      if (res.ok || res.status === 204) {
        setMessage({ type: "ok", text: "Personalização removida. O site voltou ao conteúdo padrão." });
        window.dispatchEvent(new Event(PORTFOLIO_UPDATED_EVENT));
      } else {
        setMessage({ type: "err", text: "Não foi possível restaurar o padrão." });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro ao restaurar." });
    } finally {
      setResetting(false);
    }
  };

  const addCategory = () => {
    const label = newClassLabel.trim();
    if (!label) return;
    const existing = categories.map((c) => c.id);
    const id = slugifyPortfolioCategoryId(label, existing);
    setCategories((prev) => [...prev, { id, label, order: prev.length }]);
    setNewClassLabel("");
    setNewCategoryId(id);
  };

  const removeCategory = (id: string) => {
    if (items.some((it) => it.categoryId === id)) return;
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const addItem = () => {
    const url = newUrl.trim();
    const title = newTitle.trim();
    if (!url || !title) {
      setMessage({ type: "err", text: "Preencha URL da imagem (ou envie um arquivo) e a legenda." });
      return;
    }
    let validUrl = url;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      setMessage({ type: "err", text: "Informe uma URL válida (http ou https), ou envie uma imagem." });
      return;
    }
    const cat = newCategoryId || categories[0]?.id;
    if (!cat) {
      setMessage({ type: "err", text: "Crie pelo menos uma classe antes de adicionar imagens." });
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}`,
        url: validUrl,
        title,
        categoryId: cat,
        order: prev.length,
      },
    ]);
    setNewUrl("");
    setNewTitle("");
    setMessage(null);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (loadingSeeds) {
    return (
      <Card className="mb-10 border-accent/25 bg-black/40">
        <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Carregando dados do portfólio…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-10 min-w-0 max-w-full border-accent/30 bg-gradient-to-b from-black/80 to-black/40 shadow-[0_0_40px_-20px_rgba(212,175,55,0.35)]">
      <CardHeader className="min-w-0">
        <CardTitle className="min-w-0 break-words text-accent">Gestão do portfólio (admin)</CardTitle>
        <CardDescription className="min-w-0 break-words">
          Envie fotos do computador ou da galeria do celular, ou cole URL. Depois use &quot;Salvar no site&quot; para
          publicar.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 max-w-full space-y-8 overflow-x-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => void handleFileSelected(e)}
        />

        {!API_URL ? (
          <p className="text-sm text-amber-200/90">
            Sem <code className="rounded bg-white/10 px-1">VITE_API_URL</code> o site usa apenas o portfólio padrão;
            configure a API para persistir edições.
          </p>
        ) : null}

        {message ? (
          <p
            className={
              message.type === "ok" ? "text-sm text-emerald-400" : "text-sm text-red-400"
            }
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Classes de corte (filtros)
          </h3>
          <div className="space-y-2 rounded-md border border-border/60 bg-background/30 p-3">
            {categories.map((c) => (
              <div key={c.id} className="flex flex-wrap items-end gap-2 sm:items-center">
                <div className="grid w-full gap-1 sm:max-w-[140px]">
                  <Label className="text-[10px] uppercase text-muted-foreground">Id</Label>
                  <Input value={c.id} readOnly className="h-9 font-mono text-xs" />
                </div>
                <div className="grid min-w-0 flex-1 gap-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Nome exibido</Label>
                  <Input
                    value={c.label}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    className="h-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={items.some((it) => it.categoryId === c.id)}
                  title={
                    items.some((it) => it.categoryId === c.id)
                      ? "Remova ou reatribua imagens desta classe antes de excluir"
                      : "Remover classe"
                  }
                  onClick={() => removeCategory(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex min-w-0 flex-wrap items-end gap-2 border-t border-border/40 pt-3">
              <div className="grid min-w-0 flex-1 gap-1 sm:min-w-[200px]">
                <Label htmlFor="new-class-label">Nova classe</Label>
                <Input
                  id="new-class-label"
                  placeholder="Ex.: Pigmentação"
                  value={newClassLabel}
                  onChange={(e) => setNewClassLabel(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button type="button" variant="outline" className="gap-1" onClick={addCategory}>
                <Plus className="h-4 w-4" />
                Adicionar classe
              </Button>
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-full space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Imagens do portfólio
          </h3>
          <div className="max-h-[min(480px,55vh)] min-w-0 space-y-3 overflow-x-hidden overflow-y-auto rounded-md border border-border/60 bg-background/30 p-3 pr-1">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma imagem. Adicione abaixo.</p>
            ) : (
              items.map((it) => (
                <div
                  key={it.id}
                  className="grid min-w-0 max-w-full gap-2 rounded border border-white/5 bg-black/20 p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,120px)_auto]"
                >
                  <div className="grid min-w-0 gap-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">URL da imagem</Label>
                    <Input
                      value={it.url}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.id === it.id ? { ...x, url: e.target.value } : x)),
                        )
                      }
                      className="h-9 min-w-0 break-all font-mono text-xs"
                    />
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Legenda</Label>
                    <Input
                      value={it.title}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)),
                        )
                      }
                      className="h-9"
                    />
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Classe</Label>
                    <select
                      className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                      value={it.categoryId}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id ? { ...x, categoryId: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-end justify-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={uploadingFor !== null || !API_URL}
                      onClick={() => openFilePicker({ type: "item", id: it.id })}
                    >
                      {uploadingFor === it.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Enviar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(it.id)}
                      aria-label="Remover imagem"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 rounded-md border border-dashed border-accent/30 bg-accent/5 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid min-w-0 gap-2 sm:col-span-2">
              <Label htmlFor="new-img-url" className="min-w-0 break-words leading-snug">
                Nova imagem — URL (opcional se enviar arquivo)
              </Label>
              <Input
                id="new-img-url"
                placeholder="https://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="h-9 w-full min-w-0 max-w-full break-all font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="inline-flex h-auto w-full max-w-full flex-wrap items-center justify-center gap-2 whitespace-normal py-2.5 text-center sm:w-fit sm:flex-nowrap sm:py-2"
                disabled={uploadingFor !== null || !API_URL}
                onClick={() => openFilePicker({ type: "new" })}
              >
                {uploadingFor === "new" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 shrink-0" />
                )}
                Enviar imagem (PC ou galeria do celular)
              </Button>
            </div>
            <div className="grid min-w-0 gap-1">
              <Label htmlFor="new-img-title" className="min-w-0 break-words">
                Legenda
              </Label>
              <Input
                id="new-img-title"
                placeholder="Ex.: Fade baixo"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="h-9 w-full min-w-0 max-w-full"
              />
            </div>
            <div className="grid min-w-0 gap-1">
              <Label htmlFor="new-img-class" className="min-w-0 break-words">
                Classe
              </Label>
              <select
                id="new-img-class"
                className="flex h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm"
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 items-stretch sm:col-span-2 sm:items-end lg:col-span-4">
              <Button
                type="button"
                variant="primary"
                className="inline-flex h-auto w-full max-w-full flex-wrap items-center justify-center gap-2 whitespace-normal py-2.5 sm:w-auto sm:flex-nowrap sm:py-2"
                onClick={addItem}
              >
                <ImagePlus className="h-4 w-4 shrink-0" />
                Adicionar imagem à lista
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-border/50 pt-4">
          <Button
            type="button"
            variant="primary"
            disabled={saving || uploadingFor !== null || !API_URL}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar no site
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resetting || uploadingFor !== null || !API_URL || !configuredOnServer}
            onClick={() => void handleReset()}
          >
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Restaurar padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
