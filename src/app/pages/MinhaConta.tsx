import { motion } from "motion/react";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { Calendar, ChevronDown, Clock, User, Phone, Mail, Edit2, Package } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";
import { Calendar as UiCalendar } from "@/app/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { StatusBadge } from "@/app/components/ui/status-badge";
import { isAtLeast24HoursAhead, resolveOperationalStatus } from "@/app/shared/appointment-status";
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
import { API_URL } from "@/services/api";
import { PackageSubscriptionReviewModal } from "@/app/components/PackageSubscriptionReviewModal";
import { usePagination } from "@/app/hooks/usePagination";
import { ListPaginationBar } from "@/app/components/ListPaginationBar";
import {
  formatPackageSessionsShort,
  formatSubscriptionSessionsProgress,
} from "@/lib/clientPackageCopy";

function parseISODate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatISODatePtBR(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("pt-BR");
}

function getFriendlyApiDetail(errorData: unknown, fallback: string) {
  if (!errorData || typeof errorData !== "object") return fallback;
  const data = errorData as { detail?: unknown };
  if (
    typeof data.detail === "string" &&
    data.detail.toLowerCase().includes("given token not valid")
  ) {
    return "Sessão expirada. Faça login novamente.";
  }
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  return fallback;
}

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;
const PAGE_ENTER = { duration: 0.46, ease: PREMIUM_EASE } as const;
const SECTION_ENTER = { duration: 0.42, ease: PREMIUM_EASE } as const;

function getTabsScrollOffsetPx() {
  const width = window.innerWidth;
  if (width < 640) return 94;
  if (width < 1024) return 90;
  return 86;
}

