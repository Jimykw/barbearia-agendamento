import { motion } from "motion/react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import {
  Calendar,
  Clock,
  CheckCircle,
  Scissors,
  DollarSign,
  TrendingUp,
  User,
  Mail,
  Phone,
  Edit2,
  AlertCircle,
  Timer,
  Ban,
  Banknote,
  QrCode,
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";
import { StatusBadge } from "@/app/components/ui/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { resolveOperationalStatus } from "@/app/shared/appointment-status";
import { API_URL } from "@/services/api";
import { usePagination } from "@/app/hooks/usePagination";
import { ListPaginationBar } from "@/app/components/ListPaginationBar";

const SERVICE_LABELS: Record<string, string> = {
  corte: "Corte",
  barba: "Barba",
  completo: "Corte + Barba",
  platinado: "Platinado",
  pigmentacao: "Pigmentação",
};

const SERVICE_PRICES: Record<string, number> = {
  corte: 50,
  barba: 40,
  completo: 80,
  platinado: 150,
  pigmentacao: 100,
};

type ApiStatus = "agendado" | "pendente" | "confirmado" | "cancelado" | "em_atendimento" | "concluido";

type ApiAppointment = {
  id: number;
  name: string;
  email: string;
  phone: string;
  service: string;
  status: string;
  time: string;
  date: string;
  service_started_at: string | null;
  closing_payment_method?: string;
  closing_payment_display?: string;
  package_subscription?: number | null;
  /** True quando a API permite encerrar consumindo sessão de pacote (há sessão e vigência). */
  package_close_available?: boolean;
};

type AgendamentoRow = {
  id: number;
  cliente: string;
  email: string;
  telefone: string;
  servico: string;
  serviceKey: string;
  date: string;
  horario: string;
  valor: string;
  price: number;
  apiStatus: ApiStatus;
  uiStatus: ApiStatus;
  startedAt: number | null;
  isPackageCustomer: boolean;
  packageLabel: string;
  closingPaymentDisplay: string;
  packageCloseAvailable: boolean;
};

type StaffExpiredPlanRow = {
  id: number;
  name: string;
  email: string;
  packageLabel: string;
  reasonLabel: string;
  pendingClientNotice: boolean;
};

