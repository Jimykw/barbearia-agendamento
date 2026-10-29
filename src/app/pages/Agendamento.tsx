import { motion } from "motion/react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Calendar as CalendarIcon, ChevronDown, Clock, Scissors, User, Phone, Mail, CheckCircle } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { API_URL } from "@/services/api";
import { Calendar } from "@/app/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { Button } from "@/app/components/ui/button";

const scrollToTop = () => {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

type ServiceOption = {
  id: string;
  serviceId?: string;
  nome: string;
  preco: string;
  duracao: string;
  durationMinutes: number;
};

type BarberOption = {
  id: string;
  nome: string;
  especialidade: string;
  /** ISO — data em que passou a barbeiro (servidor). */
  contratadoEm?: string | null;
};

const FALLBACK_BARBEIROS: BarberOption[] = [
  { id: "barbeiro1", nome: "Barbeiro Um", especialidade: "Cortes e degradê" },
  { id: "barbeiro2", nome: "Barbeiro Dois", especialidade: "Barba e styling" },
];

const SERVICE_VALUE_MAP: Record<string, string> = {
  Corte: "corte",
  Barba: "barba",
  "Corte + Barba": "completo",
  Platinado: "platinado",
  Pigmentação: "pigmentacao",
};

const DEFAULT_SERVICES: ServiceOption[] = [
  { id: "corte", nome: "Corte Executivo", preco: "R$ 50", duracao: "30 min", durationMinutes: 30 },
  { id: "barba", nome: "Barba Tradicional", preco: "R$ 40", duracao: "25 min", durationMinutes: 25 },
  { id: "completo", nome: "Corte + Barba", preco: "R$ 80", duracao: "55 min", durationMinutes: 55 },
  { id: "platinado", nome: "Platinado", preco: "R$ 150", duracao: "90 min", durationMinutes: 90 },
  { id: "pigmentacao", nome: "Pigmentação", preco: "R$ 100", duracao: "40 min", durationMinutes: 40 },
];

/** Data local YYYY-MM-DD (evita UTC do toISOString no min do input type="date"). */
function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Evita `new Date('YYYY-MM-DD')` (UTC) que desloca um dia no fuso BR ao exibir. */
function formatISODatePtBR(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return new Date(y, month - 1, day).toLocaleDateString("pt-BR");
}

function formatBarberHiredShort(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function parseISODate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function normalizeCompare(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;
const PAGE_ENTER = { duration: 0.46, ease: PREMIUM_EASE } as const;
const SECTION_ENTER = { duration: 0.42, ease: PREMIUM_EASE } as const;

function toLocalDateTime(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date || "").trim());
  const timeMatch = /^(\d{2}):(\d{2})/.exec((time || "").trim());
  if (!dateMatch || !timeMatch) return null;
  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0,
  );
}

/** Mesma regra do backend: data não passada + horário ainda não ocorrido (permite mesmo dia). */
function isAppointmentSlotInFuture(date: string, time: string) {
  const appointmentAt = toLocalDateTime(date, time);
  if (!appointmentAt) return false;
  return appointmentAt.getTime() > Date.now();
}

function isTimeSlotInPastForSelectedDate(date: string, time: string) {
  if (!date) return true;
  return !isAppointmentSlotInFuture(date, time);
}

function humanizeAppointmentErrorMessage(raw: string): string {
  const t = raw.toLowerCase();
  if (
    t.includes("set único") ||
    t.includes("unique set") ||
    (t.includes("barber") && t.includes("date") && t.includes("time") && t.includes("único"))
  ) {
    return "Este horário já está reservado para o barbeiro escolhido. Escolha outro horário ou outro profissional.";
  }
  return raw;
}