export default function MinhaConta() {
  type AccountAppointment = {
    id: number;
    name?: string;
    email?: string;
    phone?: string;
    service: string;
    barber: string;
    date: string;
    time: string;
    status: string;
  };
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
  type ClientPackageSubscription = {
    id: number;
    package?: ClientPackage | null;
    status: string;
    status_display: string;
    sessions_total: number;
    sessions_used: number;
    sessions_unlimited?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    created_at: string;
  };

  const [selectedTab, setSelectedTab] = useState("agendamentos");
  const [appointments, setAppointments] = useState<AccountAppointment[]>([]);
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [packageSubscriptions, setPackageSubscriptions] = useState<ClientPackageSubscription[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [subscribingPackageId, setSubscribingPackageId] = useState<number | null>(null);
  const [packageFeedback, setPackageFeedback] = useState<string | null>(null);
  const [showPackageReviewModal, setShowPackageReviewModal] = useState(false);
  const [packageReviewName, setPackageReviewName] = useState<string | null>(null);
  const [goToMeuPlanoAfterReview, setGoToMeuPlanoAfterReview] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [isRescheduleDatePickerOpen, setIsRescheduleDatePickerOpen] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    barber: "barbeiro1",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
  });
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<number | null>(null);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<number | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const tabsSectionRef = useRef<HTMLDivElement | null>(null);
  const appointmentsSectionRef = useRef<HTMLDivElement | null>(null);
  const firstAppointmentCardRef = useRef<HTMLDivElement | null>(null);
  const { user, getAuthHeaders, isLoading: authLoading, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const SERVICE_LABELS: Record<string, string> = {
    corte: "Corte",
    barba: "Barba",
    completo: "Corte + Barba",
    platinado: "Platinado",
    pigmentacao: "Pigmentação",
  };

  const BARBER_LABELS: Record<string, string> = {
    barbeiro1: "Barbeiro 1",
    barbeiro2: "Barbeiro 2",
  };

  const SERVICE_PRICES: Record<string, number> = {
    corte: 50,
    barba: 40,
    completo: 80,
    platinado: 150,
    pigmentacao: 100,
  };

  const todayDate = new Date().toISOString().slice(0, 10);

  const availableTimes = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  ];

  const scrollToTabAnchor = (tab: string, attempt = 0) => {
    const isMobile = window.innerWidth < 640;
    const targetRef =
      isMobile && tab === "agendamentos" && appointmentsSectionRef.current
        ? appointmentsSectionRef
        : tabsSectionRef;
    const target = targetRef.current;
    if (!target) {
      if (attempt < 10) {
        window.setTimeout(() => scrollToTabAnchor(tab, attempt + 1), 90);
      }
      return;
    }
    const top = target.getBoundingClientRect().top + window.scrollY - getTabsScrollOffsetPx();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  const scrollToAppointmentsContent = (attempt = 0) => {
    const card = firstAppointmentCardRef.current;
    if (!card) {
      if (attempt < 12) {
        window.setTimeout(() => scrollToAppointmentsContent(attempt + 1), 100);
      }
      return;
    }
    const top = card.getBoundingClientRect().top + window.scrollY - getTabsScrollOffsetPx();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (!tabParam) return;
    const allowedTabs = new Set(["agendamentos", "historico", "meu-plano", "pacotes"]);
    if (!allowedTabs.has(tabParam)) return;
    setSelectedTab(tabParam);
    const isMobile = window.innerWidth < 640;
    if (isMobile && tabParam === "agendamentos") {
      return;
    }
    window.setTimeout(() => scrollToTabAnchor(tabParam), 40);
  }, [location.search]);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    const isMobile = window.innerWidth < 640;
    if (!isMobile) return;
    if (tabParam !== "agendamentos") return;
    if (selectedTab !== "agendamentos") return;
    if (loadingAppointments) return;
    window.setTimeout(() => scrollToAppointmentsContent(), 80);
  }, [location.search, selectedTab, loadingAppointments, appointments.length]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const fetchAppointments = async () => {
      const headers = getAuthHeaders();
      if (!headers) {
        navigate("/", { replace: true });
        return;
      }
      setLoadingAppointments(true);
      setAppointmentsError(null);
      try {
        const response = await fetch(`${API_URL}/api/appointments/`, { headers });
        if (response.status === 401 || response.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          setAppointmentsError(
            (errorData as { detail?: string })?.detail ?? "Erro ao carregar seus agendamentos.",
          );
          setAppointments([]);
          return;
        }
        const data = await response.json();
        setAppointments(Array.isArray(data) ? data : []);
      } catch {
        setAppointmentsError("Erro de conexão com o servidor ao carregar agendamentos.");
        setAppointments([]);
      } finally {
        setLoadingAppointments(false);
      }
    };
    fetchAppointments();
  }, [authLoading, user, getAuthHeaders, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    const fetchPackagesAndSubscriptions = async () => {
      const headers = getAuthHeaders();
      if (!headers) {
        navigate("/", { replace: true });
        return;
      }
      setLoadingPackages(true);
      try {
        const packagesResponse = await fetch(`${API_URL}/api/client-packages/`);
        const packagesData = await packagesResponse.json().catch(() => []);
        setPackages(Array.isArray(packagesData) ? (packagesData as ClientPackage[]) : []);

        if (user.role !== "cliente") {
          setPackageSubscriptions([]);
        } else {
          const subscriptionsResponse = await fetch(`${API_URL}/api/client-packages/subscriptions/`, { headers });
          if (subscriptionsResponse.status === 401 || subscriptionsResponse.status === 403) {
            navigate("/", { replace: true });
            return;
          }
          const subscriptionsData = await subscriptionsResponse.json().catch(() => []);
          setPackageSubscriptions(
            Array.isArray(subscriptionsData) ? (subscriptionsData as ClientPackageSubscription[]) : [],
          );
        }
      } catch {
        setPackageFeedback("Não foi possível carregar os pacotes agora.");
      } finally {
        setLoadingPackages(false);
      }
    };
    void fetchPackagesAndSubscriptions();
  }, [authLoading, user, getAuthHeaders, navigate]);

  const handleSubscribePackage = async (pkg: ClientPackage) => {
    if (user?.role !== "cliente") {
      setPackageFeedback("Assinatura de pacotes é apenas para contas de cliente.");
      return;
    }
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setSubscribingPackageId(pkg.id);
    setPackageFeedback(null);
    try {
      const response = await fetch(`${API_URL}/api/client-packages/subscribe/`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          package_id: pkg.id,
          name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPackageFeedback(
          (data as { detail?: string } | null)?.detail ??
            (data as { package_id?: string[] } | null)?.package_id?.[0] ??
            "Não foi possível assinar esse pacote.",
        );
        return;
      }
      setPackageReviewName(pkg.name);
      setGoToMeuPlanoAfterReview(true);
      setShowPackageReviewModal(true);
      const subscriptionsResponse = await fetch(`${API_URL}/api/client-packages/subscriptions/`, { headers });
      const subscriptionsData = await subscriptionsResponse.json().catch(() => []);
      setPackageSubscriptions(
        Array.isArray(subscriptionsData) ? (subscriptionsData as ClientPackageSubscription[]) : [],
      );
    } catch {
      setPackageFeedback("Erro de conexão ao assinar pacote.");
    } finally {
      setSubscribingPackageId(null);
    }
  };

  useEffect(() => {
    if (!actionSuccess) return;
    const timeout = window.setTimeout(() => setActionSuccess(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [actionSuccess]);

  if (authLoading) {
    return (
      <div className="bg-background py-24 pb-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground">
            Carregando suas informações...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isClienteUser = user.role === "cliente";

  const handleOpenReschedule = (appointmentId: number) => {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      return;
    }

    setRescheduleAppointmentId(appointmentId);
    setRescheduleForm({
      barber: appointment.barber || "barbeiro1",
      date: appointment.date || todayDate,
      time: appointment.time?.slice(0, 5) || "09:00",
    });
    setActionError(null);
    setShowRescheduleModal(true);
  };

  const handleCloseReschedule = () => {
    setShowRescheduleModal(false);
    setIsRescheduleDatePickerOpen(false);
    setRescheduleAppointmentId(null);
    setActionError(null);
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleAppointmentId) {
      return;
    }

    if (!isAtLeast24HoursAhead(rescheduleForm.date, rescheduleForm.time)) {
      setActionError("Reagendamento permitido apenas com no mínimo 24 horas de antecedência.");
      return;
    }

    setIsActionSaving(true);
    setActionError(null);

    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/appointments/${rescheduleAppointmentId}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          barber: rescheduleForm.barber,
          date: rescheduleForm.date,
          time: rescheduleForm.time,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }

      if (!response.ok) {
        // Alguns perfis de cliente não podem editar data/barbeiro via PATCH direto.
        // Fallback: cria novo agendamento com os dados escolhidos e cancela o anterior.
        if (response.status === 403) {
          const currentAppointment = appointments.find((item) => item.id === rescheduleAppointmentId);
          if (!currentAppointment) {
            setActionError("Não foi possível localizar o agendamento original para reagendar.");
            return;
          }

          const createResponse = await fetch(`${API_URL}/api/appointments/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            body: JSON.stringify({
              name: currentAppointment.name,
              email: currentAppointment.email,
              phone: currentAppointment.phone,
              service: currentAppointment.service,
              barber: rescheduleForm.barber,
              date: rescheduleForm.date,
              time: rescheduleForm.time.length === 5 ? `${rescheduleForm.time}:00` : rescheduleForm.time,
              status: "confirmado",
            }),
          });

          if (createResponse.status === 401 || createResponse.status === 403) {
            navigate("/", { replace: true });
            return;
          }

          if (!createResponse.ok) {
            const createError = await createResponse.json().catch(() => ({}));
            setActionError(
              getFriendlyApiDetail(createError, "Não foi possível criar o novo agendamento no reagendamento.")
            );
            return;
          }

          const createdAppointment = await createResponse.json();

          const cancelOldResponse = await fetch(`${API_URL}/api/appointments/${rescheduleAppointmentId}/`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "cancelado" }),
          });

          const normalizedCreatedTime =
            typeof createdAppointment?.time === "string"
              ? createdAppointment.time.slice(0, 5)
              : rescheduleForm.time;

          setAppointments((current) => {
            const withOldCancelled = current.map((appointment) =>
              appointment.id === rescheduleAppointmentId
                ? { ...appointment, status: cancelOldResponse.ok ? "cancelado" : appointment.status }
                : appointment,
            );

            return [
              {
                id: typeof createdAppointment?.id === "number" ? createdAppointment.id : Date.now(),
                name: createdAppointment?.name ?? currentAppointment.name,
                email: createdAppointment?.email ?? currentAppointment.email,
                phone: createdAppointment?.phone ?? currentAppointment.phone,
                service: createdAppointment?.service ?? currentAppointment.service,
                barber: createdAppointment?.barber ?? rescheduleForm.barber,
                date: createdAppointment?.date ?? rescheduleForm.date,
                time: normalizedCreatedTime,
                status: (createdAppointment?.status ?? "confirmado") as
                  | "confirmado"
                  | "pendente"
                  | "cancelado"
                  | "em_atendimento"
                  | "concluido",
              },
              ...withOldCancelled,
            ];
          });

          setActionSuccess("Reagendamento confirmado com sucesso.");
          handleCloseReschedule();
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        setActionError(
          getFriendlyApiDetail(errorData, "Não foi possível atualizar a data do agendamento.")
        );
        return;
      }

      const updatedAppointment = await response.json();
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === updatedAppointment.id
            ? {
                ...appointment,
                barber: updatedAppointment.barber,
                date: updatedAppointment.date,
                time: updatedAppointment.time,
              }
            : appointment,
        ),
      );
      setActionSuccess("Reagendamento confirmado com sucesso.");
      handleCloseReschedule();
    } catch {
      setActionError("Erro de conexão ao reagendar. Tente novamente.");
    } finally {
      setIsActionSaving(false);
    }
  };

  const handleRequestCancel = (appointmentId: number) => {
    setCancelAppointmentId(appointmentId);
    setActionError(null);
  };

  const handleCloseCancel = () => {
    if (isActionSaving) return;
    setCancelAppointmentId(null);
  };

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

  const handleConfirmCancel = async () => {
    if (cancelAppointmentId === null) return;

    setIsActionSaving(true);
    setActionError(null);

    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/appointments/${cancelAppointmentId}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "cancelado" }),
      });

      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setActionError(
          getFriendlyApiDetail(errorData, "Não foi possível cancelar o agendamento.")
        );
        return;
      }

      const updatedAppointment = await response.json();
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === updatedAppointment.id
            ? { ...appointment, status: updatedAppointment.status }
            : appointment,
        ),
      );
      setActionSuccess("Agendamento cancelado com sucesso.");
      setCancelAppointmentId(null);
    } catch {
      setActionError("Erro de conexão ao cancelar. Tente novamente.");
    } finally {
      setIsActionSaving(false);
    }
  };

  const resolveStatus = (status: string, date: string, time: string) =>
    resolveOperationalStatus(status, date, time, { convertPastToPending: true });

  const meusAgendamentos = appointments.map((appointment) => {
    const serviceKey = appointment.service;
    const barberKey = appointment.barber;
    const price = SERVICE_PRICES[serviceKey] ?? 0;
    return {
      id: appointment.id,
      serviceKey,
      barberKey,
      servico: SERVICE_LABELS[serviceKey] ?? serviceKey,
      barbeiro: BARBER_LABELS[barberKey] ?? barberKey,
      data: appointment.date,
      horario: appointment.time?.slice(0, 5) ?? "",
      valor: `R$ ${price.toLocaleString("pt-BR")}`,
      status: appointment.status,
      statusKey: resolveStatus(appointment.status, appointment.date, appointment.time),
      gasto: price,
    };
  });

  const historicoMap = meusAgendamentos.reduce<Record<string, { mes: string; visitas: number; gasto: number }>>(
    (acc, item) => {
      const d = parseISODate(item.data) ?? new Date(item.data);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!acc[monthKey]) {
        const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        acc[monthKey] = {
          mes: label.charAt(0).toUpperCase() + label.slice(1),
          visitas: 0,
          gasto: 0,
        };
      }
      acc[monthKey].visitas += 1;
      acc[monthKey].gasto += item.gasto;
      return acc;
    },
    {},
  );
  const historico = Object.entries(historicoMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, value]) => value);
  const totalVisitas = meusAgendamentos.length;
  const totalGasto = meusAgendamentos.reduce((sum, item) => sum + item.gasto, 0);
  const mediaVisita = totalVisitas > 0 ? Math.round(totalGasto / totalVisitas) : 0;
  const visitasConcluidas = meusAgendamentos.filter((item) => item.status === "concluido").length;
  const visitasCanceladas = meusAgendamentos.filter((item) => item.status === "cancelado").length;
  const ultimaVisita = meusAgendamentos[0]?.data;
  const proximaVisita = meusAgendamentos
    .filter((item) => String(item.status).toLowerCase() !== "cancelado")
    .find((item) => item.data >= todayDate)?.data;

  const appointmentsIdsKey = useMemo(() => appointments.map((a) => a.id).join(","), [appointments]);
  const meusAgendamentosPagination = usePagination({
    totalCount: meusAgendamentos.length,
    resetDeps: appointmentsIdsKey,
  });
  const pagedMeusAgendamentos = useMemo(
    () =>
      meusAgendamentos.slice(
        meusAgendamentosPagination.sliceRange.start,
        meusAgendamentosPagination.sliceRange.end,
      ),
    [meusAgendamentos, meusAgendamentosPagination.sliceRange],
  );

  const historicoKey = useMemo(() => historico.map((h) => `${h.mes}-${h.visitas}-${h.gasto}`).join("|"), [historico]);
  const historicoPagination = usePagination({
    totalCount: historico.length,
    resetDeps: historicoKey,
  });
  const pagedHistorico = useMemo(
    () => historico.slice(historicoPagination.sliceRange.start, historicoPagination.sliceRange.end),
    [historico, historicoPagination.sliceRange],
  );

  const packageSubsIdsKey = useMemo(() => packageSubscriptions.map((s) => s.id).join(","), [packageSubscriptions]);
  const packageSubsPagination = usePagination({
    totalCount: packageSubscriptions.length,
    resetDeps: `${selectedTab}|${packageSubsIdsKey}`,
  });
  const pagedPackageSubscriptions = useMemo(
    () =>
      packageSubscriptions.slice(packageSubsPagination.sliceRange.start, packageSubsPagination.sliceRange.end),
    [packageSubscriptions, packageSubsPagination.sliceRange],
  );

  const packagesIdsKey = useMemo(() => packages.map((p) => p.id).join(","), [packages]);
  const packagesPagination = usePagination({
    totalCount: packages.length,
    resetDeps: packagesIdsKey,
  });
  const pagedPackages = useMemo(
    () => packages.slice(packagesPagination.sliceRange.start, packagesPagination.sliceRange.end),
    [packages, packagesPagination.sliceRange],
  );

  const today = new Date().toISOString().slice(0, 10);
  const planSubscriptionsActive = packageSubscriptions.filter((s) => {
    const status = String(s.status || "").toLowerCase();
    if (status !== "active") return false;
    const startsAt = String(s.starts_at || "").slice(0, 10);
    const endsAt = String(s.ends_at || "").slice(0, 10);
    if (!startsAt || !endsAt) return false;
    return startsAt <= today && endsAt >= today;
  });
  const planSubscriptionsPending = packageSubscriptions.filter(
    (s) => String(s.status || "").toLowerCase() === "pending",
  );
  const clienteBloqueadoNovoPacote =
    isClienteUser && (planSubscriptionsActive.length > 0 || planSubscriptionsPending.length > 0);

  const hasRescheduleDateTime = Boolean(rescheduleForm.date && rescheduleForm.time);
  const isRescheduleLeadTimeValid =
    hasRescheduleDateTime && isAtLeast24HoursAhead(rescheduleForm.date, rescheduleForm.time);
  const goToTabWithSmoothScroll = (tab: string) => {
    setSelectedTab(tab);
    window.setTimeout(() => scrollToTabAnchor(tab), 40);
  };

  return (
    <div className="bg-background py-22 pb-14 md:py-24">
      {actionSuccess && (
        <div className="fixed right-4 top-20 z-[80] w-[min(92vw,360px)] rounded-xl border border-accent/45 bg-zinc-950/95 px-4 py-3 text-sm text-zinc-100 shadow-[0_20px_50px_-22px_rgba(212,175,55,0.9)] backdrop-blur-sm">
          <div className="font-medium text-accent">Sucesso</div>
          <div className="mt-1 text-zinc-200">{actionSuccess}</div>
        </div>
      )}
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={PAGE_ENTER}
          className="mb-10"
        >
          <h1 className="premium-title text-4xl sm:text-5xl lg:text-6xl mb-3 tracking-tight leading-tight">Minha Conta</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Bem-vindo, {user?.name}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SECTION_ENTER, delay: 0.08 }}
          className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-8"
        >
          <div className="premium-glass-card bg-card border border-border p-6 min-h-[220px] flex flex-col">
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
            <Button
              variant="accentOutline"
              icon={Edit2}
              onClick={handleOpenProfile}
              className="mt-auto w-full"
            >
              Editar Perfil
            </Button>
          </div>

          <div className="premium-glass-card bg-card border border-border p-6 min-h-[220px] flex flex-col">
            <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <Package className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              Meu plano
            </div>
            {loadingPackages ? (
              <p className="text-xs text-muted-foreground">Carregando informações do plano…</p>
            ) : !isClienteUser ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Pacotes são para contas de cliente. Gerencie assinaturas pelo painel administrativo.
              </p>
            ) : planSubscriptionsActive.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Você ainda não possui um pacote ativo. Conheça as opções na aba{" "}
                <button
                  type="button"
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={() => goToTabWithSmoothScroll("pacotes")}
                >
                  Pacotes
                </button>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {planSubscriptionsActive.slice(0, 2).map((sub) => {
                  const unlimited = Boolean(sub.sessions_unlimited);
                  const remaining = unlimited
                    ? null
                    : Math.max(0, sub.sessions_total - sub.sessions_used);
                  return (
                    <li
                      key={sub.id}
                      className="rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2.5 text-left"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {sub.package?.name ?? "Pacote"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {unlimited
                          ? `Sessões ilimitadas na vigência · ${sub.status_display}`
                          : `${remaining} sessão(ões) restante(s) · ${sub.status_display}`}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-auto h-auto px-0 py-1 text-xs text-accent hover:bg-transparent hover:text-accent/90 hover:underline"
              onClick={() => goToTabWithSmoothScroll("meu-plano")}
            >
              Ver detalhes do plano
            </Button>
          </div>

          <div className="premium-glass-card bg-card border border-border p-6 min-h-[220px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-3xl">{totalVisitas}</div>
                <div className="text-sm text-muted-foreground">Visitas Totais</div>
              </div>
              <Calendar className="w-8 h-8 text-accent" />
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                Última visita: {ultimaVisita ? formatISODatePtBR(ultimaVisita) : "Sem registros"}
              </div>
              <div>
                Próxima visita: {proximaVisita ? formatISODatePtBR(proximaVisita) : "Sem agendamento futuro"}
              </div>
            </div>
            <div className="mt-auto border-t border-border/70 pt-3 text-xs text-muted-foreground">
              Concluídas: <span className="text-foreground">{visitasConcluidas}</span> · Canceladas:{" "}
              <span className="text-foreground">{visitasCanceladas}</span>
            </div>
          </div>

          <div className="premium-glass-card bg-card border border-border p-6 min-h-[220px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-3xl text-accent">R$ {totalGasto.toLocaleString("pt-BR")}</div>
                <div className="text-sm text-muted-foreground">Gasto Total</div>
              </div>
              <Clock className="w-8 h-8 text-accent" />
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>Média: R$ {mediaVisita}/visita</div>
              <div>Total de serviços concluídos: {visitasConcluidas}</div>
            </div>
            <div className="mt-auto border-t border-border/70 pt-3 text-xs text-muted-foreground">
              Valor médio por visita: <span className="text-foreground">R$ {mediaVisita}</span>
            </div>
          </div>
        </motion.div>

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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SECTION_ENTER, delay: 0.14 }}
          ref={tabsSectionRef}
        >
          <div className="flex gap-2 sm:gap-4 mb-8 border-b border-border overflow-x-auto">
            <button
              onClick={() => setSelectedTab("agendamentos")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "agendamentos"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Meus Agendamentos
            </button>
            <button
              onClick={() => setSelectedTab("historico")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "historico"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Histórico
            </button>
            <button
              onClick={() => setSelectedTab("meu-plano")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "meu-plano"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Meu plano
            </button>
            <button
              onClick={() => setSelectedTab("pacotes")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "pacotes"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pacotes
            </button>
          </div>

          {selectedTab === "agendamentos" && (
            <motion.div
              ref={appointmentsSectionRef}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SECTION_ENTER}
              className="space-y-4"
            >
              {appointmentsError && (
                <div className="p-4 border border-destructive bg-destructive/10 text-destructive text-sm">
                  {appointmentsError}
                </div>
              )}
              {actionError && !showRescheduleModal && (
                <div className="p-4 border border-destructive bg-destructive/10 text-destructive text-sm">
                  {actionError}
                </div>
              )}
              {loadingAppointments && (
                <div className="p-4 border border-border bg-card text-sm text-muted-foreground">
                  Carregando seus agendamentos...
                </div>
              )}
              {!loadingAppointments && meusAgendamentos.length === 0 && (
                <div className="p-6 border border-border bg-card text-center text-muted-foreground">
                  Você ainda não possui agendamentos.
                </div>
              )}
              {pagedMeusAgendamentos.map((agendamento, index) => {
                const normalizedStatus = agendamento.statusKey?.toLowerCase().trim() ?? "";
                const canReagendar =
                  normalizedStatus === "agendado" ||
                  normalizedStatus === "concluido";
                const canCancel =
                  normalizedStatus === "pendente" ||
                  normalizedStatus === "agendado" ||
                  normalizedStatus === "confirmado";
                const isConcluido = normalizedStatus === "concluido";
                const hasActions = canReagendar || canCancel;
                return (
                  <div
                    key={agendamento.id}
                    ref={index === 0 ? firstAppointmentCardRef : undefined}
                    className="premium-glass-card bg-card border border-border p-4 sm:p-6 hover:border-accent/40 transition-colors"
                  >
                    <div className="flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Serviço</div>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-lg font-semibold leading-tight">{agendamento.servico}</span>
                          <span className="text-sm font-medium text-accent">{agendamento.valor}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={agendamento.statusKey} />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Barbeiro</div>
                        <p className="font-medium text-foreground">{agendamento.barbeiro}</p>
                      </div>
                      <div className="sm:col-span-1 lg:col-span-2">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Data e horário</div>
                        <p className="font-medium tabular-nums text-foreground">{formatISODatePtBR(agendamento.data)}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                          <span className="tabular-nums">{agendamento.horario}</span>
                        </div>
                      </div>
                    </div>

                    {hasActions ? (
                      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3">
                        {canReagendar && (
                          <Button
                            variant="accentOutline"
                            onClick={() => {
                              if (isConcluido) {
                                const params = new URLSearchParams({
                                  rebook: "1",
                                  service: agendamento.serviceKey ?? "",
                                  barber: agendamento.barberKey ?? "",
                                  date: agendamento.data ?? "",
                                  time: agendamento.horario ?? "",
                                });
                                navigate(`/agendamento?${params.toString()}`);
                              } else {
                                handleOpenReschedule(agendamento.id);
                              }
                            }}
                            icon={Calendar}
                            className="w-full sm:w-auto sm:min-w-[180px]"
                          >
                            {isConcluido ? "Agendar novamente" : "Reagendar"}
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            variant="destructiveOutline"
                            onClick={() => handleRequestCancel(agendamento.id)}
                            className="w-full sm:w-auto sm:min-w-[160px]"
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs italic text-muted-foreground/80">Sem ações disponíveis para este agendamento.</p>
                    )}
                  </div>
                );
              })}
              {!loadingAppointments && meusAgendamentos.length > 0 ? (
                <ListPaginationBar
                  showingCount={meusAgendamentosPagination.showingCount}
                  totalCount={meusAgendamentos.length}
                  pageSize={meusAgendamentosPagination.pageSize}
                  page={meusAgendamentosPagination.page}
                  totalPages={meusAgendamentosPagination.totalPages}
                  visiblePages={meusAgendamentosPagination.visiblePages}
                  onPageChange={meusAgendamentosPagination.setPage}
                  itemLabel="agendamentos"
                />
              ) : null}
              {showRescheduleModal && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 sm:p-6">
                  <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-2xl font-semibold">Reagendar Agendamento</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Escolha data, horário e barbeiro para o seu próximo corte.
                        </p>
                      </div>
                      <button
                        onClick={handleCloseReschedule}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Fechar modal"
                      >
                        ✕
                      </button>
                    </div>

                    {actionError && (
                      <div className="mb-4 rounded-sm border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        {actionError}
                      </div>
                    )}

                    <div className="grid gap-4">
                      <label className="block space-y-2 text-sm">
                        <span>Barbeiro</span>
                        <select
                          value={rescheduleForm.barber}
                          onChange={(event) =>
                            setRescheduleForm((prev) => ({ ...prev, barber: event.target.value }))
                          }
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          {Object.entries(BARBER_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span>Data</span>
                        <Popover open={isRescheduleDatePickerOpen} onOpenChange={setIsRescheduleDatePickerOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                            >
                              <span className="flex items-center justify-between gap-3">
                                <span className={rescheduleForm.date ? "" : "text-muted-foreground"}>
                                  {rescheduleForm.date ? formatISODatePtBR(rescheduleForm.date) : "Selecione uma data"}
                                </span>
                                <ChevronDown className="h-4 w-4 text-accent/80" />
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                          >
                            <UiCalendar
                              mode="single"
                              selected={parseISODate(rescheduleForm.date)}
                              onSelect={(date) => {
                                if (!date) return;
                                const y = date.getFullYear();
                                const m = String(date.getMonth() + 1).padStart(2, "0");
                                const d = String(date.getDate()).padStart(2, "0");
                                setRescheduleForm((prev) => ({ ...prev, date: `${y}-${m}-${d}` }));
                                setIsRescheduleDatePickerOpen(false);
                              }}
                              disabled={{ before: new Date(todayDate) }}
                              className="rounded-lg"
                              classNames={{
                                caption_label: "text-sm font-semibold capitalize tracking-wide",
                                nav_button:
                                  "h-8 w-8 rounded-md border border-border/70 bg-black/30 text-foreground hover:border-accent/50 hover:bg-accent/10",
                                day_selected: "bg-accent text-accent-foreground hover:bg-accent/90",
                                day_today: "border border-accent/60 bg-accent/20 text-accent",
                                day: "h-9 w-9 rounded-md text-sm font-medium hover:bg-accent/12",
                              }}
                            />
                            <div className="mt-2 flex items-center justify-between px-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleForm((prev) => ({ ...prev, date: todayDate }));
                                  setIsRescheduleDatePickerOpen(false);
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Hoje
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleForm((prev) => ({ ...prev, date: "" }));
                                  setIsRescheduleDatePickerOpen(false);
                                }}
                                className="text-xs text-accent hover:text-accent/80 transition-colors"
                              >
                                Limpar
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span>Horário</span>
                        <select
                          value={rescheduleForm.time}
                          onChange={(event) =>
                            setRescheduleForm((prev) => ({ ...prev, time: event.target.value }))
                          }
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        >
                          {availableTimes.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button
                        variant="ghost"
                        onClick={handleCloseReschedule}
                        className="w-full sm:w-auto"
                      >
                        Fechar
                      </Button>
                      <Button
                        variant="accentOutline"
                        onClick={handleRescheduleSubmit}
                        isLoading={isActionSaving}
                        disabled={!isRescheduleLeadTimeValid}
                        className={`w-full sm:w-auto ${
                          hasRescheduleDateTime && !isRescheduleLeadTimeValid
                            ? "animate-pulse ring-2 ring-destructive/40"
                            : ""
                        }`}
                      >
                        Confirmar Reagendamento
                      </Button>
                    </div>
                    {hasRescheduleDateTime && !isRescheduleLeadTimeValid && (
                      <p className="mt-3 text-sm text-destructive">
                        Reagendamento bloqueado: selecione uma data/horário com no mínimo 24 horas de antecedência.
                      </p>
                    )}
                  </div>
                </div>,
                document.body,
              )}

              <AlertDialog
                open={cancelAppointmentId !== null}
                onOpenChange={(open) => {
                  if (!open) handleCloseCancel();
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita
                      e o horário ficará disponível para outros clientes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {actionError && cancelAppointmentId !== null && (
                    <div className="rounded-sm border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                      {actionError}
                    </div>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isActionSaving} onClick={handleCloseCancel}>
                      Voltar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleConfirmCancel}
                      disabled={isActionSaving}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {isActionSaving ? "Cancelando..." : "Sim, cancelar"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          )}

          {selectedTab === "historico" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SECTION_ENTER}
              className="space-y-6"
            >
              <div className="premium-glass-card border border-border rounded-xl overflow-hidden">
                {historico.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-muted-foreground">
                    Ainda não há histórico para exibir.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="border-b border-border bg-muted/5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th className="text-left p-4 font-semibold">Período</th>
                        <th className="text-left p-4 font-semibold">Visitas</th>
                        <th className="text-left p-4 font-semibold">Gasto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistorico.map((item, index) => (
                        <tr key={`${item.mes}-${index}`} className="border-b border-border/70 hover:bg-accent/8 transition-colors">
                          <td className="p-4 font-medium">{item.mes}</td>
                          <td className="p-4 text-muted-foreground">{item.visitas}</td>
                          <td className="p-4 text-accent">R$ {item.gasto.toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {historico.length > 0 ? (
                  <ListPaginationBar
                    showingCount={historicoPagination.showingCount}
                    totalCount={historico.length}
                    pageSize={historicoPagination.pageSize}
                    page={historicoPagination.page}
                    totalPages={historicoPagination.totalPages}
                    visiblePages={historicoPagination.visiblePages}
                    onPageChange={historicoPagination.setPage}
                    itemLabel="registos"
                    className="border-t-0 rounded-t-none"
                  />
                ) : null}
              </div>

              <div className="premium-glass-card p-6 border border-border rounded-xl">
                <h3 className="mb-4 tracking-tight">Resumo Geral</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Total de Visitas</div>
                    <div className="text-2xl mt-1">{totalVisitas}</div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Gasto Total</div>
                    <div className="text-2xl mt-1 text-accent">R$ {totalGasto.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Ticket Médio</div>
                    <div className="text-2xl mt-1">R$ {mediaVisita}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {selectedTab === "meu-plano" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SECTION_ENTER}
              className="space-y-6"
            >
              <div className="premium-glass-card border border-border rounded-xl p-5 sm:p-7">
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="premium-title text-xl sm:text-2xl tracking-tight">Meu plano</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Acompanhe sessões, validade e status das suas assinaturas de pacote.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="accentOutline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setSelectedTab("pacotes")}
                  >
                    Ver pacotes disponíveis
                  </Button>
                </div>

                {loadingPackages ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : !isClienteUser ? (
                  <div className="rounded-xl border border-border/70 bg-background/30 px-4 py-8 text-center">
                    <Package className="mx-auto mb-3 h-10 w-10 text-accent/80" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      Esta área é para clientes acompanharem o próprio pacote. Administradores e barbeiros usam o
                      painel correspondente para gestão.
                    </p>
                  </div>
                ) : packageSubscriptions.length === 0 ? (
                  <div className="rounded-xl border border-border/70 bg-background/30 px-4 py-8 text-center">
                    <Package className="mx-auto mb-3 h-10 w-10 text-accent/80" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      Você ainda não possui assinaturas. Assine um pacote na aba Pacotes para aparecer aqui.
                    </p>
                  </div>
                ) : (
                  <>
                  <div className={`grid gap-4 ${packageSubscriptions.length > 1 ? "xl:grid-cols-2" : "grid-cols-1"}`}>
                    {pagedPackageSubscriptions.map((sub) => {
                      const unlimited = Boolean(sub.sessions_unlimited);
                      const remaining = unlimited
                        ? null
                        : Math.max(0, sub.sessions_total - sub.sessions_used);
                      const pct =
                        unlimited || sub.sessions_total <= 0
                          ? 100
                          : Math.round((sub.sessions_used / sub.sessions_total) * 100);
                      return (
                        <div
                          key={sub.id}
                          className="w-full rounded-xl border border-accent/25 bg-gradient-to-b from-accent/[0.07] to-transparent p-5 sm:p-6"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground">
                                {sub.package?.name ?? "Pacote"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{sub.status_display}</div>
                            </div>
                            <span className="shrink-0 rounded-full border border-accent/40 px-2.5 py-0.5 text-[11px] text-accent">
                              {unlimited ? "Ilimitado" : `${remaining} restantes`}
                            </span>
                          </div>
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {sub.package?.description?.trim() || "Pacote de sessões para serviços na Barbearia Demo."}
                          </p>
                          <div className="mt-4 space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Uso de sessões</span>
                              <span className="tabular-nums text-foreground">
                                {formatSubscriptionSessionsProgress(sub)}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                              <div
                                className={`h-full rounded-full transition-[width] ${unlimited ? "bg-accent/40" : "bg-accent"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border/50 pt-4 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>
                              Início:{" "}
                              <span className="text-foreground">
                                {sub.starts_at
                                  ? formatISODatePtBR(String(sub.starts_at).slice(0, 10))
                                  : new Date(sub.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>
                            <div>
                              Validade:{" "}
                              <span className="text-foreground">
                                {sub.ends_at
                                  ? formatISODatePtBR(String(sub.ends_at).slice(0, 10))
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <ListPaginationBar
                    showingCount={packageSubsPagination.showingCount}
                    totalCount={packageSubscriptions.length}
                    pageSize={packageSubsPagination.pageSize}
                    page={packageSubsPagination.page}
                    totalPages={packageSubsPagination.totalPages}
                    visiblePages={packageSubsPagination.visiblePages}
                    onPageChange={packageSubsPagination.setPage}
                    itemLabel="assinaturas"
                  />
                  </>
                )}
              </div>
            </motion.div>
          )}

          {selectedTab === "pacotes" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SECTION_ENTER}
              className="space-y-6"
            >
              {packageFeedback && (
                <div className="p-4 border border-accent/50 bg-accent/10 text-accent text-sm">
                  {packageFeedback}
                </div>
              )}
              {clienteBloqueadoNovoPacote && (
                <div className="p-4 border border-border/70 bg-muted/10 text-sm text-muted-foreground">
                  Você já possui um plano ativo ou pendente. Para assinar outro, finalize/cancele o atual.
                </div>
              )}
              <div className="premium-glass-card border border-border rounded-xl p-5">
                <h3 className="text-lg mb-3">Pacotes disponíveis</h3>
                {loadingPackages ? (
                  <div className="text-sm text-muted-foreground">Carregando pacotes...</div>
                ) : packages.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nenhum pacote disponível no momento.</div>
                ) : (
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {pagedPackages.map((pkg) => (
                      <div key={pkg.id} className="rounded-lg border border-border/70 bg-background/40 p-4">
                        <div className="font-semibold">{pkg.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 min-h-[32px]">{pkg.description}</div>
                        <div className="text-sm mt-2">
                          {formatPackageSessionsShort(pkg.sessions, pkg.sessions_unlimited)} • validade{" "}
                          {pkg.validity_days} dias
                        </div>
                        <div className="text-lg text-accent mt-2">R$ {Number(pkg.price).toFixed(2)}</div>
                        <Button
                          variant="accentOutline"
                          className="w-full mt-3"
                          onClick={() => void handleSubscribePackage(pkg)}
                          disabled={clienteBloqueadoNovoPacote}
                          isLoading={subscribingPackageId === pkg.id}
                        >
                          Assinar pacote
                        </Button>
                      </div>
                    ))}
                  </div>
                  <ListPaginationBar
                    showingCount={packagesPagination.showingCount}
                    totalCount={packages.length}
                    pageSize={packagesPagination.pageSize}
                    page={packagesPagination.page}
                    totalPages={packagesPagination.totalPages}
                    visiblePages={packagesPagination.visiblePages}
                    onPageChange={packagesPagination.setPage}
                    itemLabel="pacotes"
                  />
                  </>
                )}
              </div>
              <div className="premium-glass-card border border-border rounded-xl p-5">
                <h3 className="text-lg mb-3">Minhas assinaturas de pacote</h3>
                {packageSubscriptions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Você ainda não assinou nenhum pacote.</div>
                ) : (
                  <>
                  <div className="space-y-3">
                    {pagedPackageSubscriptions.map((sub) => (
                      <div key={sub.id} className="rounded-lg border border-border/70 bg-background/40 p-4">
                        <div className="font-medium">{sub.package?.name ?? "Pacote"}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Status: {sub.status_display} • Sessões:{" "}
                          {formatSubscriptionSessionsProgress(sub)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Solicitado em {new Date(sub.created_at).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    ))}
                  </div>
                  <ListPaginationBar
                    showingCount={packageSubsPagination.showingCount}
                    totalCount={packageSubscriptions.length}
                    pageSize={packageSubsPagination.pageSize}
                    page={packageSubsPagination.page}
                    totalPages={packageSubsPagination.totalPages}
                    visiblePages={packageSubsPagination.visiblePages}
                    onPageChange={packageSubsPagination.setPage}
                    itemLabel="assinaturas"
                  />
                  </>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>

        <PackageSubscriptionReviewModal
          open={showPackageReviewModal}
          packageName={packageReviewName}
          onOpenChange={(open) => {
            setShowPackageReviewModal(open);
            if (!open && goToMeuPlanoAfterReview) {
              setGoToMeuPlanoAfterReview(false);
              navigate("/minha-conta?tab=meu-plano", { replace: true });
            }
          }}
        />
      </div>
    </div>
  );
}
