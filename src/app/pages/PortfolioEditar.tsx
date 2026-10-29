import { Navigate, Link } from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PortfolioAdminPanel } from "@/app/components/Portfolio/PortfolioAdminPanel";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolioConfig } from "@/hooks/usePortfolioConfig";

export default function PortfolioEditar() {
  const { user, isLoading } = useAuth();
  const {
    loading,
    fetchError,
    assignableCategories,
    items,
    configuredOnServer,
  } = usePortfolioConfig();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return <Navigate to="/portfolio" replace />;
  }

  return (
    <div className="overflow-x-hidden bg-background py-24 pb-16">
      <div className="mx-auto max-w-5xl min-w-0 px-6">
        <Link
          to="/portfolio"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao portfólio público
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Editar portfólio</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Gerencie classes, legendas e imagens. No computador use &quot;Enviar imagem&quot; para escolher arquivos; no
            celular o mesmo botão abre a galeria ou arquivos do aparelho.
          </p>
          {fetchError ? (
            <p className="mt-3 text-sm text-amber-200/90">{fetchError} Exibindo dados padrão até a API responder.</p>
          ) : null}
        </div>

        <PortfolioAdminPanel
          seedCategories={assignableCategories}
          seedItems={items}
          loadingSeeds={loading}
          configuredOnServer={configuredOnServer}
        />
      </div>
    </div>
  );
}
