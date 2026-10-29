import { useState } from "react";
import { useNavigate } from "react-router";
import { Package, X } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { API_URL } from "@/services/api";

export function ClientPackageExpiryModal() {
  const { user, getAuthHeaders, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [dismissing, setDismissing] = useState(false);

  const notices = user?.role === "cliente" ? user.pending_package_notices ?? [] : [];
  if (notices.length === 0) return null;

  const runDismissAll = async () => {
    const headers = getAuthHeaders();
    if (!headers) return;
    setDismissing(true);
    try {
      for (const n of notices) {
        await fetch(`${API_URL}/api/client-packages/subscriptions/${n.id}/dismiss-login-notice/`, {
          method: "POST",
          headers,
        }).catch(() => null);
      }
      await refreshProfile();
    } finally {
      setDismissing(false);
    }
  };

  const goPacotes = async () => {
    await runDismissAll();
    navigate("/pacotes");
  };

  const hasSessionsReason = notices.some((n) => String(n.reason || "").includes("session"));
  const hasDateReason = notices.some((n) => String(n.reason || "").includes("plan_date"));

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !dismissing) void runDismissAll();
      }}
    >
      <DialogContent className="border-border/80 bg-card/95 backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg tracking-tight">
            <Package className="h-5 w-5 text-accent" aria-hidden />
            Plano encerrado
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2 text-left text-muted-foreground">
            <p>
              {hasSessionsReason && !hasDateReason
                ? "As sessões do seu pacote terminaram. Para continuar a usufruir de cortes com vantagens, renove ou escolha um novo pacote."
                : hasDateReason && !hasSessionsReason
                  ? "O prazo do seu plano de pacote expirou. Pode aderir a um novo pacote quando quiser."
                  : "O seu plano de pacote já não está ativo (sessões esgotadas ou prazo vencido)."}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
              {notices.map((n) => (
                <li key={n.id}>
                  <span className="font-medium">{n.package_name}</span>
                </li>
              ))}
            </ul>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="w-full gap-2 sm:w-auto"
            disabled={dismissing}
            onClick={() => void runDismissAll()}
          >
            <X className="h-4 w-4" aria-hidden />
            Fechar
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-full gap-2 sm:w-auto"
            disabled={dismissing}
            isLoading={dismissing}
            onClick={() => void goPacotes()}
          >
            Ver pacotes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