function formatTime(t: string) {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/** Data civil local (evita UTC de toISOString ao comparar com date da API). */
function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentLocalYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Converte YYYY-MM-DD para exibição pt-BR sem deslocar fuso. */
function formatISODatePtBR(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return iso || "";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("pt-BR");
}

function getFriendlyApiDetail(errorData: unknown, fallback: string) {
  if (!errorData || typeof errorData !== "object") return fallback;
  const data = errorData as { detail?: unknown; payment_method?: unknown };
  if (
    typeof data.detail === "string" &&
    data.detail.toLowerCase().includes("given token not valid")
  ) {
    return "Sessão expirada. Faça login novamente.";
  }
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  const pm = data.payment_method;
  if (Array.isArray(pm) && pm[0] != null && String(pm[0]).trim()) return String(pm[0]).trim();
  if (typeof pm === "string" && pm.trim()) return pm.trim();
  return fallback;
}

function normalizeApiStatus(s: string) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function parseApiStatus(s: string): ApiStatus {
  const normalized = normalizeApiStatus(s);

  if (
    normalized === "agendado" ||
    normalized === "pendente" ||
    normalized === "confirmado" ||
    normalized === "cancelado" ||
    normalized === "concluido" ||
    normalized === "em_atendimento" ||
    normalized === "ematendimento"
  ) {
    return normalized === "ematendimento" ? "em_atendimento" : normalized;
  }

  return "pendente";
}

function mapAppointment(a: ApiAppointment): AgendamentoRow {
  const st = parseApiStatus(a.status);
  const startedAt =
    st === "em_atendimento" && a.service_started_at
      ? new Date(a.service_started_at).getTime()
      : null;
  const price = SERVICE_PRICES[a.service] ?? 0;
  const linkedPackage =
    typeof a.package_subscription === "number" && !Number.isNaN(a.package_subscription) && a.package_subscription > 0;
  return {
    id: a.id,
    cliente: a.name,
    email: a.email,
    telefone: a.phone,
    servico: SERVICE_LABELS[a.service] ?? a.service,
    serviceKey: a.service,
    date: a.date,
    horario: formatTime(a.time),
    valor: `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    price,
    apiStatus: st,
    uiStatus: resolveOperationalStatus(st, a.date, formatTime(a.time), { convertPastToPending: false }),
    startedAt,
    isPackageCustomer: linkedPackage,
    packageLabel: linkedPackage ? "Pacote" : "",
    closingPaymentDisplay: String(a.closing_payment_display || "").trim(),
    packageCloseAvailable: a.package_close_available === true,
  };
}

function formatElapsed(ms: number) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  const elapsed = Date.now() - startedAt;
  return (
    <span className="font-mono text-sm text-accent tabular-nums tracking-tight">{formatElapsed(elapsed)}</span>
  );
}

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;
const PAGE_ENTER = { duration: 0.46, ease: PREMIUM_EASE } as const;
const SECTION_ENTER = { duration: 0.42, ease: PREMIUM_EASE } as const;

const STORAGE_BARBER_EXPIRED_SEEN = "barbearia_barber_expired_plan_ids_v1";

function barberExpiredPlansStorageKey(persistId: string) {
  return `${STORAGE_BARBER_EXPIRED_SEEN}_${persistId}`;
}

function readSeenExpiredSubscriptionIds(persistId: string): Set<number> {
  if (!persistId || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(barberExpiredPlansStorageKey(persistId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "number") : []);
  } catch {
    return new Set();
  }
}

function appendSeenExpiredSubscriptionIds(persistId: string, ids: number[]) {
  if (!persistId || ids.length === 0 || typeof window === "undefined") return;
  const s = readSeenExpiredSubscriptionIds(persistId);
  ids.forEach((id) => s.add(id));
  localStorage.setItem(barberExpiredPlansStorageKey(persistId), JSON.stringify([...s]));
}

function barberNoticePersistId(user: { id?: number; username?: string } | null): string {
  if (!user) return "";
  if (typeof user.id === "number") return `id_${user.id}`;
  const u = (user.username || "").trim().toLowerCase();
  return u ? `login_${u}` : "";
}

export default function Funcionario() {
  const [selectedTab, setSelectedTab] = useState("hoje");
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [packageCustomersByEmail, setPackageCustomersByEmail] = useState<Record<string, string>>({});
  const [staffExpiredPlans, setStaffExpiredPlans] = useState<StaffExpiredPlanRow[]>([]);
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  /** Abre fluxo de encerramento com escolha Dinheiro / Pix (obrigatório na API). */
  const [finalizePaymentModalId, setFinalizePaymentModalId] = useState<number | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const { user, getAuthHeaders, updateUser, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const barberPersistId = useMemo(() => barberNoticePersistId(user), [user]);
  const [expiredSeenBump, setExpiredSeenBump] = useState(0);

  const visibleExpiredPlans = useMemo(() => {
    void expiredSeenBump;
    const pid = barberPersistId;
    if (!pid) return staffExpiredPlans;
    const seen = readSeenExpiredSubscriptionIds(pid);
    return staffExpiredPlans.filter((row) => !seen.has(row.id));
  }, [staffExpiredPlans, barberPersistId, expiredSeenBump]);

  const visibleExpiredPlanIdsKey = useMemo(
    () =>
      visibleExpiredPlans
        .map((p) => p.id)
        .sort((a, b) => a - b)
        .join(","),
    [visibleExpiredPlans],
  );

  useEffect(() => {
    if (!visibleExpiredPlanIdsKey || !barberPersistId) return;
    const ids = visibleExpiredPlanIdsKey
      .split(",")
      .map((s) => Number(s))
      .filter((n) => typeof n === "number" && !Number.isNaN(n));
    if (ids.length === 0) return;
    const t = window.setTimeout(() => {
      appendSeenExpiredSubscriptionIds(barberPersistId, ids);
      setExpiredSeenBump((b) => b + 1);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [visibleExpiredPlanIdsKey, barberPersistId]);

  const fetchAgendamentos = useCallback(async (opts?: { silent?: boolean }) => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    if (!opts?.silent) {
      setIsLoading(true);
    }
    setListError(null);
    try {
      const response = await fetch(`${API_URL}/api/appointments/`, { headers });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setListError((err as { detail?: string })?.detail ?? "Não foi possível carregar os agendamentos.");
        setAgendamentos([]);
        return;
      }
      const data = (await response.json()) as ApiAppointment[];
      if (!Array.isArray(data)) {
        setAgendamentos([]);
        return;
      }
      const mapped = data.map(mapAppointment).map((row) => {
        const key = (row.email || "").trim().toLowerCase();
        const packageLabel = packageCustomersByEmail[key];
        if (packageLabel) return { ...row, isPackageCustomer: true, packageLabel };
        if (row.isPackageCustomer) return { ...row, packageLabel: row.packageLabel || "Pacote" };
        return row;
      });
      setAgendamentos(mapped);
    } catch {
      setListError("Erro de rede ao carregar agendamentos.");
      setAgendamentos([]);
    } finally {
      if (!opts?.silent) {
        setIsLoading(false);
      }
    }
  }, [getAuthHeaders, navigate, packageCustomersByEmail]);

  const fetchPackageCustomers = useCallback(async () => {
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`${API_URL}/api/client-packages/subscriptions/`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;
      const mapped: Record<string, string> = {};
      const expired: StaffExpiredPlanRow[] = [];
      for (const item of data as Array<{
        id: number;
        name?: string;
        email?: string;
        status?: string;
        package?: { name?: string };
        pending_login_notice?: boolean;
        expiry_notice_label?: string;
      }>) {
        const email = String(item.email || "").trim().toLowerCase();
        const status = String(item.status || "").trim().toLowerCase();
        if (email && status === "active") {
          mapped[email] = item.package?.name || "Cliente de pacote";
        }
        if (status === "expired") {
          expired.push({
            id: item.id,
            name: String(item.name || "").trim(),
            email: String(item.email || "").trim(),
            packageLabel: item.package?.name || "Pacote",
            reasonLabel: String(item.expiry_notice_label || "").trim() || "Plano encerrado",
            pendingClientNotice: item.pending_login_notice === true,
          });
        }
      }
      setPackageCustomersByEmail(mapped);
      setStaffExpiredPlans(expired.slice(0, 24));
    } catch {
      // mantém painel funcional mesmo sem endpoint
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "hoje" || tab === "desempenho" || tab === "perfil") {
      setSelectedTab(tab);
    }
  }, [location.search]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user?.role === "barbeiro") {
      void fetchAgendamentos();
    }
  }, [user?.role, fetchAgendamentos]);

  useEffect(() => {
    if (user?.role === "barbeiro") {
      void fetchPackageCustomers();
    }
  }, [user?.role, fetchPackageCustomers]);

  useEffect(() => {
    if (!actionSuccess) return;
    const timeout = window.setTimeout(() => setActionSuccess(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [actionSuccess]);

  const handleOpenProfile = () => {
    setProfileForm({
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
    });
    setProfileError(null);
    setProfileSuccess(false);
    setShowProfileModal(true);
  };

  const handleCloseProfile = () => {
    if (isSavingProfile) return;
    setShowProfileModal(false);
    setProfileError(null);
    setProfileSuccess(false);
  };

  const handleSaveProfile = async () => {
    setProfileError(null);
    setProfileSuccess(false);

    const trimmedName = profileForm.name.trim();
    const trimmedEmail = profileForm.email.trim();
    const trimmedPhone = profileForm.phone.trim();

    if (!trimmedName) {
      setProfileError("Por favor, informe seu nome.");
      return;
    }
    if (!trimmedEmail) {
      setProfileError("Por favor, informe seu e-mail.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setProfileError("Informe um e-mail válido.");
      return;
    }

    const hasChanges =
      trimmedName !== (user?.name ?? "") ||
      trimmedEmail !== (user?.email ?? "") ||
      trimmedPhone !== (user?.phone ?? "");

    if (!hasChanges) {
      setProfileError("Nenhuma alteração para salvar.");
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateUser({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
      });
      setProfileSuccess(true);
      window.setTimeout(() => {
        setShowProfileModal(false);
        setProfileSuccess(false);
      }, 900);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o perfil. Tente novamente.";
      setProfileError(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const iniciarAtendimento = useCallback(
    async (id: number) => {
      const headers = getAuthHeaders();
      if (!headers) return;
      setActionError(null);
      setActionSuccess(null);
      setPendingId(id);
      try {
        const response = await fetch(`${API_URL}/api/appointments/${id}/`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "em_atendimento" }),
        });
        if (response.status === 401 || response.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setActionError(getFriendlyApiDetail(err, "Não foi possível iniciar o atendimento."));
          return;
        }
        await fetchAgendamentos({ silent: true });
        setActionSuccess("Atendimento iniciado com sucesso.");
      } catch {
        setActionError("Erro de rede ao iniciar o atendimento.");
      } finally {
        setPendingId(null);
      }
    },
    [fetchAgendamentos, getAuthHeaders],
  );

  const finalizarAtendimento = useCallback(
    async (id: number, paymentMethod: "dinheiro" | "pix") => {
      const headers = getAuthHeaders();
      if (!headers) return;
      setActionError(null);
      setActionSuccess(null);
      setPendingId(id);
      try {
        const response = await fetch(`${API_URL}/api/appointments/${id}/`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "concluido", payment_method: paymentMethod }),
        });
        if (response.status === 401 || response.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setActionError(getFriendlyApiDetail(err, "Não foi possível finalizar o atendimento."));
          return;
        }
        await fetchAgendamentos({ silent: true });
        void fetchPackageCustomers();
        setActionSuccess("Atendimento finalizado com sucesso.");
        setFinalizePaymentModalId(null);
      } catch {
        setActionError("Erro de rede ao finalizar o atendimento.");
      } finally {
        setPendingId(null);
      }
    },
    [fetchAgendamentos, fetchPackageCustomers, getAuthHeaders, navigate],
  );

  const finalizarAtendimentoPacote = useCallback(
    async (id: number) => {
      const headers = getAuthHeaders();
      if (!headers) return;
      setActionError(null);
      setActionSuccess(null);
      setPendingId(id);
      try {
        const response = await fetch(`${API_URL}/api/appointments/${id}/`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "concluido" }),
        });
        if (response.status === 401 || response.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setActionError(getFriendlyApiDetail(err, "Não foi possível finalizar o atendimento."));
          return;
        }
        await fetchAgendamentos({ silent: true });
        void fetchPackageCustomers();
        setActionSuccess("Atendimento finalizado com sucesso (pacote).");
      } catch {
        setActionError("Erro de rede ao finalizar o atendimento.");
      } finally {
        setPendingId(null);
      }
    },
    [fetchAgendamentos, fetchPackageCustomers, getAuthHeaders, navigate],
  );

  const cancelarAtendimento = useCallback(
    async (id: number) => {
      const headers = getAuthHeaders();
      if (!headers) return;
      setActionError(null);
      setActionSuccess(null);
      setPendingId(id);
      try {
        const response = await fetch(`${API_URL}/api/appointments/${id}/`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "cancelado" }),
        });
        if (response.status === 401 || response.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setActionError(getFriendlyApiDetail(err, "Não foi possível cancelar o atendimento."));
          return;
        }
        await fetchAgendamentos({ silent: true });
        setActionSuccess("Atendimento cancelado com sucesso.");
      } catch {
        setActionError("Erro de rede ao cancelar o atendimento.");
      } finally {
        setPendingId(null);
      }
    },
    [fetchAgendamentos, getAuthHeaders],
  );

  const handleRequestCancel = useCallback((id: number) => {
    setCancelConfirmId(id);
    setActionError(null);
  }, []);

  const handleCloseCancel = useCallback(() => {
    if (pendingId !== null) return;
    setCancelConfirmId(null);
  }, [pendingId]);

  const handleConfirmCancel = useCallback(async () => {
    if (cancelConfirmId === null) return;
    await cancelarAtendimento(cancelConfirmId);
    setCancelConfirmId(null);
  }, [cancelConfirmId, cancelarAtendimento]);

  const todayAppointments = useMemo(() => {
    const today = todayLocalISODate();
    return agendamentos.filter((a) => a.date === today);
  }, [agendamentos]);

  const displayedAppointments = useMemo(() => {
    const today = todayLocalISODate();
    return [...agendamentos].sort((a, b) => {
      const aIsToday = a.date === today;
      const bIsToday = b.date === today;
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;
      const aDateTime = `${a.date}T${a.horario}`;
      const bDateTime = `${b.date}T${b.horario}`;
      return aDateTime.localeCompare(bDateTime);
    });
  }, [agendamentos]);

  const barberAgendaSignature = useMemo(
    () => displayedAppointments.map((a) => `${a.id}:${a.date}:${a.apiStatus}`).join("|"),
    [displayedAppointments],
  );
  const barberListPagination = usePagination({
    totalCount: displayedAppointments.length,
    pageSize: 10,
    resetDeps: barberAgendaSignature,
  });
  const pagedBarberAppointments = useMemo(
    () =>
      displayedAppointments.slice(barberListPagination.sliceRange.start, barberListPagination.sliceRange.end),
    [displayedAppointments, barberListPagination.sliceRange],
  );

  const counts = useMemo(() => {
    const total = todayAppointments.length;
    const emAndamento = todayAppointments.filter((a) => a.apiStatus === "em_atendimento").length;
    const concluidos = todayAppointments.filter((a) => a.apiStatus === "concluido").length;
    return { total, emAndamento, concluidos };
  }, [todayAppointments]);

  const valorPrevisto = useMemo(() => {
    const soma = todayAppointments
      .filter((a) => a.apiStatus !== "concluido" && a.apiStatus !== "cancelado")
      .reduce((acc, a) => {
        const n = Number.parseFloat(a.valor.replace(/[^\d,]/g, "").replace(",", "."));
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);
    return soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [todayAppointments]);

  if (authLoading) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (user.role !== "barbeiro") {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center py-12 px-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-accent mx-auto mb-4" />
          <h2 className="text-2xl mb-4">Acesso Restrito</h2>
          <p className="text-muted-foreground mb-6">Esta área é exclusiva para funcionários.</p>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="px-6 py-3 bg-accent text-accent-foreground hover:bg-accent/90 transition-all"
          >
            Fazer Login
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const currentMonth = currentLocalYearMonth();
  const monthAppointments = agendamentos.filter((a) => a.date.slice(0, 7) === currentMonth);
  const desempenhoMensal = {
    cortesRealizados: monthAppointments.length,
    receitaGerada: monthAppointments.reduce((sum, item) => sum + item.price, 0),
    avaliacaoMedia: 5.0,
    clientesAtendidos: new Set(monthAppointments.map((item) => item.telefone || item.cliente)).size,
  };

  const weekDayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const historicoDayMap = agendamentos.reduce<Record<number, number>>((acc, item) => {
    const date = new Date(`${item.date}T00:00:00`);
    if (date >= startOfWeek && date < endOfWeek) {
      const day = date.getDay();
      acc[day] = (acc[day] ?? 0) + 1;
    }
    return acc;
  }, {});
  const historicoDia = weekDayLabels.map((dia, idx) => ({ dia, cortes: historicoDayMap[idx] ?? 0 }));
  const maxCortesSemana = Math.max(1, ...historicoDia.map((item) => item.cortes));

  return (
    <div className="bg-background py-22 pb-14 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={PAGE_ENTER}
          className="mb-10"
        >
          <h1 className="premium-title text-4xl sm:text-5xl lg:text-6xl mb-3 tracking-tight leading-tight">Painel do Barbeiro</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Bem-vindo, {user?.name}</p>
        </motion.div>

        {selectedTab !== "perfil" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SECTION_ENTER, delay: 0.08 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8"
        >
          <div className="premium-glass-card bg-card border border-border p-4 sm:p-6 hover:border-accent/50 transition-colors">
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
              <span className="text-xs sm:text-sm text-accent">Hoje</span>
            </div>
            <div className="text-2xl sm:text-3xl mb-1">{counts.total}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">Agendamentos</div>
            {(counts.emAndamento > 0 || counts.concluidos > 0) && (
              <div className="mt-2 text-[11px] sm:text-xs text-muted-foreground leading-snug">
                {counts.emAndamento > 0 && <span>{counts.emAndamento} em atendimento · </span>}
                {counts.concluidos > 0 && <span>{counts.concluidos} concluído(s)</span>}
              </div>
            )}
          </div>

          <div className="premium-glass-card bg-card border border-border p-4 sm:p-6 hover:border-accent/50 transition-colors">
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <Scissors className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
              <span className="text-xs sm:text-sm text-accent">Mês atual</span>
            </div>
            <div className="text-2xl sm:text-3xl mb-1">{desempenhoMensal.cortesRealizados}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">Cortes este mês</div>
          </div>

          <div className="premium-glass-card bg-card border border-border p-4 sm:p-6 hover:border-accent/50 transition-colors">
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
              <span className="text-xs sm:text-sm text-accent">Mês atual</span>
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl mb-1">R$ {desempenhoMensal.receitaGerada}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">Receita gerada</div>
          </div>

          <div className="premium-glass-card bg-card border border-border p-4 sm:p-6 hover:border-accent/50 transition-colors">
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
            </div>
            <div className="text-2xl sm:text-3xl mb-1">{desempenhoMensal.avaliacaoMedia}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">Avaliação média</div>
          </div>
        </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SECTION_ENTER, delay: 0.14 }}
        >
          <div className="flex gap-2 sm:gap-4 mb-8 border-b border-border overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedTab("hoje")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "hoje"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("desempenho")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "desempenho"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Desempenho
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab("perfil")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "perfil"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Perfil
            </button>
          </div>

          {selectedTab === "hoje" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SECTION_ENTER}>
              <h2 className="text-xl sm:text-2xl tracking-tight mb-6">Meus Agendamentos</h2>

              {listError && (
                <div className="mb-4 p-4 border border-red-500/40 bg-red-950/20 text-red-300 text-sm">{listError}</div>
              )}
              {actionError && (
                <div className="mb-4 p-4 border border-amber-500/40 bg-amber-950/20 text-amber-200 text-sm">{actionError}</div>
              )}
              {actionSuccess && (
                <div className="mb-4 p-4 border border-emerald-500/40 bg-emerald-950/20 text-emerald-200 text-sm">{actionSuccess}</div>
              )}

              {visibleExpiredPlans.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-500/35 bg-amber-950/15 px-4 py-3 text-sm">
                  <div className="mb-2 font-medium text-amber-100">Planos encerrados (sessões ou prazo)</div>
                  <ul className="space-y-2 text-muted-foreground">
                    {visibleExpiredPlans.map((row) => (
                      <li key={row.id} className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                        <span className="text-foreground/95">
                          {row.name} <span className="text-muted-foreground">· {row.email}</span>
                        </span>
                        <span className="text-xs">
                          {row.packageLabel} — {row.reasonLabel}
                          {row.pendingClientNotice ? (
                            <span className="ml-1 text-amber-200/90">(cliente ainda não confirmou o aviso)</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isLoading ? (
                <div className="py-16 text-center text-muted-foreground text-sm">Carregando agendamentos…</div>
              ) : displayedAppointments.length === 0 ? (
                <div className="py-16 text-center border border-border bg-card/30">
                  <p className="text-muted-foreground mb-2">Nenhum agendamento encontrado para você.</p>
                  <p className="text-xs text-muted-foreground">
                    Aqui aparecem todos os horários marcados com <strong className="text-foreground">você</strong>, incluindo agendados, confirmados, em atendimento, concluídos e cancelados.
                  </p>
                </div>
              ) : (
              <>
              <div className="space-y-3 sm:space-y-4">
                {pagedBarberAppointments.map((agendamento) => {
                  const isActive = agendamento.apiStatus === "em_atendimento";
                  const canIniciar =
                    agendamento.apiStatus === "pendente" ||
                    agendamento.apiStatus === "confirmado" ||
                    agendamento.apiStatus === "agendado";
                  const canCancelar =
                    agendamento.apiStatus === "pendente" ||
                    agendamento.apiStatus === "confirmado" ||
                    agendamento.apiStatus === "agendado";
                  const timerStart = agendamento.startedAt ?? (isActive ? Date.now() : null);

                  return (
                    <div
                      key={agendamento.id}
                      className={`premium-glass-card bg-card border p-3 sm:p-4 md:p-6 transition-colors ${
                        isActive
                          ? "border-accent/70 ring-1 ring-accent/30"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <div className="flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Cliente</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-lg font-semibold leading-tight">{agendamento.cliente}</span>
                            {agendamento.isPackageCustomer && (
                              <span className="inline-flex items-center rounded-full border border-accent/50 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                                {agendamento.packageLabel || "Pacote"}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground tabular-nums">{agendamento.telefone}</div>
                        </div>
                        <div className="shrink-0 sm:pt-0.5">
                          <StatusBadge status={agendamento.uiStatus} />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Serviço</div>
                          <p className="font-medium text-foreground">{agendamento.servico}</p>
                          <p className="mt-1 text-sm text-accent">{agendamento.valor}</p>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Data e horário</div>
                          <p className="font-medium tabular-nums text-foreground">{formatISODatePtBR(agendamento.date)}</p>
                          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            <span className="tabular-nums">{agendamento.horario}</span>
                          </div>
                        </div>
                        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                          {agendamento.apiStatus === "em_atendimento" && timerStart !== null && (
                            <div className="rounded-xl border border-accent/35 bg-accent/[0.06] px-3 py-2.5">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">
                                Em atendimento
                              </div>
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <Timer className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                                  Tempo de cadeira
                                </span>
                                <ElapsedTimer startedAt={timerStart} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                        {agendamento.apiStatus === "cancelado" && (
                          <div className="flex w-full items-center justify-center gap-2 rounded-full border border-border/80 bg-muted/10 px-4 py-2 text-sm text-muted-foreground sm:w-auto">
                            <Ban className="h-4 w-4 shrink-0" />
                            Horário cancelado
                          </div>
                        )}

                        {canIniciar && (
                          <div className="w-full sm:w-auto sm:min-w-[200px]">
                            <Button
                              type="button"
                              variant="accentOutline"
                              onClick={() => void iniciarAtendimento(agendamento.id)}
                              disabled={pendingId !== null}
                              className="w-full"
                              icon={Scissors}
                              isLoading={pendingId === agendamento.id}
                            >
                              {pendingId === agendamento.id ? "Iniciando…" : "Iniciar atendimento"}
                            </Button>
                          </div>
                        )}

                        {agendamento.apiStatus === "em_atendimento" && timerStart !== null && (
                          <div className="w-full sm:w-auto sm:min-w-[200px]">
                            <Button
                              type="button"
                              variant="accentOutline"
                              onClick={() => {
                                setActionError(null);
                                if (agendamento.packageCloseAvailable) {
                                  void finalizarAtendimentoPacote(agendamento.id);
                                } else {
                                  setFinalizePaymentModalId(agendamento.id);
                                }
                              }}
                              disabled={pendingId !== null}
                              className="w-full"
                              icon={CheckCircle}
                              isLoading={pendingId === agendamento.id}
                            >
                              {agendamento.packageCloseAvailable
                                ? pendingId === agendamento.id
                                  ? "A concluir…"
                                  : "Finalizar (pacote)"
                                : "Finalizar atendimento"}
                            </Button>
                          </div>
                        )}

                        {agendamento.apiStatus === "concluido" && (
                          <div className="flex w-full flex-col items-center justify-center gap-1.5 sm:w-auto">
                            <div className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-400 sm:w-auto">
                              <CheckCircle className="h-4 w-4 shrink-0" />
                              Encerrado
                            </div>
                            {agendamento.closingPaymentDisplay ? (
                              <div className="text-center text-xs text-muted-foreground">
                                Pagamento:{" "}
                                <span className="font-medium text-foreground/90">{agendamento.closingPaymentDisplay}</span>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {canCancelar && (
                          <div className="w-full sm:w-auto sm:min-w-[200px]">
                            <Button
                              type="button"
                              variant="destructiveOutline"
                              onClick={() => handleRequestCancel(agendamento.id)}
                              disabled={pendingId !== null}
                              className="w-full"
                              icon={Ban}
                              isLoading={pendingId === agendamento.id}
                            >
                              {pendingId === agendamento.id ? "Cancelando…" : "Cancelar atendimento"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <ListPaginationBar
                showingCount={barberListPagination.showingCount}
                totalCount={displayedAppointments.length}
                pageSize={barberListPagination.pageSize}
                page={barberListPagination.page}
                totalPages={barberListPagination.totalPages}
                visiblePages={barberListPagination.visiblePages}
                onPageChange={barberListPagination.setPage}
                itemLabel="agendamentos"
              />
              </>
              )}

              <div className="mt-6 p-4 sm:p-6 bg-muted/5 border border-border">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                  <div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total previsto (abertos)</div>
                    <div className="text-xl sm:text-2xl text-accent">R$ {valorPrevisto}</div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xs sm:text-sm text-muted-foreground">Resumo do dia</div>
                    <div className="text-xl sm:text-2xl">
                      {counts.concluidos}/{counts.total} finalizados
                    </div>
                  </div>
                </div>
              </div>

              <AlertDialog
                open={cancelConfirmId !== null}
                onOpenChange={(open) => {
                  if (!open) handleCloseCancel();
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar atendimento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja cancelar este agendamento? Esta ação evita erros operacionais e libera o horário.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pendingId !== null} onClick={handleCloseCancel}>
                      Voltar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleConfirmCancel()}
                      disabled={pendingId !== null}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {pendingId !== null ? "Cancelando..." : "Sim, cancelar"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog
                open={finalizePaymentModalId !== null}
                onOpenChange={(open) => {
                  if (!open && pendingId === null) setFinalizePaymentModalId(null);
                }}
              >
                <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Como foi o pagamento?</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      Escolha a forma de pagamento deste atendimento. O admin verá na aba{" "}
                      <span className="text-foreground/90">Transações de pagamento</span> para controle do que entrou
                      na barbearia (valor conforme tabela de serviços). Sessões de pacote não geram linha extra de
                      recebimento.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <AlertDialogCancel
                      type="button"
                      disabled={pendingId !== null}
                      className="mt-0 w-full border-border sm:w-auto"
                      onClick={() => setFinalizePaymentModalId(null)}
                    >
                      Voltar
                    </AlertDialogCancel>
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full gap-2 sm:w-auto"
                      disabled={pendingId !== null || finalizePaymentModalId === null}
                      isLoading={pendingId !== null && finalizePaymentModalId !== null}
                      onClick={() => {
                        if (finalizePaymentModalId === null) return;
                        void finalizarAtendimento(finalizePaymentModalId, "dinheiro");
                      }}
                    >
                      <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                      Dinheiro
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full gap-2 sm:w-auto"
                      disabled={pendingId !== null || finalizePaymentModalId === null}
                      isLoading={pendingId !== null && finalizePaymentModalId !== null}
                      onClick={() => {
                        if (finalizePaymentModalId === null) return;
                        void finalizarAtendimento(finalizePaymentModalId, "pix");
                      }}
                    >
                      <QrCode className="h-4 w-4 shrink-0" aria-hidden />
                      Pix
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          )}

          {selectedTab === "desempenho" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SECTION_ENTER} className="space-y-6">
              <h2 className="text-xl sm:text-2xl tracking-tight">Meu Desempenho - {now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>

              <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                <div className="premium-glass-card bg-card border border-border p-4 sm:p-6">
                  <h3 className="mb-4 text-base sm:text-lg">Resumo Mensal</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Scissors className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                        <span className="text-sm sm:text-base text-muted-foreground">Cortes Realizados</span>
                      </div>
                      <span className="text-lg sm:text-xl">{desempenhoMensal.cortesRealizados}</span>
                    </div>

                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                        <span className="text-sm sm:text-base text-muted-foreground">Receita Gerada</span>
                      </div>
                      <span className="text-lg sm:text-xl text-accent">R$ {desempenhoMensal.receitaGerada}</span>
                    </div>

                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <User className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                        <span className="text-sm sm:text-base text-muted-foreground">Clientes Atendidos</span>
                      </div>
                      <span className="text-lg sm:text-xl">{desempenhoMensal.clientesAtendidos}</span>
                    </div>

                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
                        <span className="text-sm sm:text-base text-muted-foreground">Média por Corte</span>
                      </div>
                      <span className="text-lg sm:text-xl">
                        R$ {desempenhoMensal.cortesRealizados > 0
                          ? Math.round(desempenhoMensal.receitaGerada / desempenhoMensal.cortesRealizados)
                          : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="premium-glass-card bg-card border border-border p-4 sm:p-6">
                  <h3 className="mb-4 text-base sm:text-lg">Cortes por Dia (Esta Semana)</h3>
                  <div className="space-y-2 sm:space-y-3">
                    {historicoDia.map((item) => (
                      <div key={item.dia} className="flex items-center gap-2 sm:gap-4">
                        <div className="w-8 sm:w-12 text-xs sm:text-sm text-muted-foreground">{item.dia}</div>
                        <div className="flex-1 bg-muted/10 h-7 sm:h-8 relative">
                          <div
                            className="bg-accent h-full transition-all"
                            style={{ width: `${(item.cortes / maxCortesSemana) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm">
                            {item.cortes}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="premium-glass-card bg-card border border-border p-4 sm:p-6">
                <h3 className="mb-4 text-base sm:text-lg">Metas e Objetivos</h3>
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 mb-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Meta de Cortes Mensais</span>
                      <span className="text-xs sm:text-sm">
                        {desempenhoMensal.cortesRealizados} / 60
                      </span>
                    </div>
                    <div className="w-full bg-muted/10 h-2 sm:h-3">
                      <div
                        className="bg-accent h-full transition-all"
                        style={{ width: `${(desempenhoMensal.cortesRealizados / 60) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 mb-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Meta de Receita Mensal</span>
                      <span className="text-xs sm:text-sm">
                        R$ {desempenhoMensal.receitaGerada} / R$ 5000
                      </span>
                    </div>
                    <div className="w-full bg-muted/10 h-2 sm:h-3">
                      <div
                        className="bg-accent h-full transition-all"
                        style={{ width: `${(desempenhoMensal.receitaGerada / 5000) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {selectedTab === "perfil" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SECTION_ENTER} className="space-y-6">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="premium-glass-card bg-card border border-border p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-accent/10 border-2 border-accent flex items-center justify-center">
                      <User className="w-8 h-8 text-accent" />
                    </div>
                    <div>
                      <h3>Perfil</h3>
                      <p className="text-sm text-muted-foreground">Dados da conta autenticada</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      {user?.email || "E-mail não informado"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      {user?.phone || "Telefone não informado"}
                    </div>
                  </div>
                  <Button variant="accentOutline" icon={Edit2} onClick={handleOpenProfile} className="mt-4 w-full">
                    Editar Perfil
                  </Button>
                </div>

                <div className="premium-glass-card bg-card border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-3xl">{desempenhoMensal.cortesRealizados}</div>
                      <div className="text-sm text-muted-foreground">Atendimentos no mês</div>
                    </div>
                    <Calendar className="w-8 h-8 text-accent" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Clientes atendidos: {desempenhoMensal.clientesAtendidos}
                  </div>
                </div>

                <div className="premium-glass-card bg-card border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-3xl text-accent">R$ {desempenhoMensal.receitaGerada}</div>
                      <div className="text-sm text-muted-foreground">Receita no mês</div>
                    </div>
                    <DollarSign className="w-8 h-8 text-accent" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Ticket médio: R$ {desempenhoMensal.cortesRealizados > 0
                      ? Math.round(desempenhoMensal.receitaGerada / desempenhoMensal.cortesRealizados)
                      : 0}
                  </div>
                </div>
              </div>

              {showProfileModal && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 sm:p-6">
                  <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-2xl font-semibold">Editar Perfil</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Atualize seus dados e confirme a alteração.
                        </p>
                      </div>
                      <button
                        onClick={handleCloseProfile}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Fechar edição de perfil"
                      >
                        ✕
                      </button>
                    </div>

                    {profileError && (
                      <div className="mb-4 rounded-sm border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        {profileError}
                      </div>
                    )}
                    {profileSuccess && (
                      <div className="mb-4 rounded-sm border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                        Perfil atualizado com sucesso.
                      </div>
                    )}

                    <div className="grid gap-4">
                      <label className="block space-y-2 text-sm">
                        <span>Nome</span>
                        <input
                          type="text"
                          value={profileForm.name}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          placeholder="Seu nome"
                        />
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span>E-mail</span>
                        <input
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          placeholder="seuemail@exemplo.com"
                        />
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span>Telefone</span>
                        <input
                          type="tel"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          placeholder="(00) 00000-0000"
                        />
                      </label>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button
                        variant="ghost"
                        onClick={handleCloseProfile}
                        disabled={isSavingProfile}
                        className="w-full sm:w-auto"
                      >
                        Fechar
                      </Button>
                      <Button
                        variant="accentOutline"
                        onClick={() => void handleSaveProfile()}
                        isLoading={isSavingProfile}
                        className="w-full sm:w-auto"
                      >
                        Salvar alterações
                      </Button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
