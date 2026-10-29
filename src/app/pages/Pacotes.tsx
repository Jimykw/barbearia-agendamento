import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, Package, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { API_URL } from "@/services/api";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";
import { PackageSubscriptionReviewModal } from "@/app/components/PackageSubscriptionReviewModal";
import { formatPackageSessionsLabel } from "@/lib/clientPackageCopy";

type ClientPackage = {
  id: number;
  name: string;
  description: string;
  sessions: number;
  sessions_unlimited?: boolean;
  price: string;
  validity_days: number;
  is_active: boolean;
};

type MyPackageSubscription = {
  id: number;
  status: string;
  status_display?: string;
  package?: { name?: string } | null;
  sessions_total?: number;
  sessions_used?: number;
  sessions_unlimited?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  login_notice_reason?: string;
  expiry_notice_label?: string;
};

function subscriptionRecencyTime(sub: MyPackageSubscription): number {
  const raw = sub.updated_at || sub.ends_at || sub.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function expiredPlanBannerLines(sub: MyPackageSubscription): { title: string; detail: string } {
  const plan = sub.package?.name ?? "Plano contratado";
  const reason = String(sub.login_notice_reason || "").trim();
  const label = String(sub.expiry_notice_label || "").trim();
  const unlimited = Boolean(sub.sessions_unlimited);
  const total = Number(sub.sessions_total ?? 0);
  const used = Number(sub.sessions_used ?? 0);
  const sessionsLine = unlimited
    ? "Plano com sessões ilimitadas na vigência."
    : total > 0
      ? `Sessões utilizadas: ${used} de ${total}.`
      : "";

  if (reason === "sessions_depleted" || label.includes("Sessões")) {
    return {
      title: `O pacote "${plan}" que contratou encerrou: as sessões foram esgotadas (expiradas).`,
      detail: sessionsLine ? `${sessionsLine} Pode escolher um novo pacote abaixo quando quiser.` : "Pode escolher um novo pacote abaixo quando quiser.",
    };
  }
  if (reason === "plan_date_expired" || label.includes("Prazo")) {
    return {
      title: `O pacote "${plan}" que contratou encerrou: o prazo de validade do plano expirou.`,
      detail: sessionsLine ? `${sessionsLine} Pode escolher um novo pacote abaixo quando quiser.` : "Pode escolher um novo pacote abaixo quando quiser.",
    };
  }
  return {
    title: `O pacote "${plan}" que contratou já não está ativo (encerrado).`,
    detail: label ? `${label}. ${sessionsLine}`.trim() : sessionsLine || "Pode escolher um novo pacote abaixo quando quiser.",
  };
}

export default function Pacotes() {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [mySubscriptions, setMySubscriptions] = useState<MyPackageSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmittingId, setIsSubmittingId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [isSubscriptionRequested, setIsSubscriptionRequested] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewPackageName, setReviewPackageName] = useState<string | null>(null);
  const [navigateAfterReviewClose, setNavigateAfterReviewClose] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchPackages = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/client-packages/`);
        if (!response.ok) {
          setFeedback("Não foi possível carregar os pacotes agora.");
          setPackages([]);
          return;
        }
        const data = await response.json();
        setPackages(Array.isArray(data) ? (data as ClientPackage[]) : []);
      } catch {
        setFeedback("Erro de conexão ao carregar os pacotes.");
        setPackages([]);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchPackages();
  }, []);

  useEffect(() => {
    if (user?.role !== "cliente") {
      setMySubscriptions([]);
      return;
    }
    const headers = getAuthHeaders();
    if (!headers) return;
    const fetchSubscriptions = async () => {
      try {
        const response = await fetch(`${API_URL}/api/client-packages/subscriptions/`, { headers });
        if (!response.ok) return;
        const data = await response.json();
        setMySubscriptions(Array.isArray(data) ? data : []);
      } catch {
        // segue sem bloquear a tela
      }
    };
    void fetchSubscriptions();
  }, [getAuthHeaders, user?.role]);

  const isCliente = user?.role === "cliente";
  const activeOrPendingSubscription = useMemo(
    () =>
      isCliente
        ? mySubscriptions.find((sub) => ["active", "pending"].includes(String(sub.status || "").toLowerCase()))
        : undefined,
    [isCliente, mySubscriptions],
  );
  const primaryExpiredSubscription = useMemo(() => {
    if (!isCliente) return undefined;
    const expired = mySubscriptions.filter((sub) => String(sub.status || "").toLowerCase() === "expired");
    if (expired.length === 0) return undefined;
    return [...expired].sort((a, b) => subscriptionRecencyTime(b) - subscriptionRecencyTime(a))[0];
  }, [isCliente, mySubscriptions]);
  const expiredPlanBanner = useMemo(
    () => (primaryExpiredSubscription ? expiredPlanBannerLines(primaryExpiredSubscription) : null),
    [primaryExpiredSubscription],
  );
  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );
  const currentStep = useMemo<1 | 2 | 3>(() => {
    if (isSubscriptionRequested) return 3;
    if (selectedPackage) return 2;
    return 1;
  }, [isSubscriptionRequested, selectedPackage]);

  useEffect(() => {
    const packageFromQuery = Number(searchParams.get("package"));
    if (!packageFromQuery || Number.isNaN(packageFromQuery) || !packages.length) return;
    const exists = packages.some((pkg) => pkg.id === packageFromQuery);
    if (!exists) return;
    setSelectedPackageId(packageFromQuery);
    setIsSubscriptionRequested(false);
    setFeedback(null);
    window.setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("package");
      return next;
    });
  }, [packages, searchParams, setSearchParams]);

  const handleSelectPackage = (pkg: ClientPackage) => {
    setSelectedPackageId(pkg.id);
    setIsSubscriptionRequested(false);
    setFeedback(null);
    window.setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const handleSubscribe = async (pkg: ClientPackage) => {
    if (user?.role !== "cliente") {
      setFeedback("Assinatura de pacotes é apenas para contas de cliente. Use o painel admin para gerir assinaturas.");
      return;
    }
    const name = user?.name || "";
    const email = user?.email || "";
    const phone = user?.phone || "";
    if (!name || !email || !phone) {
      setFeedback("Complete seu perfil (nome, e-mail e telefone) para assinar um pacote.");
      return;
    }

    setIsSubmittingId(pkg.id);
    setFeedback(null);
    try {
      const response = await fetch(`${API_URL}/api/client-packages/subscribe/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: pkg.id,
          name,
          email,
          phone,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(
          (data as { detail?: string } | null)?.detail ||
            (data as { package_id?: string[] } | null)?.package_id?.[0] ||
            "Não foi possível solicitar o pacote.",
        );
        return;
      }
      setReviewPackageName(pkg.name);
      setNavigateAfterReviewClose(true);
      setShowReviewModal(true);
      setIsSubscriptionRequested(true);
      const authHeaders = getAuthHeaders();
      if (authHeaders) {
        try {
          const subRes = await fetch(`${API_URL}/api/client-packages/subscriptions/`, { headers: authHeaders });
          if (subRes.ok) {
            const subData = await subRes.json();
            setMySubscriptions(Array.isArray(subData) ? subData : []);
          }
        } catch {
          // mantém lista anterior
        }
      }
    } catch {
      setFeedback("Erro de conexão ao solicitar pacote.");
    } finally {
      setIsSubmittingId(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-background px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="premium-title text-3xl sm:text-4xl tracking-tight mb-2">Pacotes de Assinatura</h1>
          <p className="text-muted-foreground">
            Escolha um pacote e receba atendimento prioritário com economia para suas próximas visitas.
          </p>
        </motion.div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="premium-glass-card rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="flex items-center gap-2 text-accent">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Atendimento prioritário</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Fila preferencial para clientes de plano.</p>
          </div>
          <div className="premium-glass-card rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="flex items-center gap-2 text-accent">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm font-medium">Valores fixos</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Preço previsível e economia por sessão.</p>
          </div>
          <div className="premium-glass-card rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="flex items-center gap-2 text-accent">
              <Star className="h-4 w-4" />
              <span className="text-sm font-medium">Experiência premium</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Suporte dedicado por WhatsApp e e-mail.</p>
          </div>
        </div>

        <div className="mb-8 premium-glass-card rounded-xl border border-border/70 bg-card/35 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-accent">
            <Package className="h-4 w-4" />
            <span className="text-sm font-medium">Etapas da assinatura</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { step: 1, label: "Escolha" },
              { step: 2, label: "Confirme" },
              { step: 3, label: "Pronto" },
            ].map((item) => {
              const isDone = currentStep > item.step;
              const isActive = currentStep === item.step;
              return (
                <motion.div
                  key={item.step}
                  initial={false}
                  animate={
                    isActive
                      ? {
                          scale: [1, 1.02, 1],
                          boxShadow: [
                            "0 0 0 0 rgba(212,175,55,0)",
                            "0 0 0 2px rgba(212,175,55,0.22)",
                            "0 0 0 0 rgba(212,175,55,0)",
                          ],
                        }
                      : {
                          scale: 1,
                          boxShadow: "0 0 0 0 rgba(212,175,55,0)",
                        }
                  }
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className={`rounded-lg border px-3 py-2 transition-all ${
                    isActive
                      ? "border-accent/70 bg-accent/15 text-accent"
                      : isDone
                        ? "border-accent/40 bg-accent/10 text-accent/90"
                        : "border-border/70 bg-background/30 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <motion.span
                      initial={false}
                      animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isActive || isDone ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.step}
                    </motion.span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {feedback && (
          <div className="mb-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
            {feedback}
          </div>
        )}
        {activeOrPendingSubscription && (
          <div className="mb-6 rounded-xl border border-accent/45 bg-accent/10 px-4 py-3 text-sm text-accent">
            Você já possui um plano ativo/pendente ({activeOrPendingSubscription.package?.name ?? "plano atual"}).
          </div>
        )}
        {!activeOrPendingSubscription && expiredPlanBanner ? (
          <div
            className="mb-6 rounded-xl border border-amber-500/45 bg-amber-500/10 px-4 py-3 text-sm text-amber-50 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.12)]"
            role="status"
          >
            <p className="font-medium text-amber-100/95">{expiredPlanBanner.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-50/90">{expiredPlanBanner.detail}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando pacotes...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className={`premium-glass-card rounded-xl border bg-card/40 p-5 transition-all ${
                  selectedPackageId === pkg.id ? "border-accent shadow-[0_0_0_1px_rgba(212,175,55,0.35)]" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl">{pkg.name}</h2>
                  <Package className="w-5 h-5 text-accent" />
                </div>
                <p className="text-sm text-muted-foreground min-h-[52px]">{pkg.description || "Pacote exclusivo."}</p>

                <div className="mt-4 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <BadgeCheck className="w-4 h-4 text-accent" />
                    {formatPackageSessionsLabel(pkg.sessions, pkg.sessions_unlimited)}
                  </div>
                  <div className="flex items-center gap-2">
                    <BadgeCheck className="w-4 h-4 text-accent" />
                    Validade de {pkg.validity_days} dias
                  </div>
                </div>

                <div className="mt-4 text-2xl text-accent font-semibold">
                  R$ {Number(pkg.price).toFixed(2)}
                </div>

                <Button
                  type="button"
                  variant="accentOutline"
                  onClick={() => handleSelectPackage(pkg)}
                  disabled={Boolean(activeOrPendingSubscription)}
                  className="mt-5 w-full"
                >
                  {selectedPackageId === pkg.id ? "Pacote selecionado" : "Selecionar pacote"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {selectedPackage && (
            <motion.div
              key={`summary-${selectedPackage.id}-${currentStep}`}
              ref={summaryRef}
              initial={{ opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.995 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="mt-8 premium-glass-card rounded-xl border border-accent/40 bg-card/45 p-5"
            >
              <div className="mb-3 flex items-center gap-2 text-accent">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="text-lg">Confirme sua assinatura</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Plano:</span> {selectedPackage.name}</div>
                <div>
                  <span className="text-muted-foreground">Sessões:</span>{" "}
                  {formatPackageSessionsLabel(selectedPackage.sessions, selectedPackage.sessions_unlimited)}
                </div>
                <div><span className="text-muted-foreground">Validade:</span> {selectedPackage.validity_days} dias</div>
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-2xl font-semibold text-accent">
                  R$ {Number(selectedPackage.price).toFixed(2)}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelectedPackageId(null);
                      setIsSubscriptionRequested(false);
                    }}
                    className="w-full sm:w-auto"
                  >
                    Trocar plano
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleSubscribe(selectedPackage)}
                    disabled={Boolean(activeOrPendingSubscription) || (isSubmittingId !== null && isSubmittingId !== selectedPackage.id)}
                    isLoading={isSubmittingId === selectedPackage.id}
                    className="w-full sm:w-auto"
                  >
                    Assinar pacote
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <PackageSubscriptionReviewModal
          open={showReviewModal}
          packageName={reviewPackageName}
          onOpenChange={(open) => {
            setShowReviewModal(open);
            if (!open && navigateAfterReviewClose) {
              setNavigateAfterReviewClose(false);
              navigate("/minha-conta?tab=meu-plano");
            }
          }}
        />
      </div>
    </div>
  );
}