function formatAppointmentApiError(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "Não foi possível concluir o agendamento.";
  }
  const o = data as { detail?: unknown; errors?: Record<string, unknown> };
  if (typeof o.detail === "string" && o.detail.trim()) {
    if (o.detail.toLowerCase().includes("given token not valid")) {
      return "Sessão expirada. Faça login novamente.";
    }
    return humanizeAppointmentErrorMessage(o.detail.trim());
  }
  if (o.errors && typeof o.errors === "object") {
    const parts: string[] = [];
    for (const [key, val] of Object.entries(o.errors)) {
      if (key === "detail") continue;
      if (Array.isArray(val) && val.length) {
        parts.push(val.map(String).join(", "));
      } else if (typeof val === "string") {
        parts.push(val);
      }
    }
    if (parts.length) return humanizeAppointmentErrorMessage(parts.join(" "));
  }
  return "Não foi possível concluir o agendamento.";
}

const normalizeServiceOption = (service: {
  id: number | string;
  name: string;
  price: number;
  duration_minutes: number;
}): ServiceOption => {
  const key = SERVICE_VALUE_MAP[service.name] ?? service.name.toLowerCase().replace(/\s+/g, "_");
  return {
    id: key,
    serviceId: String(service.id),
    nome: service.name,
    preco: `R$ ${service.price.toFixed(0)}`,
    duracao: `${service.duration_minutes} min`,
    durationMinutes: service.duration_minutes,
  };
};

export default function Agendamento() {
  const { user, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRebookFlow = searchParams.get("rebook") === "1";
  const prefillAppliedRef = useRef(false);
  const availabilityRequestIdRef = useRef(0);
  const [step, setStep] = useState(1);
  const [services, setServices] = useState<ServiceOption[]>(DEFAULT_SERVICES);
  const [loadingServices, setLoadingServices] = useState(false);
  const [barbeiros, setBarbeiros] = useState<BarberOption[]>(FALLBACK_BARBEIROS);
  const [loadingBarbeiros, setLoadingBarbeiros] = useState(false);

  useEffect(() => {
    scrollToTop();
  }, [step]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setFormData((current) => ({
      ...current,
      nome: current.nome || user.name,
      email: current.email || user.email || "",
      telefone: current.telefone || user.phone || "",
    }));
  }, [user]);

  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    servico: "",
    barbeiro: "",
    data: "",
    horario: ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmittingAppointment, setIsSubmittingAppointment] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  /** `null` = ainda não carregou ou falhou a API (só regra de “já passou” no cliente). */
  const [availabilitySlots, setAvailabilitySlots] = useState<string[] | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const hasDateAndTimeSelected = Boolean(formData.data && formData.horario);
  const selectedService = useMemo(
    () => services.find((item) => item.id === formData.servico) ?? null,
    [services, formData.servico],
  );
  const selectedServiceAvailabilityId = selectedService?.serviceId ?? formData.servico;
  const availableSlotSet = useMemo(
    () => (availabilitySlots !== null ? new Set(availabilitySlots) : null),
    [availabilitySlots],
  );
  const isSlotSelectionValid =
    hasDateAndTimeSelected && isAppointmentSlotInFuture(formData.data, formData.horario);

  useEffect(() => {
    const fetchServices = async () => {
      setLoadingServices(true);
      try {
        const response = await fetch(`${API_URL}/api/services/`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const rows = Array.isArray(data) ? data : (data as { results?: unknown }).results;
        if (!Array.isArray(rows)) {
          return;
        }
        const mapped = rows.map(normalizeServiceOption);
        // Lista vazia na API (ex.: Postgres sem seed de Service) não deve apagar os defaults da UI.
        if (mapped.length > 0) {
          setServices(mapped);
        }
      } catch {
        // keep default service list on failure
      } finally {
        setLoadingServices(false);
      }
    };

    fetchServices();
  }, []);

  const refetchBarbeiros = useCallback(async () => {
    setLoadingBarbeiros(true);
    try {
      const response = await fetch(`${API_URL}/api/barbers/`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      const rows = Array.isArray(data) ? data : (data as { results?: unknown }).results;
      if (!Array.isArray(rows)) {
        return;
      }
      const mapped: BarberOption[] = [];
      for (const item of rows as {
        calendar_key?: string;
        hired_at?: string | null;
        user_data?: { name?: string };
        specialties?: string;
        bio?: string;
      }[]) {
        const key = (item.calendar_key ?? "").trim();
        if (!key) continue;
        mapped.push({
          id: key,
          nome: item.user_data?.name?.trim() || key,
          especialidade: (item.specialties || item.bio || "").trim() || "Barbeiro",
          contratadoEm: item.hired_at ?? null,
        });
      }
      setBarbeiros(mapped.length > 0 ? mapped : []);
    } catch {
      // mantém lista atual em falha de rede
    } finally {
      setLoadingBarbeiros(false);
    }
  }, []);

  useEffect(() => {
    void refetchBarbeiros();
  }, [refetchBarbeiros]);

  useEffect(() => {
    if (step !== 1) {
      return;
    }
    void refetchBarbeiros();
  }, [step, refetchBarbeiros]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && step === 1) {
        void refetchBarbeiros();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [step, refetchBarbeiros]);

  const servicos = services;

  const horarios = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
  ];

  useEffect(() => {
    if (step !== 2) {
      setAvailabilityLoading(false);
      return;
    }
    const { barbeiro, data } = formData;
    if (!barbeiro || !data || !formData.servico) {
      setAvailabilitySlots(null);
      setAvailabilityLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++availabilityRequestIdRef.current;
    setAvailabilityLoading(true);
    setAvailabilitySlots(null);

    const params = new URLSearchParams({
      barber_key: barbeiro,
      date: data,
      service_id: selectedServiceAvailabilityId,
    });

    void (async () => {
      try {
        const response = await fetch(`${API_URL}/api/availability/?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (availabilityRequestIdRef.current === requestId) {
            setAvailabilitySlots(null);
          }
          return;
        }
        const body = (await response.json()) as { available_slots?: unknown };
        const raw = body.available_slots;
        const slots = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
        if (availabilityRequestIdRef.current === requestId) {
          setAvailabilitySlots(slots);
        }
      } catch {
        if (!controller.signal.aborted && availabilityRequestIdRef.current === requestId) {
          setAvailabilitySlots(null);
        }
      } finally {
        if (availabilityRequestIdRef.current === requestId) {
          setAvailabilityLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [step, formData.barbeiro, formData.data, formData.servico, selectedServiceAvailabilityId]);

  useEffect(() => {
    if (availableSlotSet === null || !formData.horario) {
      return;
    }
    if (!availableSlotSet.has(formData.horario)) {
      setFormData((current) => ({ ...current, horario: "" }));
    }
  }, [availableSlotSet, formData.horario]);

  useEffect(() => {
    if (prefillAppliedRef.current) {
      return;
    }

    const serviceParam = (searchParams.get("service") || "").trim();
    const barberParam = (searchParams.get("barber") || "").trim();
    const dateParam = (searchParams.get("date") || "").trim();
    const timeParam = (searchParams.get("time") || "").trim().slice(0, 5);

    if (!serviceParam && !barberParam && !dateParam && !timeParam) {
      prefillAppliedRef.current = true;
      return;
    }

    const normalizedServiceParam = serviceParam.toLowerCase();
    const resolvedService =
      servicos.find((item) => item.id === serviceParam)?.id ??
      servicos.find((item) => item.nome.toLowerCase() === normalizedServiceParam)?.id ??
      "";

    const normalizedBarberParam = normalizeCompare(barberParam);
    const resolvedBarber =
      barbeiros.find((item) => item.id === barberParam)?.id ??
      barbeiros.find((item) => normalizeCompare(item.nome) === normalizedBarberParam)?.id ??
      barbeiros.find((item) => normalizeCompare(item.nome).startsWith(normalizedBarberParam))?.id ??
      barbeiros.find((item) => normalizedBarberParam.startsWith(normalizeCompare(item.id)))?.id ??
      "";

    const today = todayLocalISODate();
    const resolvedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam >= today ? dateParam : today;
    let resolvedTime = horarios.includes(timeParam) ? timeParam : "";
    if (resolvedTime && !isAppointmentSlotInFuture(resolvedDate, resolvedTime)) {
      resolvedTime = "";
    }

    setFormData((current) => ({
      ...current,
      servico: resolvedService || current.servico,
      barbeiro: resolvedBarber || current.barbeiro,
      data: resolvedDate || current.data,
      horario: resolvedTime || current.horario,
    }));

    if (resolvedService) {
      setStep(2);
    }

    prefillAppliedRef.current = true;
  }, [searchParams, servicos, barbeiros, horarios]);

  useEffect(() => {
    if (!formData.data || !formData.horario) return;
    if (!isAppointmentSlotInFuture(formData.data, formData.horario)) {
      setFormData((current) => ({ ...current, horario: "" }));
    }
  }, [formData.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAppointment) return;
    setSubmitError("");

    if (!isAppointmentSlotInFuture(formData.data, formData.horario)) {
      setSubmitError("Escolha um horário que ainda não tenha passado na data selecionada.");
      return;
    }

    const payload = JSON.stringify({
      name: formData.nome,
      email: formData.email,
      phone: formData.telefone,
      service: formData.servico,
      barber: formData.barbeiro,
      date: formData.data,
      time: formData.horario.length === 5 ? `${formData.horario}:00` : formData.horario,
    });

    const post = (withAuth: boolean) =>
      fetch(`${API_URL}/api/appointments/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(withAuth ? getAuthHeaders() ?? {} : {}),
        },
        body: payload,
      });

    setIsSubmittingAppointment(true);
    try {
      let response = await post(true);

      // Token JWT inválido/expirado falha antes do AllowAny — tenta sem Authorization (agendamento público).
      if ((response.status === 401 || response.status === 403) && getAuthHeaders()?.Authorization) {
        response = await post(false);
      }

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        setSubmitError(
          response.ok
            ? "Resposta inválida do servidor."
            : `Erro HTTP ${response.status}. Verifique se a API está em ${API_URL}.`,
        );
        return;
      }

      if (!response.ok) {
        setSubmitError(formatAppointmentApiError(data));
        return;
      }

      if (isRebookFlow) {
        const authHeaders = getAuthHeaders();
        const createdId =
          typeof data === "object" && data !== null && "id" in data
            ? Number((data as { id?: unknown }).id)
            : null;
        if ((typeof createdId === "number" || typeof createdId === "string") && authHeaders) {
          await fetch(`${API_URL}/api/appointments/${createdId}/`, {
            method: "PATCH",
            headers: {
              ...authHeaders,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "confirmado" }),
          }).catch(() => null);
        }
      }

      setSubmitted(true);
      scrollToTop();
    } catch {
      setSubmitError("Erro de conexão com o servidor. Verifique se o backend Django está rodando.");
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-background flex items-center justify-center min-h-[calc(100vh-73px)] py-12 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={PAGE_ENTER}
          className="max-w-md text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.18, type: "spring" }}
            className="inline-flex items-center justify-center w-20 h-20 bg-accent/10 border-2 border-accent rounded-full mb-6"
          >
            <CheckCircle className="w-10 h-10 text-accent" />
          </motion.div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl mb-4">Agendamento Confirmado!</h2>
          <p className="text-lg text-muted-foreground mb-2">
            Seu horário foi reservado com sucesso.
          </p>
          <p className="text-muted-foreground mb-8">
            Enviamos uma confirmação para {user?.email || formData.email}
          </p>
          {isRebookFlow && (
            <p className="text-sm text-muted-foreground mb-6">
              Reagendamento concluído. Utilize os botões abaixo para ver os seus agendamentos ou marcar outro horário.
            </p>
          )}
          <div className="bg-card border border-border p-6 mb-8 text-left">
            <h3 className="mb-4">Detalhes do Agendamento</h3>
            <div className="space-y-3 text-muted-foreground">
              <p><span className="text-foreground">Serviço:</span> {servicos.find(s => s.id === formData.servico)?.nome}</p>
              <p><span className="text-foreground">Barbeiro:</span> {barbeiros.find(b => b.id === formData.barbeiro)?.nome}</p>
              <p><span className="text-foreground">Data:</span> {formatISODatePtBR(formData.data)}</p>
              <p><span className="text-foreground">Horário:</span> {formData.horario}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              type="button"
              variant="accentOutline"
              onClick={() => navigate(user ? "/minha-conta?tab=agendamentos" : "/")}
              className="px-8 py-6 text-base"
            >
              {user ? "Ver meus agendamentos" : "Voltar para Home"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setSubmitted(false);
                setStep(1);
                setFormData({
                  nome: "",
                  email: "",
                  telefone: "",
                  servico: "",
                  barbeiro: "",
                  data: "",
                  horario: ""
                });
                scrollToTop();
              }}
              className="px-8 py-6 text-base"
            >
              Fazer Novo Agendamento
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-background py-16 pb-10 sm:py-24 sm:pb-12">
      <div className="mx-auto max-w-4xl min-w-0 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={PAGE_ENTER}
          className="text-center mb-12"
        >
          <h1 className="premium-title text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 tracking-tight">Agendamento</h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground">
            Reserve seu horário em poucos passos
          </p>
        </motion.div>

        <div className="flex justify-center mb-8 sm:mb-12 overflow-x-auto">
          <div className="flex items-center gap-4">
            {[1, 2, 3].map((num) => (
              <div key={num} className="flex items-center gap-4">
                <div
                  className={`flex items-center justify-center w-10 h-10 border-2 transition-all ${
                    step >= num
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-muted text-muted-foreground"
                  }`}
                >
                  {num}
                </div>
                {num < 3 && <div className={`h-px w-12 ${step > num ? "bg-accent" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {submitError && (
            <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive text-destructive">
              {submitError}
            </div>
          )}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={SECTION_ENTER}
              className="premium-glass-card space-y-6 rounded-xl p-5 sm:p-7"
            >
              <h2 className="premium-title text-2xl sm:text-3xl mb-6">Escolha o Serviço</h2>
              {loadingServices && (
                <div className="mb-4 rounded-lg border border-border bg-muted/5 px-4 py-3 text-sm text-muted-foreground">
                  Carregando serviços disponíveis...
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {servicos.map((servico) => (
                  <label
                    key={servico.id}
                    className={`premium-glass-card cursor-pointer border-2 rounded-xl p-6 transition-all hover:border-accent ${
                      formData.servico === servico.id
                        ? "border-accent bg-accent/5"
                        : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="servico"
                      value={servico.id}
                      checked={formData.servico === servico.id}
                      onChange={(e) => setFormData({ ...formData, servico: e.target.value })}
                      className="sr-only"
                    />
                    <div className="flex items-start justify-between mb-3">
                      <h3>{servico.nome}</h3>
                      <Scissors className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{servico.preco}</span>
                      <span>{servico.duracao}</span>
                    </div>
                  </label>
                ))}
              </div>

              <h2 className="premium-title text-2xl sm:text-3xl mb-6 mt-12">Escolha o Barbeiro</h2>
              {loadingBarbeiros && (
                <div className="mb-4 rounded-lg border border-border bg-muted/5 px-4 py-3 text-sm text-muted-foreground">
                  Carregando barbeiros...
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {barbeiros.map((barbeiro) => (
                  <label
                    key={barbeiro.id}
                    className={`premium-glass-card cursor-pointer border-2 rounded-xl p-6 transition-all hover:border-accent ${
                      formData.barbeiro === barbeiro.id
                        ? "border-accent bg-accent/5"
                        : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="barbeiro"
                      value={barbeiro.id}
                      checked={formData.barbeiro === barbeiro.id}
                      onChange={(e) => setFormData({ ...formData, barbeiro: e.target.value })}
                      className="sr-only"
                    />
                    <div className="flex items-start justify-between mb-3">
                      <h3>{barbeiro.nome}</h3>
                      <User className="w-5 h-5 text-accent" />
                    </div>
                    <p className="text-muted-foreground">{barbeiro.especialidade}</p>
                    {formatBarberHiredShort(barbeiro.contratadoEm) ? (
                      <p className="mt-2 text-xs text-muted-foreground/90">
                        Barbeiro desde {formatBarberHiredShort(barbeiro.contratadoEm)}
                      </p>
                    ) : null}
                  </label>
                ))}
              </div>

              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setStep(2);
                  scrollToTop();
                }}
                disabled={!formData.servico || !formData.barbeiro}
                className="premium-cta mt-8 w-full py-6 text-base"
              >
                Continuar
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={SECTION_ENTER}
              className="premium-glass-card min-w-0 space-y-5 rounded-xl p-4 sm:space-y-6 sm:p-7"
            >
              <h2 className="premium-title mb-4 text-xl sm:mb-6 sm:text-2xl md:text-3xl">
                Escolha Data e Horário
              </h2>

              <div>
                <label className="block mb-2 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-accent" />
                  Data
                </label>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-4 py-3 text-left text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className={formData.data ? "text-foreground" : "text-muted-foreground"}>
                          {formData.data ? formatISODatePtBR(formData.data) : "Selecione uma data"}
                        </span>
                        <ChevronDown className="h-4 w-4 text-accent/80" />
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-auto max-w-[min(100vw-2rem,24rem)] rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                  >
                    <Calendar
                      mode="single"
                      selected={parseISODate(formData.data)}
                      onSelect={(date) => {
                        if (!date) return;
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const d = String(date.getDate()).padStart(2, "0");
                        setFormData((current) => ({ ...current, data: `${y}-${m}-${d}` }));
                        setIsDatePickerOpen(false);
                      }}
                      disabled={{ before: new Date(todayLocalISODate()) }}
                      className="rounded-lg"
                      classNames={{
                        caption_label: "text-sm font-semibold capitalize tracking-wide",
                        nav_button: "h-8 w-8 rounded-md border border-border/70 bg-black/30 text-foreground hover:border-accent/50 hover:bg-accent/10",
                        day_selected: "bg-accent text-accent-foreground hover:bg-accent/90",
                        day_today: "border border-accent/60 bg-accent/20 text-accent",
                        day: "h-9 w-9 rounded-md text-sm font-medium hover:bg-accent/12",
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {!formData.data && (
                  <p className="mt-2 text-xs text-muted-foreground">Selecione uma data para continuar.</p>
                )}
              </div>

              <div>
                <label className="block mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-accent" />
                  Horário Disponível
                </label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
                  {horarios.map((horario) => {
                    const slotPast = Boolean(
                      formData.data && isTimeSlotInPastForSelectedDate(formData.data, horario),
                    );
                    const slotTaken =
                      Boolean(formData.data) &&
                      availableSlotSet !== null &&
                      !availableSlotSet.has(horario);
                    const slotDisabled = slotPast || slotTaken;
                    return (
                      <label
                        key={horario}
                        className={`premium-glass-card rounded-lg border-2 p-2 text-center text-sm transition-all sm:p-3 sm:text-base ${
                          slotDisabled
                            ? "cursor-not-allowed border-border/50 opacity-40"
                            : "cursor-pointer hover:border-accent"
                        } ${
                          formData.horario === horario
                            ? "border-accent bg-accent/5"
                            : "border-border"
                        }`}
                      >
                        <input
                          type="radio"
                          name="horario"
                          value={horario}
                          disabled={slotDisabled}
                          checked={formData.horario === horario}
                          onChange={(e) => setFormData({ ...formData, horario: e.target.value })}
                          className="sr-only"
                        />
                        {horario}
                      </label>
                    );
                  })}
                </div>
                {availabilityLoading && (
                  <p className="mt-2 text-xs text-muted-foreground">Atualizando horários disponíveis…</p>
                )}
                {!availabilityLoading && availableSlotSet !== null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Horários indisponíveis (ocupados ou fora do expediente) aparecem bloqueados.
                  </p>
                )}
                {selectedService && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Duração do serviço escolhido: {selectedService.durationMinutes} min.
                  </p>
                )}
                {formData.data === todayLocalISODate() && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Horários já passados hoje aparecem indisponíveis.
                  </p>
                )}
              </div>

              <div className="mt-6 flex min-w-0 flex-col gap-3 sm:mt-8 sm:flex-row sm:gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep(1);
                    scrollToTop();
                  }}
                  className="premium-cta w-full border border-foreground py-6 text-foreground hover:bg-foreground hover:text-background sm:flex-1"
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setStep(3);
                    scrollToTop();
                  }}
                  disabled={!formData.data || !formData.horario || !isSlotSelectionValid}
                  className={`premium-cta w-full py-6 text-base sm:flex-1 ${
                    hasDateAndTimeSelected && !isSlotSelectionValid
                      ? "opacity-70 ring-2 ring-destructive/40"
                      : ""
                  }`}
                >
                  Continuar
                </Button>
              </div>
              {hasDateAndTimeSelected && !isSlotSelectionValid && (
                <p className="text-sm text-destructive">
                  Para hoje, escolha um horário que ainda não tenha passado.
                </p>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={SECTION_ENTER}
              className="premium-glass-card min-w-0 space-y-6 rounded-xl p-4 sm:p-7"
            >
              <h2 className="premium-title mb-6 text-xl sm:text-2xl md:text-3xl">Seus Dados</h2>

              <div>
                <label className="block mb-2 flex items-center gap-2">
                  <User className="w-5 h-5 text-accent" />
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="Seu nome"
                  required
                />
              </div>

              <div>
                <label className="block mb-2 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-accent" />
                  E-mail
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="seu@email.com"
                  required
                />
              </div>

              <div>
                <label className="block mb-2 flex items-center gap-2">
                  <Phone className="w-5 h-5 text-accent" />
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="w-full px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>

              <div className="bg-card border border-border p-6 mt-8">
                <h3 className="mb-4">Resumo do Agendamento</h3>
                <div className="space-y-2 text-muted-foreground">
                  <p><span className="text-foreground">Serviço:</span> {servicos.find(s => s.id === formData.servico)?.nome}</p>
                  <p><span className="text-foreground">Barbeiro:</span> {barbeiros.find(b => b.id === formData.barbeiro)?.nome}</p>
                  <p><span className="text-foreground">Data:</span> {formData.data ? formatISODatePtBR(formData.data) : ""}</p>
                  <p><span className="text-foreground">Horário:</span> {formData.horario}</p>
                  <p className="text-xl pt-3 border-t border-border mt-3">
                    <span className="text-foreground">Total:</span> {servicos.find(s => s.id === formData.servico)?.preco}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep(2);
                    scrollToTop();
                  }}
                  className="w-full border border-foreground py-6 text-foreground hover:bg-foreground hover:text-background sm:flex-1"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    !formData.nome ||
                    !formData.email ||
                    !formData.telefone ||
                    !isSlotSelectionValid ||
                    isSubmittingAppointment
                  }
                  isLoading={isSubmittingAppointment}
                  className={`w-full py-6 text-base sm:flex-1 ${
                    hasDateAndTimeSelected && !isSlotSelectionValid
                      ? "opacity-70 ring-2 ring-destructive/40"
                      : ""
                  }`}
                >
                  {isSubmittingAppointment ? "Confirmando..." : "Confirmar Agendamento"}
                </Button>
              </div>
              {hasDateAndTimeSelected && !isSlotSelectionValid && (
                <p className="text-sm text-destructive">
                  Ajuste data e horário: para hoje, o horário precisa ser futuro.
                </p>
              )}
            </motion.div>
          )}
        </form>
      </div>
    </div>
  );
}
