import { motion } from "motion/react";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  Calendar, Scissors, TrendingUp, Clock,
  Edit, Trash2, Download, DollarSign, AlertCircle, XCircle, CheckCircle2,
  Mail, MessageCircle, Banknote, QrCode, CreditCard, Package,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/button";
import { Calendar as UiCalendar } from "@/app/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Checkbox } from "@/app/components/ui/checkbox";
import { getStatusMeta, StatusBadge, StatusSelect } from "@/app/components/ui/status-badge";
import { isAtLeast24HoursAhead, resolveOperationalStatus, toLocalDateTime } from "@/app/shared/appointment-status";
import { API_URL } from "@/services/api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/app/components/ui/alert-dialog";
import {
  applyPdfFooters,
  beginBrandedPdf,
  drawDataTable,
  drawSummaryCards,
  savePdf,
  writeMetaLines,
  writeReportTitle,
} from "@/lib/pdfTheme";
import { usePagination } from "@/app/hooks/usePagination";
import { ListPaginationBar } from "@/app/components/ListPaginationBar";
import { formatPackageSessionsShort, formatSubscriptionSessionsProgress } from "@/lib/clientPackageCopy";

function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function toLocalISODate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toApiStatus(status: AppointmentStatus): Exclude<AppointmentStatus, "agendado"> {
  return status === "agendado" ? "confirmado" : status;
}

function normalizeTimeInput(value: string) {
  return (value || "").slice(0, 5);
}

const TIMELINE_START_MIN = 9 * 60;
const TIMELINE_END_MIN = 20 * 60;
const TIMELINE_STEP_MIN = 30;

function timeToMinutes(value: string) {
  const normalized = normalizeTimeInput(value);
  const [h, m] = normalized.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return TIMELINE_START_MIN;
  return h * 60 + m;
}

function minutesToTime(value: number) {
  const safe = Math.min(TIMELINE_END_MIN, Math.max(TIMELINE_START_MIN, value));
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function snapMinutes(value: number) {
  return Math.round(value / TIMELINE_STEP_MIN) * TIMELINE_STEP_MIN;
}

const AGENDA_TIME_OPTIONS = Array.from({ length: 23 }, (_, index) => {
  const totalMinutes = TIMELINE_START_MIN + index * TIMELINE_STEP_MIN;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
});
const SELECT_ALL_BARBERS = "__all_barbers__";
const SELECT_GLOBAL_BLOCKS = "__global_blocks__";

function hasBlockedSlotConflict(
  slots: BlockedSlot[],
  draft: { barber_calendar_key: string; date: string; start_time: string; end_time: string },
  excludeId?: number,
) {
  const draftBarber = (draft.barber_calendar_key || "").trim().toLowerCase();
  const draftStart = normalizeTimeInput(draft.start_time);
  const draftEnd = normalizeTimeInput(draft.end_time);
  if (!draft.date || !draftStart || !draftEnd || draftStart >= draftEnd) return false;

  return slots.some((slot) => {
    if (excludeId && slot.id === excludeId) return false;
    if (slot.date !== draft.date) return false;

    const slotBarber = (slot.barber_calendar_key || "").trim().toLowerCase();
    const overlapsScope =
      draftBarber === "" || slotBarber === "" || slotBarber === draftBarber;
    if (!overlapsScope) return false;

    const slotStart = normalizeTimeInput(slot.start_time);
    const slotEnd = normalizeTimeInput(slot.end_time);
    return draftStart < slotEnd && draftEnd > slotStart;
  });
}

function getApiErrorMessage(errorData: unknown, fallback: string) {
  if (!errorData || typeof errorData !== "object" || Array.isArray(errorData)) return fallback;
  const data = errorData as {
    detail?: unknown;
    status?: unknown;
    time?: unknown;
    date?: unknown;
    non_field_errors?: unknown;
  };
  if (
    typeof data.detail === "string" &&
    data.detail.toLowerCase().includes("given token not valid")
  ) {
    return "Sessão expirada. Faça login novamente.";
  }
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  if (typeof data.status === "string" && data.status.trim()) return data.status;
  if (typeof data.time === "string" && data.time.trim()) return data.time;
  if (typeof data.date === "string" && data.date.trim()) return data.date;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
    return String(data.non_field_errors[0]);
  }
  for (const [key, val] of Object.entries(data)) {
    if (["detail", "status", "time", "date", "non_field_errors"].includes(key)) continue;
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === "string" && first.trim()) {
        return `${key}: ${first}`;
      }
    }
    if (typeof val === "string" && val.trim()) {
      return `${key}: ${val}`;
    }
  }
  return fallback;
}

type AppointmentStatus = "agendado" | "confirmado" | "pendente" | "cancelado" | "em_atendimento" | "concluido";

type Appointment = {
  id: number;
  name: string;
  email: string;
  phone: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  status: AppointmentStatus;
};

type UserRole = "cliente" | "barbeiro" | "admin";
type ExportMode = "executivo" | "detalhado";

type AdminPortalUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  date_joined: string;
  barber_specialties?: string;
  /** ISO quando passou a barbeiro (última promoção). */
  barber_hired_at?: string | null;
};

type BarberDirectoryItem = {
  calendar_key?: string;
  user_data?: { name?: string };
};

type BusinessHour = {
  id: number;
  weekday: number;
  weekday_label: string;
  open_time: string;
  close_time: string;
  is_open: boolean;
};

type BlockedSlot = {
  id: number;
  barber_calendar_key: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
};

type BlockTemplate = {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  reason: string;
  is_active?: boolean;
};

type PaymentTransaction = {
  id: number;
  amount: string;
  status: string;
  status_display: string;
  /** Código: mercado_pago | dinheiro | pix | pacote */
  provider?: string;
  provider_display: string;
  created_at: string;
  updated_at: string;
  raw_payload?: Record<string, unknown> | null;
  appointment_summary?: {
    id: number;
    name: string;
    service: string;
    barber: string;
    /** Nome do profissional (perfil barbeiro ou legado). */
    barber_display?: string;
    /** Preço de tabela do serviço (independente de pacote / valor liquidado). */
    service_list_price?: string;
    date: string;
    time: string;
    status: string;
  } | null;
};

type NotificationEvent = {
  id: number;
  channel: string;
  channel_display: string;
  event_type: string;
  recipient: string;
  status: string;
  status_display: string;
  message: string;
  created_at: string;
  appointment_summary?: {
    id: number;
    name: string;
    service: string;
    barber: string;
    date: string;
    time: string;
    status: string;
  } | null;
};

type ClientPackageSubscriptionOverview = {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  status_display: string;
  sessions_total: number;
  sessions_used: number;
  sessions_unlimited?: boolean;
  created_at: string;
  pending_login_notice?: boolean;
  login_notice_reason?: string;
  expiry_notice_label?: string;
  package?: {
    id: number;
    name: string;
    price: string;
  } | null;
};

type ClientPackageAdmin = {
  id: number;
  name: string;
  description: string;
  sessions: number;
  sessions_unlimited?: boolean;
  price: string;
  validity_days: number;
  is_active: boolean;
};

const HIDDEN_PEOPLE_IDENTIFIERS = {
  usernames: new Set(["admin"]),
  emails: new Set(["admin@example.com"]),
};

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
const DEFAULT_BARBER_KEY = "barbeiro1";

const SERVICE_PRICES: Record<string, number> = {
  corte: 50,
  barba: 40,
  completo: 80,
  platinado: 150,
  pigmentacao: 100,
};

const NOTIFICATION_STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  failed: "Falhou",
  skipped: "Ignorado",
  pending: "Pendente",
};

const NOTIFICATION_EVENT_LABELS: Record<string, string> = {
  appointment_created: "Novo agendamento criado",
  appointment_created_email: "Novo agendamento por e-mail",
  appointment_payment_approved: "Pagamento aprovado",
  appointment_payment_approved_email: "Pagamento aprovado por e-mail",
  package_subscription_requested: "Solicitação de pacote",
  package_subscription_requested_email: "Solicitação de pacote por e-mail",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  rejected: "Recusado",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  refunded: "Reembolsado",
  in_process: "Em análise",
  in_mediation: "Em mediação",
  charged_back: "Contestação",
};

const PAYMENT_PROVIDER_LABELS: Record<string, string> = {
  mercado_pago: "Mercado Pago",
  dinheiro: "Dinheiro (balcão)",
  pix: "Pix (balcão)",
  pacote: "Pacote",
  "dinheiro (balcao)": "Dinheiro (balcão)",
  "pix (balcao)": "Pix (balcão)",
};

function getNotificationStatusLabel(statusKey: string) {
  const normalized = String(statusKey || "").trim().toLowerCase();
  return NOTIFICATION_STATUS_LABELS[normalized] ?? (statusKey || "-");
}

function getNotificationEventLabel(eventType: string) {
  const normalized = String(eventType || "").trim().toLowerCase();
  if (NOTIFICATION_EVENT_LABELS[normalized]) {
    return NOTIFICATION_EVENT_LABELS[normalized];
  }
  return normalized
    ? normalized
        .replaceAll("_", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : "-";
}

function formatNotificationEventDateParts(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function getNotificationStatusBadgeClass(status: string) {
  const n = String(status || "").trim().toLowerCase();
  if (n === "sent") return "border-emerald-500/45 bg-emerald-500/12 text-emerald-200";
  if (n === "failed") return "border-red-500/50 bg-red-500/12 text-red-200";
  if (n === "skipped") return "border-amber-500/45 bg-amber-500/12 text-amber-100";
  if (n === "pending") return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  return "border-border/60 bg-muted/15 text-muted-foreground";
}

function getPaymentStatusLabel(statusKey: string, fallbackDisplay?: string) {
  const normalized = String(statusKey || "").trim().toLowerCase();
  if (PAYMENT_STATUS_LABELS[normalized]) return PAYMENT_STATUS_LABELS[normalized];
  if (fallbackDisplay && fallbackDisplay.trim()) return fallbackDisplay;
  return normalized
    ? normalized.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
    : "-";
}

function getPaymentProviderLabel(providerValue: string) {
  const normalized = String(providerValue || "").trim().toLowerCase();
  if (PAYMENT_PROVIDER_LABELS[normalized]) return PAYMENT_PROVIDER_LABELS[normalized];
  return providerValue || "-";
}

/** Rótulo curto para coluna "Forma" (dinheiro/pix/MP ou nome do plano em pacote). */
function getPaymentFormaLabel(tx: Pick<PaymentTransaction, "provider" | "provider_display" | "raw_payload">) {
  const raw = (tx.raw_payload || {}) as { package_plan_name?: string; package_session?: boolean };
  const planName = String(raw.package_plan_name || "").trim();
  if (planName) return planName;
  const code = String(tx.provider || "").trim().toLowerCase();
  if (code === "pacote" || raw.package_session) return "Pacote";
  if (code === "dinheiro") return "Dinheiro";
  if (code === "pix") return "Pix";
  if (code === "mercado_pago") return "Mercado Pago";
  return getPaymentProviderLabel(tx.provider_display);
}

function getPaymentFormaPillClass(tx: Pick<PaymentTransaction, "provider" | "provider_display" | "raw_payload">) {
  const code = String(tx.provider || "").trim().toLowerCase();
  const raw = (tx.raw_payload || {}) as { package_session?: boolean };
  if (code === "pacote" || raw.package_session) {
    return "border-violet-500/38 bg-violet-500/10 text-violet-100";
  }
  if (code === "dinheiro") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (code === "pix") return "border-cyan-500/38 bg-cyan-500/10 text-cyan-100";
  if (code === "mercado_pago") return "border-sky-500/38 bg-sky-500/10 text-sky-100";
  return "border-border/55 bg-muted/15 text-muted-foreground";
}

function getPaymentTransactionStatusBadgeClass(status: string) {
  const n = String(status || "").trim().toLowerCase();
  if (n === "approved") return "border-emerald-500/45 bg-emerald-500/12 text-emerald-200";
  if (n === "pending") return "border-sky-500/40 bg-sky-500/12 text-sky-100";
  if (n === "rejected") return "border-red-500/50 bg-red-500/12 text-red-200";
  if (n === "cancelled" || n === "canceled") return "border-zinc-500/45 bg-zinc-500/10 text-zinc-300";
  if (n === "refunded") return "border-violet-500/42 bg-violet-500/12 text-violet-100";
  return "border-border/60 bg-muted/15 text-muted-foreground";
}

function getPaymentProviderPillClass(tx: Pick<PaymentTransaction, "provider" | "provider_display" | "raw_payload">) {
  const code = String(tx.provider || "").trim().toLowerCase();
  const raw = (tx.raw_payload || {}) as { package_session?: boolean };
  if (code === "pacote" || raw.package_session) {
    return "border-violet-500/28 bg-violet-500/8 text-violet-200/90";
  }
  if (code === "mercado_pago") return "border-sky-500/30 bg-sky-500/8 text-sky-200/90";
  if (code === "dinheiro" || code === "pix") return "border-white/10 bg-white/[0.04] text-muted-foreground";
  return "border-border/50 bg-muted/10 text-muted-foreground";
}

/** Preço de tabela do serviço do agendamento (ex.: pacote com transação R$ 0). */
function getPaymentTransactionServiceListAmount(tx: PaymentTransaction): number {
  const raw = tx.appointment_summary?.service_list_price;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  const fallback = Number(tx.amount);
  return Number.isNaN(fallback) ? 0 : fallback;
}

function getPaymentTransactionBarberLabel(tx: PaymentTransaction): string {
  const s = tx.appointment_summary;
  if (!s) return "—";
  const display = (s.barber_display || "").trim();
  if (display) return display;
  const key = (s.barber || "").trim();
  if (!key) return "—";
  return BARBER_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Dashboard() {
  const [selectedTab, setSelectedTab] = useState("hoje");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [appointmentSuccess, setAppointmentSuccess] = useState<string | null>(null);
  const [showAppointmentError, setShowAppointmentError] = useState(false);
  const [showAppointmentSuccess, setShowAppointmentSuccess] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    email: string;
    phone: string;
    service: string;
    barber: string;
    date: string;
    time: string;
    status: AppointmentStatus;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isEditDatePickerOpen, setIsEditDatePickerOpen] = useState(false);
  const [isCreateDatePickerOpen, setIsCreateDatePickerOpen] = useState(false);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const [editAppointmentError, setEditAppointmentError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    phone: "",
    service: "corte",
    barber: DEFAULT_BARBER_KEY,
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    status: "pendente" as AppointmentStatus,
  });
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [reportServiceFilter, setReportServiceFilter] = useState<string>("all");
  const [allAppointmentsSearchQuery, setAllAppointmentsSearchQuery] = useState("");
  const [allAppointmentsStatusFilter, setAllAppointmentsStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [allAppointmentsServiceFilter, setAllAppointmentsServiceFilter] = useState<string>("all");
  const [allAppointmentsBarberFilter, setAllAppointmentsBarberFilter] = useState<string>("all");
  const [allAppointmentsStartDate, setAllAppointmentsStartDate] = useState("");
  const [allAppointmentsEndDate, setAllAppointmentsEndDate] = useState("");
  const [allAppointmentsStartDatePickerOpen, setAllAppointmentsStartDatePickerOpen] = useState(false);
  const [allAppointmentsEndDatePickerOpen, setAllAppointmentsEndDatePickerOpen] = useState(false);
  const [barberOptions, setBarberOptions] = useState<Array<{ key: string; label: string }>>(
    Object.entries(BARBER_LABELS).map(([key, label]) => ({ key, label })),
  );
  const [users, setUsers] = useState<AdminPortalUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminPortalUser | null>(null);
  const [userRoleDraft, setUserRoleDraft] = useState<UserRole>("cliente");
  const [barberSpecialtiesDraft, setBarberSpecialtiesDraft] = useState("");
  const [userProfileDraft, setUserProfileDraft] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    is_active: true,
  });
  const [isSavingUserRole, setIsSavingUserRole] = useState(false);
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);
  const userDetailRequestRef = useRef(0);
  const [resetPasswordDraft, setResetPasswordDraft] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showRoleConfirmDialog, setShowRoleConfirmDialog] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([]);
  const [savingClientPackageSubscriptionId, setSavingClientPackageSubscriptionId] = useState<number | null>(null);
  const [paymentSearchQuery, setPaymentSearchQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [paymentStartDate, setPaymentStartDate] = useState("");
  const [paymentEndDate, setPaymentEndDate] = useState("");
  const [paymentStartDatePickerOpen, setPaymentStartDatePickerOpen] = useState(false);
  const [paymentEndDatePickerOpen, setPaymentEndDatePickerOpen] = useState(false);
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([]);
  const [clientPackageSubscriptions, setClientPackageSubscriptions] = useState<ClientPackageSubscriptionOverview[]>([]);
  const [clientPackages, setClientPackages] = useState<ClientPackageAdmin[]>([]);
  const [pendingDeleteClientPackageSubscriptionId, setPendingDeleteClientPackageSubscriptionId] = useState<number | null>(null);
  const [notificationStatusFilter, setNotificationStatusFilter] = useState<string>("all");
  const [isLoadingCommercial, setIsLoadingCommercial] = useState(false);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [editingClientPackage, setEditingClientPackage] = useState<ClientPackageAdmin | null>(null);
  const [clientPackageForm, setClientPackageForm] = useState<{
    name: string;
    description: string;
    sessions: string;
    sessions_unlimited: boolean;
    price: string;
    validity_days: string;
    is_active: boolean;
  } | null>(null);
  const [isSavingClientPackage, setIsSavingClientPackage] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [isLoadingScheduleConfig, setIsLoadingScheduleConfig] = useState(false);
  const [isSavingBusinessHourId, setIsSavingBusinessHourId] = useState<number | null>(null);
  const [isCreatingBlockedSlot, setIsCreatingBlockedSlot] = useState(false);
  const [deletingBlockedSlotId, setDeletingBlockedSlotId] = useState<number | null>(null);
  const [editingBlockedSlotId, setEditingBlockedSlotId] = useState<number | null>(null);
  const [isSavingBlockedSlotEdit, setIsSavingBlockedSlotEdit] = useState(false);
  const [pendingDeleteBlockedSlotId, setPendingDeleteBlockedSlotId] = useState<number | null>(null);
  const [blockedSlotsPageSize, setBlockedSlotsPageSize] = useState(5);
  const [blockedSlotSort, setBlockedSlotSort] = useState<{
    field: "date" | "start_time" | "barber_calendar_key";
    direction: "asc" | "desc";
  }>({
    field: "date",
    direction: "asc",
  });
  const [scheduleConfigError, setScheduleConfigError] = useState<string | null>(null);
  const [blockForm, setBlockForm] = useState({
    barber_calendar_key: "",
    date: new Date().toISOString().slice(0, 10),
    start_time: "12:00",
    end_time: "13:00",
    reason: "",
  });
  const [blockedSlotDraft, setBlockedSlotDraft] = useState({
    barber_calendar_key: "",
    date: "",
    start_time: "",
    end_time: "",
    reason: "",
  });
  const [blockedSlotFilter, setBlockedSlotFilter] = useState({
    barber_calendar_key: "all",
    date: "",
  });
  const [blockTemplates, setBlockTemplates] = useState<BlockTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const [isBlockDatePickerOpen, setIsBlockDatePickerOpen] = useState(false);
  const [isFilterDatePickerOpen, setIsFilterDatePickerOpen] = useState(false);
  const [editDatePickerOpenId, setEditDatePickerOpenId] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const { user, getAuthHeaders, authFetch, refreshProfile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!appointmentError) return;
    setShowAppointmentError(true);

    const hideTimer = window.setTimeout(() => {
      setShowAppointmentError(false);
    }, 4000);

    const clearTimer = window.setTimeout(() => {
      setAppointmentError(null);
    }, 4500);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [appointmentError]);

  useEffect(() => {
    if (!appointmentSuccess) return;
    setShowAppointmentSuccess(true);

    const hideTimer = window.setTimeout(() => {
      setShowAppointmentSuccess(false);
    }, 3000);

    const clearTimer = window.setTimeout(() => {
      setAppointmentSuccess(null);
    }, 3400);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [appointmentSuccess]);

  const fetchAdminUsers = async () => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const response = await authFetch(`${API_URL}/api/auth/users/`, { headers });
      if (!response) {
        navigate("/", { replace: true });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setUsersError(getApiErrorMessage(errorData, "Não foi possível carregar as pessoas cadastradas."));
        setUsers([]);
        return;
      }
      const data = await response.json();
      const usersData = Array.isArray(data) ? (data as AdminPortalUser[]) : [];
      const filteredUsers = usersData.filter((u) => {
        const username = (u.username || "").trim().toLowerCase();
        const email = (u.email || "").trim().toLowerCase();
        return (
          !HIDDEN_PEOPLE_IDENTIFIERS.usernames.has(username) &&
          !HIDDEN_PEOPLE_IDENTIFIERS.emails.has(email)
        );
      });
      setUsers(filteredUsers);
    } catch {
      setUsersError("Erro de conexão ao carregar as pessoas cadastradas.");
      setUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const syncBarberOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/api/barbers/`);
      if (!response.ok) return;
      const data = await response.json();
      const rows = Array.isArray(data) ? (data as BarberDirectoryItem[]) : [];
      const mapped = rows
        .map((item) => {
          const key = (item.calendar_key || "").trim();
          if (!key) return null;
          return {
            key,
            label: (item.user_data?.name || key).trim(),
          };
        })
        .filter((item): item is { key: string; label: string } => Boolean(item));
      if (mapped.length > 0) {
        setBarberOptions(mapped);
      }
    } catch {
      // mantém opções padrão quando API de barbeiros falhar
    }
  };

  const fetchScheduleConfig = async () => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsLoadingScheduleConfig(true);
    setIsLoadingTemplates(true);
    setScheduleConfigError(null);
    try {
      const [hoursResponse, slotsResponse, templatesResponse] = await Promise.all([
        authFetch(`${API_URL}/api/business-hours/`, { headers }),
        authFetch(`${API_URL}/api/blocked-slots/`, { headers }),
        authFetch(`${API_URL}/api/blocked-templates/?active=true`, { headers }),
      ]);
      if (!hoursResponse || !slotsResponse || !templatesResponse) {
        navigate("/", { replace: true });
        return;
      }

      if (
        hoursResponse.status === 401 || hoursResponse.status === 403
        || slotsResponse.status === 401 || slotsResponse.status === 403
        || templatesResponse.status === 401 || templatesResponse.status === 403
      ) {
        navigate("/", { replace: true });
        return;
      }

      if (!hoursResponse.ok || !slotsResponse.ok || !templatesResponse.ok) {
        const failedResponse = !hoursResponse.ok ? hoursResponse : !slotsResponse.ok ? slotsResponse : templatesResponse;
        const errorData = await failedResponse.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível carregar as configurações da agenda."));
        return;
      }

      const hoursData = await hoursResponse.json();
      const slotsData = await slotsResponse.json();
      const templatesData = await templatesResponse.json();
      setBusinessHours(Array.isArray(hoursData) ? (hoursData as BusinessHour[]) : []);
      setBlockedSlots(Array.isArray(slotsData) ? (slotsData as BlockedSlot[]) : []);
      setBlockTemplates(Array.isArray(templatesData) ? (templatesData as BlockTemplate[]) : []);
    } catch {
      setScheduleConfigError("Erro de conexão ao carregar horários e bloqueios.");
    } finally {
      setIsLoadingScheduleConfig(false);
      setIsLoadingTemplates(false);
    }
  };

  const fetchCommercialData = async () => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsLoadingCommercial(true);
    setCommercialError(null);
    try {
      const [paymentsResponse, notificationsResponse, clientPackagesSubscriptionsResponse, clientPackagesResponse] = await Promise.all([
        authFetch(`${API_URL}/api/payments/transactions/`, { headers }),
        authFetch(`${API_URL}/api/operations/notifications/`, { headers }),
        authFetch(`${API_URL}/api/client-packages/subscriptions/`, { headers }),
        authFetch(`${API_URL}/api/client-packages/`, { headers }),
      ]);
      if (!paymentsResponse || !notificationsResponse || !clientPackagesSubscriptionsResponse || !clientPackagesResponse) {
        navigate("/", { replace: true });
        return;
      }
      if (
        paymentsResponse.status === 401 || paymentsResponse.status === 403
        || notificationsResponse.status === 401 || notificationsResponse.status === 403
        || clientPackagesSubscriptionsResponse.status === 401 || clientPackagesSubscriptionsResponse.status === 403
        || clientPackagesResponse.status === 401 || clientPackagesResponse.status === 403
      ) {
        navigate("/", { replace: true });
        return;
      }
      if (!paymentsResponse.ok || !notificationsResponse.ok || !clientPackagesSubscriptionsResponse.ok || !clientPackagesResponse.ok) {
        const failed = !paymentsResponse.ok
          ? paymentsResponse
          : !notificationsResponse.ok
            ? notificationsResponse
            : !clientPackagesSubscriptionsResponse.ok
              ? clientPackagesSubscriptionsResponse
              : clientPackagesResponse;
        const errorData = await failed.json().catch(() => null);
        setCommercialError(getApiErrorMessage(errorData, "Não foi possível carregar dados comerciais."));
        return;
      }
      const [paymentsData, notificationsData, clientPackagesSubscriptionsData, clientPackagesData] = await Promise.all([
        paymentsResponse.json(),
        notificationsResponse.json(),
        clientPackagesSubscriptionsResponse.json(),
        clientPackagesResponse.json(),
      ]);
      setPaymentTransactions(Array.isArray(paymentsData) ? (paymentsData as PaymentTransaction[]) : []);
      setNotificationEvents(Array.isArray(notificationsData) ? (notificationsData as NotificationEvent[]) : []);
      setClientPackageSubscriptions(
        Array.isArray(clientPackagesSubscriptionsData)
          ? (clientPackagesSubscriptionsData as ClientPackageSubscriptionOverview[])
          : [],
      );
      setClientPackages(
        Array.isArray(clientPackagesData)
          ? (clientPackagesData as ClientPackageAdmin[])
          : [],
      );
    } catch {
      setCommercialError("Erro de conexão ao carregar dados comerciais.");
    } finally {
      setIsLoadingCommercial(false);
    }
  };

  const handleOpenEditClientPackage = (pkg: ClientPackageAdmin) => {
    setEditingClientPackage(pkg);
    setClientPackageForm({
      name: pkg.name,
      description: pkg.description || "",
      sessions: String(pkg.sessions ?? 1),
      sessions_unlimited: Boolean(pkg.sessions_unlimited),
      price: String(pkg.price ?? ""),
      validity_days: String(pkg.validity_days ?? 30),
      is_active: Boolean(pkg.is_active),
    });
  };

  const handleCloseEditClientPackage = () => {
    if (isSavingClientPackage) return;
    setEditingClientPackage(null);
    setClientPackageForm(null);
  };

  const handleSaveClientPackage = async () => {
    if (!editingClientPackage || !clientPackageForm) return;
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsSavingClientPackage(true);
    setCommercialError(null);
    try {
      const response = await authFetch(`${API_URL}/api/client-packages/${editingClientPackage.id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: clientPackageForm.name.trim(),
          description: clientPackageForm.description.trim(),
          sessions: clientPackageForm.sessions_unlimited
            ? Math.max(1, Number(clientPackageForm.sessions || 1))
            : Number(clientPackageForm.sessions || 1),
          sessions_unlimited: clientPackageForm.sessions_unlimited,
          price: clientPackageForm.price,
          validity_days: Number(clientPackageForm.validity_days || 30),
          is_active: clientPackageForm.is_active,
        }),
      });
      if (!response) {
        navigate("/", { replace: true });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setCommercialError(getApiErrorMessage(errorData, "Não foi possível atualizar o pacote."));
        return;
      }
      await fetchCommercialData();
      handleCloseEditClientPackage();
    } catch {
      setCommercialError("Erro de conexão ao atualizar o pacote.");
    } finally {
      setIsSavingClientPackage(false);
    }
  };

  const handleUpdateClientPackageSubscriptionStatus = async (
    subscriptionId: number,
    status: "active" | "canceled",
  ) => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setSavingClientPackageSubscriptionId(subscriptionId);
    setCommercialError(null);
    try {
      const response = await authFetch(`${API_URL}/api/client-packages/subscriptions/${subscriptionId}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });
      if (!response) {
        navigate("/", { replace: true });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setCommercialError(getApiErrorMessage(errorData, "Não foi possível atualizar a assinatura do pacote."));
        return;
      }
      await fetchCommercialData();
    } catch {
      setCommercialError("Erro de conexão ao atualizar assinatura do pacote.");
    } finally {
      setSavingClientPackageSubscriptionId(null);
    }
  };

  const handleRemoveClientPackageSubscription = async (subscriptionId: number) => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setSavingClientPackageSubscriptionId(subscriptionId);
    setCommercialError(null);
    try {
      const response = await authFetch(`${API_URL}/api/client-packages/subscriptions/${subscriptionId}/`, {
        method: "DELETE",
        headers,
      });
      if (!response) {
        navigate("/", { replace: true });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setCommercialError(getApiErrorMessage(errorData, "Não foi possível remover a assinatura do pacote."));
        return;
      }
      await fetchCommercialData();
    } catch {
      setCommercialError("Erro de conexão ao remover assinatura do pacote.");
    } finally {
      setSavingClientPackageSubscriptionId(null);
      setPendingDeleteClientPackageSubscriptionId(null);
    }
  };

  useEffect(() => {
    if (selectedTab !== "pessoas") return;
    void fetchAdminUsers();
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab !== "agenda") return;
    void fetchScheduleConfig();
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab !== "comercial") return;
    void fetchCommercialData();
  }, [selectedTab]);

  useEffect(() => {
    void syncBarberOptions();
  }, []);

  useEffect(() => {
    const currentBarbers =
      barberOptions.length > 0
        ? barberOptions
        : Object.entries(BARBER_LABELS).map(([key, label]) => ({ key, label }));
    if (currentBarbers.length === 0) return;
    const currentExists = currentBarbers.some((barber) => barber.key === createForm.barber);
    if (currentExists) return;
    setCreateForm((current) => ({
      ...current,
      barber: currentBarbers[0].key,
    }));
  }, [barberOptions, createForm.barber]);

  useEffect(() => {
    const fetchAppointments = async () => {
      const headers = getAuthHeaders();
      if (!headers) {
        navigate("/", { replace: true });
        return;
      }

      setIsLoadingAppointments(true);
      setAppointmentError(null);

      try {
        const response = await authFetch(`${API_URL}/api/appointments/`, {
          headers,
        });
        if (!response) {
          navigate("/", { replace: true });
          return;
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            navigate("/", { replace: true });
            return;
          }
          const errorData = await response.json();
          setAppointmentError(errorData.detail || "Erro ao carregar agendamentos.");
          return;
        }

        const data = await response.json();
        const normalized =
          Array.isArray(data)
            ? data
            : Array.isArray((data as { results?: unknown[] })?.results)
              ? (data as { results: Appointment[] }).results
              : [];
        setAppointments(normalized as Appointment[]);
      } catch {
        setAppointmentError("Erro de conexão com o servidor. Verifique o backend e tente novamente.");
      } finally {
        setIsLoadingAppointments(false);
      }
    };

    fetchAppointments();
  }, [navigate, getAuthHeaders, authFetch]);

  const months = (() => {
    const appointmentMonths = Array.from(
      new Set(
        appointments
          .map((item) => String(item.date || "").slice(0, 7))
          .filter((value) => /^\d{4}-\d{2}$/.test(value)),
      ),
    ).sort();
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!appointmentMonths.includes(currentMonth)) {
      appointmentMonths.push(currentMonth);
      appointmentMonths.sort();
    }
    return appointmentMonths.map((value) => {
      const labelDate = new Date(`${value}-01T00:00:00`);
      const label = labelDate.toLocaleString("pt-BR", { month: "long", year: "numeric" });
      return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  })();

  const todayKey = todayLocalISODate();
  const resolveAdminStatus = (appointment: Appointment): AppointmentStatus => {
    return resolveOperationalStatus(appointment.status, appointment.date, appointment.time);
  };

  const appointmentsToday = appointments.filter((appointment) => appointment.date === todayKey);
  const now = new Date();
  const scheduledAppointments = appointments
    .filter((appointment) => {
      if (appointment.status === "cancelado" || appointment.status === "concluido") {
        return false;
      }
      // Evita duplicidade com o bloco "Hoje":
      // próximos atendimentos só incluem datas após hoje.
      return appointment.date > todayKey;
    })
    .sort((a, b) => {
      const aDateTime = `${a.date}T${a.time}`;
      const bDateTime = `${b.date}T${b.time}`;
      return aDateTime.localeCompare(bDateTime);
    });
  const appointmentsTodayDisplay = appointmentsToday.map((appointment) => ({
    ...appointment,
    uiStatus: resolveAdminStatus(appointment),
  }));
  const scheduledAppointmentsDisplay = scheduledAppointments.map((appointment) => ({
    ...appointment,
    uiStatus: resolveAdminStatus(appointment),
  }));
  const appointmentsTodayIdsKey = useMemo(() => appointmentsToday.map((a) => a.id).join(","), [appointmentsToday]);
  const todayAppointmentsPagination = usePagination({
    totalCount: appointmentsTodayDisplay.length,
    resetDeps: appointmentsTodayIdsKey,
  });
  const pagedAppointmentsTodayDisplay = useMemo(
    () =>
      appointmentsTodayDisplay.slice(
        todayAppointmentsPagination.sliceRange.start,
        todayAppointmentsPagination.sliceRange.end,
      ),
    [appointmentsTodayDisplay, todayAppointmentsPagination.sliceRange],
  );
  const adminAgendaAppointments = [...appointmentsTodayDisplay, ...scheduledAppointmentsDisplay]
    .sort((a, b) => {
      const aDateTime = `${a.date}T${a.time}`;
      const bDateTime = `${b.date}T${b.time}`;
      return aDateTime.localeCompare(bDateTime);
    })
    .map((appointment) => ({
      ...appointment,
      uiStatus: resolveAdminStatus(appointment),
    }));
  const allAppointmentsDisplay = [...appointments]
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
    .map((appointment) => ({
      ...appointment,
      uiStatus: resolveAdminStatus(appointment),
    }));
  const allAppointmentsFiltered = allAppointmentsDisplay.filter((appointment) => {
    if (allAppointmentsStatusFilter !== "all" && appointment.uiStatus !== allAppointmentsStatusFilter) {
      return false;
    }
    if (allAppointmentsServiceFilter !== "all" && appointment.service !== allAppointmentsServiceFilter) {
      return false;
    }
    if (allAppointmentsBarberFilter !== "all" && appointment.barber !== allAppointmentsBarberFilter) {
      return false;
    }
    if (allAppointmentsStartDate && appointment.date < allAppointmentsStartDate) {
      return false;
    }
    if (allAppointmentsEndDate && appointment.date > allAppointmentsEndDate) {
      return false;
    }
    const query = allAppointmentsSearchQuery.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
      appointment.name,
      appointment.email,
      appointment.phone,
      SERVICE_LABELS[appointment.service] ?? appointment.service,
      getBarberLabel(appointment.barber),
      appointment.date,
      appointment.time,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
  const allAppointmentsBarberOptions = Array.from(
    new Set(allAppointmentsDisplay.map((item) => item.barber).filter(Boolean)),
  );
  const allAppointmentsResetKey = [
    allAppointmentsSearchQuery,
    allAppointmentsStatusFilter,
    allAppointmentsServiceFilter,
    allAppointmentsBarberFilter,
    allAppointmentsStartDate,
    allAppointmentsEndDate,
  ].join("|");
  const allAppointmentsListPagination = usePagination({
    totalCount: allAppointmentsFiltered.length,
    pageSize: 10,
    resetDeps: allAppointmentsResetKey,
  });
  const pagedAllAppointments = useMemo(
    () =>
      allAppointmentsFiltered.slice(
        allAppointmentsListPagination.sliceRange.start,
        allAppointmentsListPagination.sliceRange.end,
      ),
    [allAppointmentsFiltered, allAppointmentsListPagination.sliceRange],
  );

  const exportAllAppointmentsPdf = () => {
    const ctx = beginBrandedPdf();
    const { doc } = ctx;
    const list = allAppointmentsFiltered;
    const statusFilterLabel =
      allAppointmentsStatusFilter === "all"
        ? "Todos os status"
        : getStatusMeta(allAppointmentsStatusFilter).label;
    const serviceFilterLabel =
      allAppointmentsServiceFilter === "all"
        ? "Todos os serviços"
        : SERVICE_LABELS[allAppointmentsServiceFilter] ?? allAppointmentsServiceFilter;
    const barberFilterLabel =
      allAppointmentsBarberFilter === "all"
        ? "Todos os barbeiros"
        : getBarberLabel(allAppointmentsBarberFilter);

    let y = writeReportTitle(ctx, "Todos os agendamentos — exportação (aba Agenda)");
    y = writeMetaLines(
      ctx,
      [
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        `Sessão: Dashboard administrativo • Lista completa com os mesmos filtros da tabela abaixo.`,
        `Registros no PDF: ${list.length} (total no sistema: ${appointments.length}).`,
        `Busca: ${allAppointmentsSearchQuery.trim() || "(nenhuma)"}`,
        `Status: ${statusFilterLabel} • Serviço: ${serviceFilterLabel} • Barbeiro: ${barberFilterLabel}`,
        `Intervalo de datas: ${allAppointmentsStartDate || "(início livre)"} a ${allAppointmentsEndDate || "(fim livre)"}`,
      ],
      y,
    );

    const done = list.filter((a) => a.uiStatus === "concluido").length;
    const canceled = list.filter((a) => a.uiStatus === "cancelado").length;
    const pending = list.filter((a) => a.uiStatus === "pendente").length;

    y = drawSummaryCards(ctx, y, [
      { label: "Total (filtrado)", value: String(list.length) },
      { label: "Concluídos (exib.)", value: String(done) },
      { label: "Cancelados (exib.)", value: String(canceled) },
      { label: "Pendentes (exib.)", value: String(pending) },
    ]);

    const head = [["ID", "Cliente", "Email", "Telefone", "Serviço", "Barbeiro", "Data", "Hora", "Status"]];
    const body =
      list.length > 0
        ? list.map((item) => [
            String(item.id),
            item.name,
            item.email,
            item.phone,
            SERVICE_LABELS[item.service] ?? item.service,
            getBarberLabel(item.barber),
            formatISODatePtBR(item.date),
            item.time,
            getStatusMeta(item.uiStatus).label,
          ])
        : [["-", "-", "Nenhum agendamento com os filtros atuais.", "-", "-", "-", "-", "-"]];

    drawDataTable(doc, y, head, body);
    applyPdfFooters(ctx, "Barbearia Demo • Agenda — todos os agendamentos");
    savePdf(doc, `agendamentos-admin-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  const paymentStatusOptions = Array.from(
    new Set(paymentTransactions.map((tx) => tx.status).filter(Boolean)),
  );
  const paymentTransactionsFiltered = paymentTransactions.filter((tx) => {
    if (paymentStatusFilter !== "all" && tx.status !== paymentStatusFilter) {
      return false;
    }
    const txDateIso = tx.created_at.slice(0, 10);
    if (paymentStartDate && txDateIso < paymentStartDate) {
      return false;
    }
    if (paymentEndDate && txDateIso > paymentEndDate) {
      return false;
    }
    const query = paymentSearchQuery.trim().toLowerCase();
    if (!query) return true;
    const haystack = [
      tx.appointment_summary?.name ?? "",
      tx.appointment_summary?.service ?? "",
      tx.appointment_summary?.barber_display ?? "",
      tx.appointment_summary?.barber ?? "",
      getPaymentStatusLabel(tx.status, tx.status_display),
      getPaymentProviderLabel(tx.provider_display),
      getPaymentFormaLabel(tx),
      tx.amount,
      String(getPaymentTransactionServiceListAmount(tx)),
      typeof tx.raw_payload === "object" && tx.raw_payload !== null
        ? JSON.stringify(tx.raw_payload)
        : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
  const paymentListResetKey = [
    paymentSearchQuery,
    paymentStatusFilter,
    paymentStartDate,
    paymentEndDate,
  ].join("|");
  const paymentTransactionsListPagination = usePagination({
    totalCount: paymentTransactionsFiltered.length,
    pageSize: 10,
    resetDeps: paymentListResetKey,
  });
  const pagedPaymentTransactions = useMemo(
    () =>
      paymentTransactionsFiltered.slice(
        paymentTransactionsListPagination.sliceRange.start,
        paymentTransactionsListPagination.sliceRange.end,
      ),
    [paymentTransactionsFiltered, paymentTransactionsListPagination.sliceRange],
  );
  const exportPaymentsPdf = () => {
    const ctx = beginBrandedPdf();
    const { doc } = ctx;
    const list = paymentTransactionsFiltered;
    const approvedList = list.filter((tx) => tx.status === "approved");
    const approvedSum = approvedList.reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
    const statusFilterLabel =
      paymentStatusFilter === "all" ? "Todos os status" : getPaymentStatusLabel(paymentStatusFilter, "");

    let y = writeReportTitle(ctx, "Transações de pagamento — exportação (aba Comercial)");
    y = writeMetaLines(
      ctx,
      [
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        `Sessão: Dashboard administrativo • Mesmos filtros da tabela de transações (busca, status, datas).`,
        `Linhas no PDF: ${list.length} (total carregado: ${paymentTransactions.length}).`,
        `Busca: ${paymentSearchQuery.trim() || "(nenhuma)"}`,
        `Status (pagamento): ${statusFilterLabel}`,
        `Datas (criação): ${paymentStartDate || "(início livre)"} a ${paymentEndDate || "(fim livre)"}`,
        "Colunas equivalentes à grade: data, cliente, serviço, barbeiro, valor de tabela, forma, status e provedor.",
      ],
      y,
    );

    const approvalPct = list.length ? Math.round((approvedList.length / list.length) * 100) : 0;

    y = drawSummaryCards(ctx, y, [
      { label: "Transações (filtradas)", value: String(list.length) },
      { label: "Aprovadas (filtradas)", value: String(approvedList.length) },
      { label: "Valor aprovado (soma)", value: `R$ ${approvedSum.toFixed(2)}` },
      { label: "Taxa de aprovação", value: `${approvalPct}%` },
    ]);

    const head = [["Data", "Cliente", "Serviço", "Barbeiro", "Valor (tabela)", "Forma", "Status", "Provedor"]];
    const body =
      list.length > 0
        ? list.map((tx) => [
            new Date(tx.created_at).toLocaleString("pt-BR"),
            tx.appointment_summary?.name ?? "-",
            SERVICE_LABELS[tx.appointment_summary?.service ?? ""] ?? (tx.appointment_summary?.service ?? "-"),
            getPaymentTransactionBarberLabel(tx),
            `R$ ${getPaymentTransactionServiceListAmount(tx).toFixed(2)}`,
            getPaymentFormaLabel(tx),
            getPaymentStatusLabel(tx.status, tx.status_display),
            getPaymentProviderLabel(tx.provider_display),
          ])
        : [["-", "Nenhuma transação com os filtros atuais.", "-", "-", "-", "-", "-", "-"]];

    drawDataTable(doc, y, head, body);
    applyPdfFooters(ctx, "Barbearia Demo • Comercial — transações");
    savePdf(doc, `transacoes-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  const notificationStatusOptions = Array.from(
    new Set(notificationEvents.map((event) => event.status).filter(Boolean)),
  );
  const notificationEventsFiltered = notificationEvents.filter((event) => {
    if (notificationStatusFilter !== "all" && event.status !== notificationStatusFilter) {
      return false;
    }
    return true;
  });
  const notificationListPagination = usePagination({
    totalCount: notificationEventsFiltered.length,
    pageSize: 10,
    resetDeps: notificationStatusFilter,
  });
  const pagedNotificationEvents = useMemo(
    () =>
      notificationEventsFiltered.slice(
        notificationListPagination.sliceRange.start,
        notificationListPagination.sliceRange.end,
      ),
    [notificationEventsFiltered, notificationListPagination.sliceRange],
  );
  const approvedTransactions = paymentTransactions.filter((tx) => tx.status === "approved");
  const approvedRevenue = approvedTransactions.reduce((acc, tx) => acc + Number(tx.amount || 0), 0);
  const approvalRate = paymentTransactions.length
    ? Math.round((approvedTransactions.length / paymentTransactions.length) * 100)
    : 0;
  const failedNotifications = notificationEvents.filter((event) => event.status === "failed").length;
  const activePackageCustomers = clientPackageSubscriptions.filter((item) => item.status === "active").length;
  const pendingPackageCustomers = clientPackageSubscriptions.filter((item) => item.status === "pending").length;
  const monthlyAppointments = appointments.filter((appointment) => appointment.date.slice(0, 7) === selectedMonth);

  const monthlyRevenue = monthlyAppointments.reduce(
    (total, appointment) => total + (SERVICE_PRICES[appointment.service] ?? 0),
    0,
  );
  const previousMonth = (() => {
    const d = new Date(`${selectedMonth}-01T00:00:00`);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const previousMonthAppointments = appointments.filter((appointment) => appointment.date.slice(0, 7) === previousMonth);
  const previousMonthRevenue = previousMonthAppointments.reduce(
    (total, appointment) => total + (SERVICE_PRICES[appointment.service] ?? 0),
    0,
  );

  const confirmedToday = appointmentsToday.filter((appointment) => appointment.status === "confirmado").length;

  const statusCounts = appointmentsToday.reduce(
    (counts, appointment) => {
      counts[appointment.status] = (counts[appointment.status] ?? 0) + 1;
      return counts;
    },
    {} as Record<AppointmentStatus, number>,
  );
  const agendaStatusCounts = adminAgendaAppointments.reduce(
    (counts, appointment) => {
      counts[appointment.uiStatus] = (counts[appointment.uiStatus] ?? 0) + 1;
      return counts;
    },
    {} as Record<AppointmentStatus, number>,
  );
  const finalizadosHoje = appointmentsToday.filter((a) => a.status === "concluido").length;
  const taxaConversao = appointmentsToday.length
    ? Math.round((finalizadosHoje / appointmentsToday.length) * 100)
    : 0;
  const revenueTrend = previousMonthRevenue > 0
    ? `${Math.round(((monthlyRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)}% vs mês anterior`
    : "Sem base anterior";
  const serviceTrend = previousMonthAppointments.length > 0
    ? `${Math.round(((monthlyAppointments.length - previousMonthAppointments.length) / previousMonthAppointments.length) * 100)}% vs mês anterior`
    : "Sem base anterior";

  const stats = [
    {
      label: "Agendamentos Hoje",
      value: `${appointmentsToday.length}`,
      icon: Calendar,
      trend: confirmedToday ? `+${Math.round((confirmedToday / Math.max(appointmentsToday.length, 1)) * 100)}% confirmados` : "0%",
      color: "text-accent",
      subtitle: `${statusCounts["pendente"] ?? 0} pendentes`,
    },
    {
      label: "Receita do Mês",
      value: `R$ ${monthlyRevenue.toLocaleString("pt-BR")}`,
      icon: DollarSign,
      trend: revenueTrend,
      color: "text-accent",
      subtitle: `Total de ${monthlyAppointments.length} atendimentos`,
    },
    {
      label: "Serviços Realizados",
      value: `${monthlyAppointments.length}`,
      icon: Scissors,
      trend: serviceTrend,
      color: "text-accent",
      subtitle: "Este mês",
    },
    {
      label: "Taxa de Ocupação",
      value: `${appointmentsToday.length ? Math.round((confirmedToday / appointmentsToday.length) * 100) : 0}%`,
      icon: TrendingUp,
      trend: `${taxaConversao}% concluídos`,
      color: "text-accent",
      subtitle: "Horários preenchidos",
    },
  ];

  const serviceReportsByMonth = Object.entries(SERVICE_LABELS).reduce(
    (acc, [serviceKey, serviceLabel]) => ({
      ...acc,
      [serviceKey]: {
        nome: serviceLabel,
        quantidade: 0,
        valor: 0,
      },
    }),
    {} as Record<string, { nome: string; quantidade: number; valor: number }>,
  );

  const currentServicosPorTipo = Object.values(
    monthlyAppointments.reduce((acc, appointment) => {
      const serviceKey = appointment.service;
      const label = SERVICE_LABELS[serviceKey] ?? serviceKey;
      const price = SERVICE_PRICES[serviceKey] ?? 0;

      if (!acc[serviceKey]) {
        acc[serviceKey] = { nome: label, quantidade: 0, valor: 0 };
      }

      acc[serviceKey].quantidade += 1;
      acc[serviceKey].valor += price;
      return acc;
    }, { ...serviceReportsByMonth } as Record<string, { nome: string; quantidade: number; valor: number }>),
  );

  const servicosPorTipoPagination = usePagination({
    totalCount: currentServicosPorTipo.length,
    resetDeps: selectedMonth,
  });
  const pagedServicosPorTipo = useMemo(
    () =>
      currentServicosPorTipo.slice(
        servicosPorTipoPagination.sliceRange.start,
        servicosPorTipoPagination.sliceRange.end,
      ),
    [currentServicosPorTipo, servicosPorTipoPagination.sliceRange],
  );

  const barberLabelMap = useMemo(() => {
    const map: Record<string, string> = { ...BARBER_LABELS };
    for (const option of barberOptions) {
      map[option.key] = option.label;
    }
    for (const appointment of appointments) {
      if (!map[appointment.barber]) {
        map[appointment.barber] = appointment.barber;
      }
    }
    return map;
  }, [barberOptions, appointments]);

  const getBarberLabel = (barberKey: string) => barberLabelMap[barberKey] ?? barberKey;
  const availableBarbers =
    barberOptions.length > 0
      ? barberOptions
      : Object.entries(BARBER_LABELS).map(([key, label]) => ({ key, label }));
  const filteredBlockedSlots = useMemo(() => {
    return blockedSlots.filter((slot) => {
      if (
        blockedSlotFilter.barber_calendar_key !== "all"
        && slot.barber_calendar_key !== blockedSlotFilter.barber_calendar_key
      ) {
        return false;
      }
      if (blockedSlotFilter.date && slot.date !== blockedSlotFilter.date) {
        return false;
      }
      return true;
    });
  }, [blockedSlots, blockedSlotFilter]);
  const sortedBlockedSlots = useMemo(() => {
    const list = [...filteredBlockedSlots];
    list.sort((a, b) => {
      const aValue = (a[blockedSlotSort.field] || "").toString();
      const bValue = (b[blockedSlotSort.field] || "").toString();
      const comparison = aValue.localeCompare(bValue);
      return blockedSlotSort.direction === "asc" ? comparison : -comparison;
    });
    return list;
  }, [filteredBlockedSlots, blockedSlotSort]);
  const blockedSlotsListPagination = usePagination({
    totalCount: sortedBlockedSlots.length,
    pageSize: blockedSlotsPageSize,
    resetDeps: [
      blockedSlotFilter.barber_calendar_key,
      blockedSlotFilter.date,
      blockedSlotSort.field,
      blockedSlotSort.direction,
      blockedSlotsPageSize,
    ].join("|"),
  });
  const pagedBlockedSlots = useMemo(
    () =>
      sortedBlockedSlots.slice(
        blockedSlotsListPagination.sliceRange.start,
        blockedSlotsListPagination.sliceRange.end,
      ),
    [sortedBlockedSlots, blockedSlotsListPagination.sliceRange],
  );
  const blockStartMin = timeToMinutes(blockForm.start_time);
  const blockEndMin = timeToMinutes(blockForm.end_time);
  const timelineRange = TIMELINE_END_MIN - TIMELINE_START_MIN;
  const timelineLeft = ((blockStartMin - TIMELINE_START_MIN) / timelineRange) * 100;
  const timelineWidth = ((blockEndMin - blockStartMin) / timelineRange) * 100;

  const barberSeed = Object.entries(barberLabelMap).reduce(
    (acc, [key, label]) => ({
      ...acc,
      [key]: { nome: label, cortes: 0, receita: 0 },
    }),
    {} as Record<string, { nome: string; cortes: number; receita: number }>,
  );

  const barbeiroDesempenho = Object.values(
    monthlyAppointments.reduce((acc, appointment) => {
      const key = appointment.barber;
      if (!acc[key]) {
        acc[key] = { nome: getBarberLabel(key), cortes: 0, receita: 0 };
      }
      acc[key].cortes += 1;
      acc[key].receita += SERVICE_PRICES[appointment.service] ?? 0;
      return acc;
    }, { ...barberSeed } as Record<string, { nome: string; cortes: number; receita: number }>),
  );
  const barberPerformance = [...barbeiroDesempenho].sort(
    (a, b) => b.receita - a.receita || b.cortes - a.cortes,
  );
  const totalBarberRevenue = barberPerformance.reduce((sum, barber) => sum + barber.receita, 0);
  const totalBarberCuts = barberPerformance.reduce((sum, barber) => sum + barber.cortes, 0);
  const topBarber = barberPerformance[0] ?? null;

  const barberPerformancePagination = usePagination({
    totalCount: barberPerformance.length,
    resetDeps: `${selectedMonth}|${monthlyAppointments.length}`,
  });
  const pagedBarberPerformance = useMemo(
    () =>
      barberPerformance.slice(
        barberPerformancePagination.sliceRange.start,
        barberPerformancePagination.sliceRange.end,
      ),
    [barberPerformance, barberPerformancePagination.sliceRange],
  );

  const usersIdsKey = useMemo(() => users.map((u) => u.id).join(","), [users]);
  const usersListPagination = usePagination({
    totalCount: users.length,
    resetDeps: usersIdsKey,
  });
  const pagedUsers = useMemo(
    () => users.slice(usersListPagination.sliceRange.start, usersListPagination.sliceRange.end),
    [users, usersListPagination.sliceRange],
  );

  const clientPackagesIdsKey = useMemo(() => clientPackages.map((p) => p.id).join(","), [clientPackages]);
  const clientPackagesListPagination = usePagination({
    totalCount: clientPackages.length,
    resetDeps: clientPackagesIdsKey,
  });
  const pagedClientPackages = useMemo(
    () =>
      clientPackages.slice(
        clientPackagesListPagination.sliceRange.start,
        clientPackagesListPagination.sliceRange.end,
      ),
    [clientPackages, clientPackagesListPagination.sliceRange],
  );

  const clientSubsIdsKey = useMemo(() => clientPackageSubscriptions.map((s) => s.id).join(","), [clientPackageSubscriptions]);
  const clientSubsListPagination = usePagination({
    totalCount: clientPackageSubscriptions.length,
    resetDeps: clientSubsIdsKey,
  });
  const pagedClientPackageSubscriptions = useMemo(
    () =>
      clientPackageSubscriptions.slice(
        clientSubsListPagination.sliceRange.start,
        clientSubsListPagination.sliceRange.end,
      ),
    [clientPackageSubscriptions, clientSubsListPagination.sliceRange],
  );

  const totalDia = appointmentsToday.reduce(
    (sum, appointment) => sum + (SERVICE_PRICES[appointment.service] ?? 0),
    0,
  );

  const reportFilteredAppointments = (() => {
    const query = reportSearchQuery.trim().toLowerCase();
    return monthlyAppointments.filter((appointment) => {
      if (reportStatusFilter !== "all" && appointment.status !== reportStatusFilter) {
        return false;
      }
      if (reportServiceFilter !== "all" && appointment.service !== reportServiceFilter) {
        return false;
      }
      if (!query) return true;

      const searchable = [
        appointment.name,
        appointment.email,
        SERVICE_LABELS[appointment.service] ?? appointment.service,
        getBarberLabel(appointment.barber),
        appointment.status,
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  })();
  const reportListResetKey = [selectedMonth, reportSearchQuery, reportStatusFilter, reportServiceFilter].join("|");
  const reportListPagination = usePagination({
    totalCount: reportFilteredAppointments.length,
    pageSize: 10,
    resetDeps: reportListResetKey,
  });
  const pagedReportAppointments = useMemo(
    () =>
      reportFilteredAppointments.slice(
        reportListPagination.sliceRange.start,
        reportListPagination.sliceRange.end,
      ),
    [reportFilteredAppointments, reportListPagination.sliceRange],
  );

  const reportRevenue = reportFilteredAppointments.reduce(
    (total, appointment) => total + (SERVICE_PRICES[appointment.service] ?? 0),
    0,
  );
  const reportAvgTicket = reportFilteredAppointments.length
    ? Math.round(reportRevenue / reportFilteredAppointments.length)
    : 0;
  const reportCancelCount = reportFilteredAppointments.filter((a) => a.status === "cancelado").length;
  const reportDoneCount = reportFilteredAppointments.filter((a) => a.status === "concluido").length;
  const reportCancelRate = reportFilteredAppointments.length
    ? Math.round((reportCancelCount / reportFilteredAppointments.length) * 100)
    : 0;
  const reportDoneRate = reportFilteredAppointments.length
    ? Math.round((reportDoneCount / reportFilteredAppointments.length) * 100)
    : 0;

  const reportStatusDistribution = [
    { status: "agendado", label: "Agendado", total: reportFilteredAppointments.filter((a) => a.status === "agendado").length },
    { status: "pendente", label: "Pendente", total: reportFilteredAppointments.filter((a) => a.status === "pendente").length },
    { status: "confirmado", label: "Confirmado", total: reportFilteredAppointments.filter((a) => a.status === "confirmado").length },
    { status: "em_atendimento", label: "Em atendimento", total: reportFilteredAppointments.filter((a) => a.status === "em_atendimento").length },
    { status: "concluido", label: "Concluído", total: reportFilteredAppointments.filter((a) => a.status === "concluido").length },
    { status: "cancelado", label: "Cancelado", total: reportFilteredAppointments.filter((a) => a.status === "cancelado").length },
  ];

  const handleStatusChange = async (id: number, newStatus: AppointmentStatus) => {
    const target = appointments.find((appointment) => appointment.id === id);
    if (newStatus === "agendado" && target && !isAtLeast24HoursAhead(target.date, target.time)) {
      setAppointmentError("Status 'Agendado' só pode ser definido para horários com no mínimo 24h de antecedência.");
      return;
    }

    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const apiStatus = toApiStatus(newStatus);
      const response = await fetch(`${API_URL}/api/appointments/${id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: apiStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setAppointmentError(getApiErrorMessage(errorData, "Não foi possível atualizar o status do agendamento."));
        return;
      }

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === id ? { ...appointment, status: apiStatus } : appointment,
        ),
      );
      setAppointmentError(null);
      setAppointmentSuccess("Status atualizado com sucesso.");
    } catch {
      setAppointmentError("Erro de conexão ao atualizar o status do agendamento.");
    }
  };

  const availableTimes = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
  ];

  const handleOpenCreateModal = () => setShowCreateModal(true);
  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setIsCreateDatePickerOpen(false);
    setCreateForm({
      name: "",
      email: "",
      phone: "",
      service: "corte",
      barber: availableBarbers[0]?.key ?? DEFAULT_BARBER_KEY,
      date: new Date().toISOString().slice(0, 10),
      time: "09:00",
      status: "pendente",
    });
  };

  const handleCreateAppointment = async () => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }

    setIsSavingAppointment(true);
    setAppointmentError(null);

    try {
      const response = await fetch(`${API_URL}/api/appointments/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...createForm,
          status: toApiStatus(createForm.status),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setAppointmentError(getApiErrorMessage(errorData, "Falha ao criar agendamento."));
        return;
      }

      const created = await response.json();
      setAppointments((current) => [created, ...current]);
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        email: "",
        phone: "",
        service: "corte",
        barber: availableBarbers[0]?.key ?? DEFAULT_BARBER_KEY,
        date: new Date().toISOString().slice(0, 10),
        time: "09:00",
        status: "pendente",
      });
      setSelectedTab("hoje");
    } catch {
      setAppointmentError("Erro de conexão com o servidor. Verifique o backend e tente novamente.");
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const handleExport = (mode: ExportMode) => {
    setShowExportDialog(false);
    const filtered =
      reportFilteredAppointments.length > 0
        ? reportFilteredAppointments
        : monthlyAppointments.length > 0
          ? monthlyAppointments
          : appointments;

    const ctx = beginBrandedPdf();
    const { doc } = ctx;

    const title =
      mode === "executivo"
        ? "Relatório executivo de agendamentos"
        : "Relatório detalhado de agendamentos";
    let y = writeReportTitle(ctx, title);
    y = writeMetaLines(
      ctx,
      [
        `Sessão: Dashboard administrativo • aba Relatórios (mês e filtros da grade de relatório).`,
        `Período (mês selecionado): ${selectedMonth}`,
        `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        `Registros incluídos neste PDF: ${filtered.length} (receita estimada na grade: R$ ${reportRevenue.toLocaleString("pt-BR")}).`,
      ],
      y,
    );

    const summaryCards = [
      { label: "Total de registros", value: `${filtered.length}` },
      { label: "Receita estimada", value: `R$ ${reportRevenue.toLocaleString("pt-BR")}` },
      { label: "Ticket médio", value: `R$ ${reportAvgTicket.toLocaleString("pt-BR")}` },
      { label: "Taxa de conclusão", value: `${reportDoneRate}%` },
    ];
    y = drawSummaryCards(ctx, y, summaryCards);

    const detailedRows =
      filtered.length > 0
        ? filtered.map((appointment) => [
            formatISODatePtBR(appointment.date),
            appointment.time,
            appointment.name,
            SERVICE_LABELS[appointment.service] ?? appointment.service,
            getBarberLabel(appointment.barber),
            getStatusMeta(appointment.status).label,
            `R$ ${(SERVICE_PRICES[appointment.service] ?? 0).toLocaleString("pt-BR")}`,
          ])
        : [["-", "-", "Nenhum agendamento encontrado com os filtros aplicados.", "-", "-", "-", "-"]];

    const executiveRows =
      filtered.length > 0
        ? filtered.slice(0, 12).map((appointment) => [
            formatISODatePtBR(appointment.date),
            appointment.name,
            SERVICE_LABELS[appointment.service] ?? appointment.service,
            getStatusMeta(appointment.status).label,
            `R$ ${(SERVICE_PRICES[appointment.service] ?? 0).toLocaleString("pt-BR")}`,
          ])
        : [["-", "Nenhum agendamento encontrado com os filtros aplicados.", "-", "-", "-"]];

    drawDataTable(
      doc,
      y,
      mode === "executivo"
        ? [["Data", "Cliente", "Serviço", "Status", "Valor"]]
        : [["Data", "Horário", "Cliente", "Serviço", "Barbeiro", "Status", "Valor"]],
      mode === "executivo" ? executiveRows : detailedRows,
    );

    applyPdfFooters(ctx, "Barbearia Demo • Relatórios — exportação administrativa");
    savePdf(doc, `relatorio-${mode}-${selectedMonth}.pdf`);
  };

  const handleEdit = (appointment: Appointment) => {
    setEditAppointmentError(null);
    setEditingAppointment(appointment);
    setEditForm({
      name: appointment.name,
      email: appointment.email,
      phone: appointment.phone,
      service: appointment.service,
      barber: appointment.barber,
      date: appointment.date,
      time: appointment.time,
      status: appointment.status,
    });
  };

  const handleDelete = (id: number) => {
    setDeleteConfirmId(id);
  };

  const handleSaveEdit = async () => {
    if (!editingAppointment || !editForm || isSavingAppointment) return;
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }

    setIsSavingAppointment(true);
    setEditAppointmentError(null);
    try {
      const response = await fetch(`${API_URL}/api/appointments/${editingAppointment.id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone,
          service: editForm.service,
          barber: editForm.barber,
          date: editForm.date,
          time: editForm.time,
          status: toApiStatus(editForm.status),
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        const errorData = await response.json().catch(() => null);
        const message = getApiErrorMessage(errorData, "Não foi possível salvar as alterações do agendamento.");
        setEditAppointmentError(message);
        setAppointmentError(message);
        return;
      }

      const updated = await response.json();
      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === updated.id ? { ...appointment, ...updated } : appointment,
        ),
      );
      setAppointmentSuccess("Agendamento atualizado com sucesso.");
      setEditingAppointment(null);
      setEditForm(null);
    } catch {
      const message = "Erro de conexão ao salvar as alterações do agendamento.";
      setEditAppointmentError(message);
      setAppointmentError(message);
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId === null) return;
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/appointments/${deleteConfirmId}/`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        throw new Error("Falha ao excluir o agendamento");
      }

      setAppointments((current) => current.filter((appointment) => appointment.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch {
      setAppointmentError("Não foi possível excluir o agendamento.");
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const handleCancelEdit = () => {
    setEditingAppointment(null);
    setIsEditDatePickerOpen(false);
    setEditAppointmentError(null);
    setEditForm(null);
  };

  const handleSelectTab = (tab: string) => {
    handleCancelEdit();
    setSelectedTab(tab);
  };

  const applyUserDetailFromServer = (u: AdminPortalUser) => {
    setSelectedUser(u);
    setUserRoleDraft(u.role);
    setBarberSpecialtiesDraft(String(u.barber_specialties ?? "").trim());
    setUserProfileDraft({
      username: String(u.username ?? "").trim(),
      email: String(u.email ?? "").trim(),
      first_name: String(u.first_name ?? "").trim(),
      last_name: String(u.last_name ?? "").trim(),
      phone: String(u.phone ?? "").trim(),
      is_active: u.is_active !== false,
    });
  };

  const handleOpenUserDetail = async (u: AdminPortalUser) => {
    const requestId = ++userDetailRequestRef.current;
    setUsersError(null);
    setResetPasswordDraft("");
    setIsLoadingUserDetail(true);
    applyUserDetailFromServer(u);

    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      setIsLoadingUserDetail(false);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/auth/users/${u.id}/`, { headers });
      if (userDetailRequestRef.current !== requestId) return;
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setUsersError(getApiErrorMessage(errorData, "Não foi possível carregar o perfil completo. Exibindo dados da lista."));
        return;
      }
      const full = (await response.json()) as AdminPortalUser;
      if (userDetailRequestRef.current !== requestId) return;
      applyUserDetailFromServer(full);
    } catch {
      if (userDetailRequestRef.current === requestId) {
        setUsersError("Erro de conexão ao carregar o perfil. Verifique a rede ou tente de novo.");
      }
    } finally {
      if (userDetailRequestRef.current === requestId) {
        setIsLoadingUserDetail(false);
      }
    }
  };

  const handleCloseUserDetail = () => {
    if (isSavingUserRole || isResettingPassword) return;
    userDetailRequestRef.current += 1;
    setIsLoadingUserDetail(false);
    setSelectedUser(null);
    setShowRoleConfirmDialog(false);
  };

  const hasAnyUserChanges = () => {
    if (!selectedUser) return false;
    const p = userProfileDraft;
    const nextSpec = barberSpecialtiesDraft.trim();
    const curSpec = (selectedUser.barber_specialties || "").trim();
    return (
      p.username.trim() !== (selectedUser.username || "").trim() ||
      p.email.trim() !== (selectedUser.email || "").trim() ||
      (p.first_name || "").trim() !== (selectedUser.first_name || "").trim() ||
      (p.last_name || "").trim() !== (selectedUser.last_name || "").trim() ||
      (p.phone || "").trim() !== (selectedUser.phone || "").trim() ||
      p.is_active !== (selectedUser.is_active !== false) ||
      userRoleDraft !== selectedUser.role ||
      (userRoleDraft === "barbeiro" && nextSpec !== curSpec)
    );
  };

  const handleRequestSaveUser = () => {
    if (!selectedUser || isLoadingUserDetail) return;
    if (!hasAnyUserChanges()) {
      handleCloseUserDetail();
      return;
    }
    if (!userProfileDraft.username.trim()) {
      setUsersError("O login (usuário) não pode ficar em branco.");
      return;
    }
    if (!userProfileDraft.email.trim()) {
      setUsersError("O e-mail é obrigatório.");
      return;
    }
    if (userRoleDraft !== selectedUser.role) {
      setShowRoleConfirmDialog(true);
    } else {
      void handleSaveUser();
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUser || isLoadingUserDetail) return;
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsSavingUserRole(true);
    setUsersError(null);
    try {
      const p = userProfileDraft;
      const response = await fetch(`${API_URL}/api/auth/users/${selectedUser.id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          username: p.username.trim(),
          email: p.email.trim(),
          first_name: (p.first_name || "").trim(),
          last_name: (p.last_name || "").trim(),
          phone: (p.phone || "").trim(),
          is_active: p.is_active,
          role: userRoleDraft,
          barber_specialties: userRoleDraft === "barbeiro" ? barberSpecialtiesDraft.trim() : "",
        }),
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setUsersError(getApiErrorMessage(errorData, "Não foi possível salvar as alterações."));
        return;
      }
      const updatedUser = await response.json();
      setUsers((current) =>
        current.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u)),
      );
      setSelectedUser((current) => (current ? { ...current, ...updatedUser } : current));
      setUserProfileDraft({
        username: updatedUser.username || "",
        email: (updatedUser.email || "").trim(),
        first_name: updatedUser.first_name || "",
        last_name: updatedUser.last_name || "",
        phone: updatedUser.phone || "",
        is_active: updatedUser.is_active !== false,
      });
      setUserRoleDraft(updatedUser.role);
      setBarberSpecialtiesDraft((updatedUser.barber_specialties || "").trim());
      setShowRoleConfirmDialog(false);
      const shouldRefreshSession =
        typeof updatedUser.id === "number" &&
        (user?.id === updatedUser.id ||
          (!user?.id && (selectedUser.username || "").trim() === (user?.username || "").trim()));
      if (shouldRefreshSession) {
        await refreshProfile();
      }
      if (userRoleDraft === "barbeiro" || updatedUser.role === "barbeiro") {
        void syncBarberOptions().catch(() => {
          /* lista de barbeiros é secundária; não bloquear o fluxo */
        });
      }
      setSuccessDialogMessage(
        "Alterações salvas no servidor. Se esta pessoa fizer login de novo, já verá os dados atualizados.",
      );
    } catch {
      setUsersError("Erro de conexão ao salvar as alterações.");
    } finally {
      setIsSavingUserRole(false);
    }
  };

  const handleResetUserPassword = async () => {
    if (!selectedUser) return;
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    if (resetPasswordDraft.trim().length < 8) {
      setUsersError("A senha temporária deve ter no mínimo 8 caracteres.");
      return;
    }
    setIsResettingPassword(true);
    setUsersError(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/users/${selectedUser.id}/reset-password/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ password: resetPasswordDraft.trim() }),
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setUsersError(getApiErrorMessage(errorData, "Não foi possível redefinir a senha."));
        return;
      }
      setResetPasswordDraft("");
      setSuccessDialogMessage("Senha redefinida com sucesso.");
    } catch {
      setUsersError("Erro de conexão ao redefinir a senha.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleBusinessHourFieldChange = (
    id: number,
    field: "open_time" | "close_time" | "is_open",
    value: string | boolean,
  ) => {
    setBusinessHours((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const handleTimelineDrag = (clientX: number) => {
    if (!draggingHandle || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const absolute = TIMELINE_START_MIN + ratio * (TIMELINE_END_MIN - TIMELINE_START_MIN);
    const snapped = snapMinutes(absolute);

    setBlockForm((current) => {
      const startMin = timeToMinutes(current.start_time);
      const endMin = timeToMinutes(current.end_time);

      if (draggingHandle === "start") {
        const nextStart = Math.min(snapped, endMin - TIMELINE_STEP_MIN);
        return { ...current, start_time: minutesToTime(nextStart) };
      }
      const nextEnd = Math.max(snapped, startMin + TIMELINE_STEP_MIN);
      return { ...current, end_time: minutesToTime(nextEnd) };
    });
  };

  useEffect(() => {
    if (!draggingHandle) return;

    const onMove = (event: MouseEvent) => {
      handleTimelineDrag(event.clientX);
    };
    const onUp = () => setDraggingHandle(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingHandle]);

  const handleSaveBusinessHour = async (row: BusinessHour) => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsSavingBusinessHourId(row.id);
    setScheduleConfigError(null);
    try {
      const response = await fetch(`${API_URL}/api/business-hours/${row.id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          open_time: row.open_time,
          close_time: row.close_time,
          is_open: row.is_open,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível salvar o horário de funcionamento."));
        return;
      }
      const updated = (await response.json()) as BusinessHour;
      setBusinessHours((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccessDialogMessage("Horário de funcionamento atualizado com sucesso.");
    } catch {
      setScheduleConfigError("Erro de conexão ao salvar horário de funcionamento.");
    } finally {
      setIsSavingBusinessHourId(null);
    }
  };

  const handleCreateBlockedSlot = async () => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsCreatingBlockedSlot(true);
    setScheduleConfigError(null);
    const createDraft = {
      barber_calendar_key: blockForm.barber_calendar_key.trim().toLowerCase(),
      date: blockForm.date,
      start_time: normalizeTimeInput(blockForm.start_time),
      end_time: normalizeTimeInput(blockForm.end_time),
    };
    if (!createDraft.date || !createDraft.start_time || !createDraft.end_time) {
      setScheduleConfigError("Preencha data e horários do bloqueio.");
      setIsCreatingBlockedSlot(false);
      return;
    }
    if (createDraft.start_time >= createDraft.end_time) {
      setScheduleConfigError("O horário final deve ser maior que o horário inicial.");
      setIsCreatingBlockedSlot(false);
      return;
    }
    if (hasBlockedSlotConflict(blockedSlots, createDraft)) {
      setScheduleConfigError("Já existe um bloqueio conflitante para o período selecionado.");
      setIsCreatingBlockedSlot(false);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/blocked-slots/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          barber_calendar_key: createDraft.barber_calendar_key,
          date: createDraft.date,
          start_time: createDraft.start_time,
          end_time: createDraft.end_time,
          reason: blockForm.reason.trim(),
        }),
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível criar o bloqueio."));
        return;
      }
      const created = (await response.json()) as BlockedSlot;
      setBlockedSlots((current) =>
        [created, ...current].sort(
          (a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`),
        ),
      );
      setBlockForm((current) => ({ ...current, reason: "", barber_calendar_key: "" }));
      setSuccessDialogMessage("Bloqueio de agenda criado com sucesso.");
    } catch {
      setScheduleConfigError("Erro de conexão ao criar bloqueio de agenda.");
    } finally {
      setIsCreatingBlockedSlot(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) {
      setScheduleConfigError("Informe um nome para salvar o template.");
      return;
    }
    const start_time = normalizeTimeInput(blockForm.start_time);
    const end_time = normalizeTimeInput(blockForm.end_time);
    if (!start_time || !end_time || start_time >= end_time) {
      setScheduleConfigError("Defina um intervalo válido para salvar o template.");
      return;
    }
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsSavingTemplate(true);
    setScheduleConfigError(null);
    try {
      const response = await fetch(`${API_URL}/api/blocked-templates/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          start_time,
          end_time,
          reason: blockForm.reason.trim(),
          is_active: true,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível salvar o template."));
        return;
      }
      const createdTemplate = (await response.json()) as BlockTemplate;
      setBlockTemplates((current) => [createdTemplate, ...current]);
      setNewTemplateName("");
      setSuccessDialogMessage("Template salvo com sucesso.");
    } catch {
      setScheduleConfigError("Erro de conexão ao salvar template.");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleApplyTemplate = (template: BlockTemplate) => {
    setBlockForm((current) => ({
      ...current,
      start_time: template.start_time,
      end_time: template.end_time,
      reason: template.reason,
    }));
  };

  const handleDeleteTemplate = async (templateId: number) => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setDeletingTemplateId(templateId);
    setScheduleConfigError(null);
    try {
      const response = await fetch(`${API_URL}/api/blocked-templates/${templateId}/`, {
        method: "DELETE",
        headers,
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível remover o template."));
        return;
      }
      setBlockTemplates((current) => current.filter((item) => item.id !== templateId));
    } catch {
      setScheduleConfigError("Erro de conexão ao remover template.");
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const handleDeleteBlockedSlot = async (id: number) => {
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setDeletingBlockedSlotId(id);
    setScheduleConfigError(null);
    try {
      const response = await fetch(`${API_URL}/api/blocked-slots/${id}/`, {
        method: "DELETE",
        headers,
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível remover o bloqueio."));
        return;
      }
      setBlockedSlots((current) => current.filter((item) => item.id !== id));
    } catch {
      setScheduleConfigError("Erro de conexão ao remover bloqueio.");
    } finally {
      setDeletingBlockedSlotId(null);
    }
  };

  const handleRequestDeleteBlockedSlot = (id: number) => {
    setPendingDeleteBlockedSlotId(id);
  };

  const handleConfirmDeleteBlockedSlot = async () => {
    if (pendingDeleteBlockedSlotId === null) return;
    await handleDeleteBlockedSlot(pendingDeleteBlockedSlotId);
    setPendingDeleteBlockedSlotId(null);
  };

  const handleStartEditBlockedSlot = (slot: BlockedSlot) => {
    setEditingBlockedSlotId(slot.id);
    setBlockedSlotDraft({
      barber_calendar_key: slot.barber_calendar_key,
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      reason: slot.reason || "",
    });
  };

  const handleCancelEditBlockedSlot = () => {
    setEditingBlockedSlotId(null);
    setBlockedSlotDraft({
      barber_calendar_key: "",
      date: "",
      start_time: "",
      end_time: "",
      reason: "",
    });
  };

  const handleSaveEditBlockedSlot = async () => {
    if (editingBlockedSlotId === null) return;
    const headers = getAuthHeaders();
    if (!headers) {
      navigate("/", { replace: true });
      return;
    }
    setIsSavingBlockedSlotEdit(true);
    setScheduleConfigError(null);
    const editDraft = {
      barber_calendar_key: blockedSlotDraft.barber_calendar_key.trim().toLowerCase(),
      date: blockedSlotDraft.date,
      start_time: normalizeTimeInput(blockedSlotDraft.start_time),
      end_time: normalizeTimeInput(blockedSlotDraft.end_time),
    };
    if (!editDraft.date || !editDraft.start_time || !editDraft.end_time) {
      setScheduleConfigError("Preencha data e horários do bloqueio.");
      setIsSavingBlockedSlotEdit(false);
      return;
    }
    if (editDraft.start_time >= editDraft.end_time) {
      setScheduleConfigError("O horário final deve ser maior que o horário inicial.");
      setIsSavingBlockedSlotEdit(false);
      return;
    }
    if (hasBlockedSlotConflict(blockedSlots, editDraft, editingBlockedSlotId)) {
      setScheduleConfigError("Já existe um bloqueio conflitante para o período selecionado.");
      setIsSavingBlockedSlotEdit(false);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/blocked-slots/${editingBlockedSlotId}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          barber_calendar_key: editDraft.barber_calendar_key,
          date: editDraft.date,
          start_time: editDraft.start_time,
          end_time: editDraft.end_time,
          reason: blockedSlotDraft.reason.trim(),
        }),
      });
      if (response.status === 401 || response.status === 403) {
        navigate("/", { replace: true });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setScheduleConfigError(getApiErrorMessage(errorData, "Não foi possível atualizar o bloqueio."));
        return;
      }
      const updated = (await response.json()) as BlockedSlot;
      setBlockedSlots((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`)),
      );
      handleCancelEditBlockedSlot();
      setSuccessDialogMessage("Bloqueio de agenda atualizado com sucesso.");
    } catch {
      setScheduleConfigError("Erro de conexão ao atualizar bloqueio.");
    } finally {
      setIsSavingBlockedSlotEdit(false);
    }
  };

  // Só fazer retornos condicionais depois de declarar todos os hooks.
  if (authLoading) {
    return (
      <div className="bg-background py-22 pb-14 md:py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 h-12 w-72 rounded-xl border border-border/60 bg-card/40 animate-pulse" />
          <div className="mb-8 h-12 w-full rounded-xl border border-border/60 bg-card/35 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`dashboard-loading-card-${index}`}
                className="h-36 rounded-xl border border-border/60 bg-card/35 animate-pulse"
              />
            ))}
          </div>
          <div className="h-[52vh] rounded-xl border border-border/60 bg-card/30 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center py-12 px-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-accent mx-auto mb-4" />
          <h2 className="text-2xl mb-4">Acesso Restrito</h2>
          <p className="text-muted-foreground mb-6">
            Esta área é exclusiva para administradores.
          </p>
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

  return (
    <div className="bg-background py-22 pb-14 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="premium-title text-4xl sm:text-5xl lg:text-6xl mb-3 tracking-tight leading-tight">Dashboard Admin</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                {new Date().toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="accentOutline"
                size="sm"
                icon={Calendar}
                onClick={handleOpenCreateModal}
                className="min-w-[92px]"
                aria-label="Novo agendamento"
              >
                <span className="inline sm:hidden">Agendar</span>
                <span className="hidden sm:inline">Novo agendamento</span>
              </Button>
              <Button
                variant="accentOutline"
                size="sm"
                icon={Download}
                onClick={() => setShowExportDialog(true)}
                className="min-w-[92px]"
              >
                <span className="hidden sm:inline">Exportar</span>
              </Button>
            </div>
          </div>

          {appointmentError && (
            <div
              className={`mb-6 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive transition-opacity duration-500 ${
                showAppointmentError ? "opacity-100" : "opacity-0"
              }`}
            >
              {appointmentError}
            </div>
          )}
          {appointmentSuccess && (
            <div
              className={`mb-6 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 transition-opacity duration-500 ${
                showAppointmentSuccess ? "opacity-100" : "opacity-0"
              }`}
            >
              {appointmentSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="premium-glass-card bg-card border border-border p-6 hover:border-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                  <span className="text-sm text-accent">{stat.trend}</span>
                </div>
                <div className="text-3xl mb-1">{stat.value}</div>
                <div className="text-sm text-foreground mb-1">{stat.label}</div>
                <div className="text-xs text-muted-foreground">{stat.subtitle}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={false} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
          <div className="flex gap-2 sm:gap-4 mb-8 border-b border-border overflow-x-auto">
            <button
              onClick={() => handleSelectTab("hoje")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "hoje"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => handleSelectTab("relatorios")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "relatorios"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Relatórios
            </button>
            <button
              onClick={() => handleSelectTab("barbeiros")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "barbeiros"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Barbeiros
            </button>
            <button
              onClick={() => handleSelectTab("pessoas")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "pessoas"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pessoas
            </button>
            <button
              onClick={() => handleSelectTab("agenda")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "agenda"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Agenda
            </button>
            <button
              onClick={() => handleSelectTab("comercial")}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap transition-all ${
                selectedTab === "comercial"
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Comercial
            </button>
          </div>

          {selectedTab === "hoje" && (
            <motion.div initial={false} animate={{ opacity: 1 }}>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="premium-title text-xl sm:text-2xl tracking-tight">Agendamentos do Admin</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>{allAppointmentsDisplay.length} agendamentos carregados</span>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <h3 className="mb-3 text-base sm:text-lg text-accent">Hoje</h3>
                  <div className="space-y-3">
                    {appointmentsToday.length === 0 && (
                      <div className="premium-glass-card rounded-lg border border-border bg-card/40 px-4 py-5 text-sm text-muted-foreground">
                        Nenhum agendamento para hoje.
                      </div>
                    )}
                    {pagedAppointmentsTodayDisplay.map((agendamento) => (
                      <div
                        key={agendamento.id}
                        className="premium-glass-card bg-card border border-border p-4 sm:p-6 hover:border-accent/50 transition-colors"
                      >
                        <div className="grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Cliente</div>
                              <div className="font-medium">{agendamento.name}</div>
                              <div className="text-xs text-muted-foreground">{agendamento.email}</div>
                              <div className="text-xs text-muted-foreground">{agendamento.phone}</div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Serviço</div>
                              <div>{SERVICE_LABELS[agendamento.service] ?? agendamento.service}</div>
                              <div className="text-xs text-accent">
                                R$ {(SERVICE_PRICES[agendamento.service] ?? 0).toLocaleString("pt-BR")}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Barbeiro</div>
                              <div>{getBarberLabel(agendamento.barber)}</div>
                              <div className="text-xs text-muted-foreground mt-1">{formatISODatePtBR(agendamento.date)}</div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <Clock className="w-3 h-3" />
                                {agendamento.time}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Status</div>
                              <StatusSelect
                                value={agendamento.status}
                                onValueChange={(value) => handleStatusChange(agendamento.id, value)}
                                options={["confirmado", "pendente", "em_atendimento", "concluido", "cancelado"]}
                                aria-label={`Status do agendamento de ${agendamento.name}`}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 lg:border-l lg:border-border lg:pl-6">
                            <Button
                              variant="accentOutline"
                              size="sm"
                              icon={Edit}
                              onClick={() => handleEdit(agendamento)}
                              className="px-2 sm:px-3"
                              aria-label={`Editar agendamento de ${agendamento.name}`}
                            >
                              <span className="hidden sm:inline">Editar</span>
                              <span className="sr-only">Editar agendamento</span>
                            </Button>
                            <Button
                              variant="destructiveOutline"
                              size="sm"
                              icon={Trash2}
                              onClick={() => handleDelete(agendamento.id)}
                              className="px-2 sm:px-3"
                              aria-label={`Excluir agendamento de ${agendamento.name}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {appointmentsTodayDisplay.length > 0 ? (
                      <ListPaginationBar
                        showingCount={todayAppointmentsPagination.showingCount}
                        totalCount={appointmentsTodayDisplay.length}
                        pageSize={todayAppointmentsPagination.pageSize}
                        page={todayAppointmentsPagination.page}
                        totalPages={todayAppointmentsPagination.totalPages}
                        visiblePages={todayAppointmentsPagination.visiblePages}
                        onPageChange={todayAppointmentsPagination.setPage}
                        itemLabel="agendamentos"
                        className="mt-0"
                      />
                    ) : null}
                  </div>
                </div>

              </div>

              <div className="mt-8">
                <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <h3 className="text-base sm:text-lg text-accent">Todos os agendamentos (sem ocultar)</h3>
                  <Button variant="accentOutline" onClick={exportAllAppointmentsPdf}>
                    Exportar PDF (filtrado)
                  </Button>
                </div>
                <div className="mb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                  <input
                    value={allAppointmentsSearchQuery}
                    onChange={(e) => setAllAppointmentsSearchQuery(e.target.value)}
                    placeholder="Buscar cliente, e-mail, telefone..."
                    className="px-3 py-2 rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all duration-300 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 xl:col-span-2"
                  />
                  <Select
                    value={allAppointmentsStatusFilter}
                    onValueChange={(value) => setAllAppointmentsStatusFilter(value as AppointmentStatus | "all")}
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="em_atendimento">Em atendimento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={allAppointmentsServiceFilter} onValueChange={setAllAppointmentsServiceFilter}>
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Serviço" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos serviços</SelectItem>
                      {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                        <SelectItem key={`all-service-${key}`} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={allAppointmentsBarberFilter} onValueChange={setAllAppointmentsBarberFilter}>
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Barbeiro" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos barbeiros</SelectItem>
                      {allAppointmentsBarberOptions.map((barberKey) => (
                        <SelectItem key={`all-barber-${barberKey}`} value={barberKey}>
                          {getBarberLabel(barberKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Popover open={allAppointmentsStartDatePickerOpen} onOpenChange={setAllAppointmentsStartDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{allAppointmentsStartDate ? formatISODatePtBR(allAppointmentsStartDate) : "Data inicial"}</span>
                          <Calendar className="h-4 w-4 text-accent/80" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                    >
                      <UiCalendar
                        mode="single"
                        selected={allAppointmentsStartDate ? parseISODate(allAppointmentsStartDate) : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          setAllAppointmentsStartDate(toLocalISODate(date));
                          setAllAppointmentsStartDatePickerOpen(false);
                        }}
                        className="rounded-lg"
                        classNames={{
                          caption_label: "text-sm font-semibold capitalize tracking-wide",
                          nav_button:
                            "h-8 w-8 rounded-md border border-border/70 bg-black/30 text-foreground hover:border-accent/50 hover:bg-accent/10",
                          day_selected: "bg-accent text-accent-foreground hover:bg-accent/90",
                          day_today: "border border-accent/60 bg-accent/20 text-accent",
                          day: "h-9 w-9 rounded-md text-sm font-medium hover:bg-accent/12",
                        }}
                        initialFocus
                      />
                      <div className="mt-2 flex items-center justify-between px-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAllAppointmentsStartDate("");
                            setAllAppointmentsStartDatePickerOpen(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAllAppointmentsStartDate(todayLocalISODate());
                            setAllAppointmentsStartDatePickerOpen(false);
                          }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          Hoje
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover open={allAppointmentsEndDatePickerOpen} onOpenChange={setAllAppointmentsEndDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{allAppointmentsEndDate ? formatISODatePtBR(allAppointmentsEndDate) : "Data final"}</span>
                          <Calendar className="h-4 w-4 text-accent/80" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                    >
                      <UiCalendar
                        mode="single"
                        selected={allAppointmentsEndDate ? parseISODate(allAppointmentsEndDate) : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          setAllAppointmentsEndDate(toLocalISODate(date));
                          setAllAppointmentsEndDatePickerOpen(false);
                        }}
                        className="rounded-lg"
                        classNames={{
                          caption_label: "text-sm font-semibold capitalize tracking-wide",
                          nav_button:
                            "h-8 w-8 rounded-md border border-border/70 bg-black/30 text-foreground hover:border-accent/50 hover:bg-accent/10",
                          day_selected: "bg-accent text-accent-foreground hover:bg-accent/90",
                          day_today: "border border-accent/60 bg-accent/20 text-accent",
                          day: "h-9 w-9 rounded-md text-sm font-medium hover:bg-accent/12",
                        }}
                        initialFocus
                      />
                      <div className="mt-2 flex items-center justify-between px-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAllAppointmentsEndDate("");
                            setAllAppointmentsEndDatePickerOpen(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAllAppointmentsEndDate(todayLocalISODate());
                            setAllAppointmentsEndDatePickerOpen(false);
                          }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          Hoje
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="overflow-x-auto premium-glass-card border border-border bg-card/35 rounded-xl">
                  <table className="w-full min-w-[880px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Serviço</th>
                        <th className="px-4 py-3">Barbeiro</th>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Hora</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAppointmentsFiltered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-5 text-sm text-muted-foreground">
                            Nenhum agendamento encontrado.
                          </td>
                        </tr>
                      )}
                      {pagedAllAppointments.map((appointment) => (
                        <tr key={`all-${appointment.id}`} className="border-t border-border/60">
                          <td className="px-4 py-3">
                            <div className="font-medium">{appointment.name}</div>
                            <div className="text-xs text-muted-foreground">{appointment.email}</div>
                          </td>
                          <td className="px-4 py-3">{SERVICE_LABELS[appointment.service] ?? appointment.service}</td>
                          <td className="px-4 py-3">{getBarberLabel(appointment.barber)}</td>
                          <td className="px-4 py-3">{formatISODatePtBR(appointment.date)}</td>
                          <td className="px-4 py-3">{appointment.time}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={appointment.uiStatus} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {allAppointmentsFiltered.length > 0 ? (
                  <ListPaginationBar
                    showingCount={allAppointmentsListPagination.showingCount}
                    totalCount={allAppointmentsFiltered.length}
                    pageSize={allAppointmentsListPagination.pageSize}
                    page={allAppointmentsListPagination.page}
                    totalPages={allAppointmentsListPagination.totalPages}
                    visiblePages={allAppointmentsListPagination.visiblePages}
                    onPageChange={allAppointmentsListPagination.setPage}
                    itemLabel="agendamentos"
                  />
                ) : null}
              </div>

              {editingAppointment && editForm && typeof document !== "undefined" && createPortal(
                <div
                  className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px] sm:p-6"
                  onClick={handleCancelEdit}
                >
                  <div
                    className="premium-glass-card w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-2xl font-semibold">Editar Agendamento</h3>
                        <p className="text-sm text-muted-foreground">Atualize os detalhes e confirme a alteração.</p>
                      </div>
                      <button
                        onClick={handleCancelEdit}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Fechar edição"
                      >
                        ✕
                      </button>
                    </div>
                    {editAppointmentError && (
                      <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {editAppointmentError}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-2 text-sm">
                        <span>Cliente</span>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>Email</span>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>Telefone</span>
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>Data</span>
                        <Popover open={isEditDatePickerOpen} onOpenChange={setIsEditDatePickerOpen}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                            >
                              <span className="flex items-center justify-between gap-3">
                                <span className={editForm.date ? "" : "text-muted-foreground"}>
                                  {editForm.date ? formatISODatePtBR(editForm.date) : "Selecione uma data"}
                                </span>
                                <Calendar className="h-4 w-4 text-accent/80" />
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                          >
                            <UiCalendar
                              mode="single"
                              selected={parseISODate(editForm.date)}
                              onSelect={(date) => {
                                if (!date) return;
                                const y = date.getFullYear();
                                const m = String(date.getMonth() + 1).padStart(2, "0");
                                const d = String(date.getDate()).padStart(2, "0");
                                setEditForm({ ...editForm, date: `${y}-${m}-${d}` });
                                setIsEditDatePickerOpen(false);
                              }}
                              disabled={{ before: new Date(todayLocalISODate()) }}
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
                                  setEditForm({ ...editForm, date: todayLocalISODate() });
                                  setIsEditDatePickerOpen(false);
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Hoje
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditForm({ ...editForm, date: "" });
                                  setIsEditDatePickerOpen(false);
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
                        <span>Serviço</span>
                        <Select
                          value={editForm.service}
                          onValueChange={(value) => setEditForm({ ...editForm, service: value })}
                        >
                          <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                            <SelectValue placeholder="Selecione serviço" />
                          </SelectTrigger>
                          <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                            {Object.entries(SERVICE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>Barbeiro</span>
                        <Select
                          value={editForm.barber}
                          onValueChange={(value) => setEditForm({ ...editForm, barber: value })}
                        >
                          <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                            <SelectValue placeholder="Selecione barbeiro" />
                          </SelectTrigger>
                          <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                            {availableBarbers.map((barber) => (
                              <SelectItem key={barber.key} value={barber.key}>
                                {barber.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>Horário</span>
                        <Select
                          value={editForm.time}
                          onValueChange={(value) => setEditForm({ ...editForm, time: value })}
                        >
                          <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                            <SelectValue placeholder="Selecione horário" />
                          </SelectTrigger>
                          <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                            {availableTimes.map((time) => (
                              <SelectItem key={time} value={time}>
                                {time}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="block space-y-2 text-sm">
                        <span>Valor</span>
                        <div className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                          R$ {(SERVICE_PRICES[editForm.service] ?? 0).toLocaleString("pt-BR")}
                        </div>
                      </label>
                      <label className="block space-y-2 text-sm sm:col-span-2">
                        <span>Status</span>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) => setEditForm({ ...editForm, status: value as AppointmentStatus })}
                        >
                          <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                            <SelectValue placeholder="Selecione status" />
                          </SelectTrigger>
                          <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                            <SelectItem value="agendado">Agendado</SelectItem>
                            <SelectItem value="confirmado">Confirmado</SelectItem>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="em_atendimento">Em atendimento</SelectItem>
                            <SelectItem value="concluido">Concluído</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button variant="ghost" onClick={handleCancelEdit} className="w-full sm:w-auto">
                        Cancelar
                      </Button>
                      <Button
                        variant="accentOutline"
                        onClick={handleSaveEdit}
                        isLoading={isSavingAppointment}
                        disabled={isSavingAppointment}
                        className="w-full sm:w-auto"
                      >
                        Salvar alterações
                      </Button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}

              <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deseja mesmo excluir este agendamento? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleCancelDelete}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="mt-6 p-4 bg-muted/5 border border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Total do Dia</div>
                    <div className="text-2xl">R$ {totalDia.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Agendamentos</div>
                    <div className="text-2xl">{appointmentsToday.length}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Taxa de Conversão</div>
                    <div className="text-2xl text-accent">{taxaConversao}%</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {selectedTab === "relatorios" && (
            <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-6">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="premium-title text-xl sm:text-2xl tracking-tight">Relatórios Mensais</h2>
                  <p className="text-sm text-muted-foreground">Filtre por mês para ver os detalhes exatos de serviços realizados.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label htmlFor="month-filter" className="text-sm text-muted-foreground">
                    Mês
                  </label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[190px] rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Selecione mês" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    placeholder="Buscar cliente, serviço, barbeiro…"
                    className="w-full sm:w-[280px] px-4 py-2 rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all duration-300 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  <Select value={reportServiceFilter} onValueChange={setReportServiceFilter}>
                    <SelectTrigger className="w-[180px] rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Serviço" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos os serviços</SelectItem>
                      {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={reportStatusFilter}
                    onValueChange={(value) => setReportStatusFilter(value as AppointmentStatus | "all")}
                  >
                    <SelectTrigger className="w-[180px] rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="em_atendimento">Em atendimento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border p-5 hover:border-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Receita (filtro)</div>
                      <div className="mt-2 text-2xl text-accent font-medium">R$ {reportRevenue.toLocaleString("pt-BR")}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{reportFilteredAppointments.length} agendamentos</div>
                    </div>
                    <DollarSign className="w-8 h-8 text-accent" />
                  </div>
                </div>
                <div className="bg-card border border-border p-5 hover:border-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ticket médio</div>
                      <div className="mt-2 text-2xl font-medium">R$ {reportAvgTicket.toLocaleString("pt-BR")}</div>
                      <div className="mt-1 text-xs text-muted-foreground">por agendamento</div>
                    </div>
                    <TrendingUp className="w-8 h-8 text-accent" />
                  </div>
                </div>
                <div className="bg-card border border-border p-5 hover:border-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Concluídos</div>
                      <div className="mt-2 text-2xl font-medium">{reportDoneRate}%</div>
                      <div className="mt-1 text-xs text-muted-foreground">{reportDoneCount} concluídos</div>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                </div>
                <div className="bg-card border border-border p-5 hover:border-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cancelados</div>
                      <div className="mt-2 text-2xl font-medium">{reportCancelRate}%</div>
                      <div className="mt-1 text-xs text-muted-foreground">{reportCancelCount} cancelados</div>
                    </div>
                    <XCircle className="w-8 h-8 text-destructive" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="premium-glass-card bg-card border border-border p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-xl font-semibold">Status no mês</h3>
                      <p className="text-sm text-muted-foreground">Distribuição simples (respeita filtros).</p>
                    </div>
                    <Button
                      variant="accentOutline"
                      size="sm"
                      icon={Download}
                      onClick={() => setShowExportDialog(true)}
                      className="min-w-[92px]"
                    >
                      <span className="hidden sm:inline">Exportar</span>
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {reportStatusDistribution
                      .filter((s) => s.total > 0)
                      .map((row) => {
                        const pct = reportFilteredAppointments.length
                          ? Math.round((row.total / reportFilteredAppointments.length) * 100)
                          : 0;
                        return (
                          <div key={row.status} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className="tabular-nums">
                                {row.total} <span className="text-muted-foreground">({pct}%)</span>
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted/20 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    {reportFilteredAppointments.length === 0 && (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Nenhum dado para o filtro selecionado.
                      </div>
                    )}
                  </div>
                </div>

                <div className="premium-glass-card bg-card border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold">Top serviços</h3>
                      <p className="text-sm text-muted-foreground">Mais vendidos no mês.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {Object.values(
                      reportFilteredAppointments.reduce((acc, appointment) => {
                        const key = appointment.service;
                        const label = SERVICE_LABELS[key] ?? key;
                        const price = SERVICE_PRICES[key] ?? 0;
                        if (!acc[key]) acc[key] = { key, label, qtd: 0, receita: 0 };
                        acc[key].qtd += 1;
                        acc[key].receita += price;
                        return acc;
                      }, {} as Record<string, { key: string; label: string; qtd: number; receita: number }>),
                    )
                      .sort((a, b) => b.receita - a.receita)
                      .slice(0, 5)
                      .map((row) => {
                        const pct = reportRevenue ? Math.round((row.receita / reportRevenue) * 100) : 0;
                        return (
                          <div key={row.key} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{row.label}</span>
                              <span className="tabular-nums text-accent">
                                R$ {row.receita.toLocaleString("pt-BR")}{" "}
                                <span className="text-muted-foreground">({row.qtd})</span>
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted/20 overflow-hidden">
                              <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    {reportFilteredAppointments.length === 0 && (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Nenhum dado para o filtro selecionado.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="premium-glass-card bg-card border border-border p-6">
                <h3 className="mb-4">Detalhes por Serviço</h3>
                <div className="space-y-3">
                  {pagedServicosPorTipo.map((servico) => (
                    <div key={servico.nome} className="flex items-center justify-between py-2 border-b border-border">
                      <div>
                        <div className="font-medium">{servico.nome}</div>
                        <div className="text-sm text-muted-foreground">{servico.quantidade} realizados</div>
                      </div>
                      <div className="text-accent">R$ {servico.valor}</div>
                    </div>
                  ))}
                </div>
                {currentServicosPorTipo.length > 0 ? (
                  <ListPaginationBar
                    showingCount={servicosPorTipoPagination.showingCount}
                    totalCount={currentServicosPorTipo.length}
                    pageSize={servicosPorTipoPagination.pageSize}
                    page={servicosPorTipoPagination.page}
                    totalPages={servicosPorTipoPagination.totalPages}
                    visiblePages={servicosPorTipoPagination.visiblePages}
                    onPageChange={servicosPorTipoPagination.setPage}
                    itemLabel="serviços"
                  />
                ) : null}
                <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                  <div className="font-medium">Total</div>
                  <div className="text-2xl text-accent">
                    R$ {currentServicosPorTipo.reduce((acc, s) => acc + s.valor, 0)}
                  </div>
                </div>
              </div>

              <div className="premium-glass-card bg-card border border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">Agendamentos do mês</h3>
                    <p className="text-sm text-muted-foreground">Visualize os agendamentos filtrados por mês.</p>
                  </div>
                  <div className="text-sm text-muted-foreground">Total: {reportFilteredAppointments.length}</div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/70 bg-card/60 backdrop-blur-sm">
                  <table className="min-w-full text-left text-sm text-foreground">
                    <thead className="border-b border-border/80 bg-muted/10 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Data</th>
                        <th className="px-3 py-3 font-semibold">Horário</th>
                        <th className="px-3 py-3 font-semibold">Cliente</th>
                        <th className="px-3 py-3 font-semibold">Email</th>
                        <th className="px-3 py-3 font-semibold">Serviço</th>
                        <th className="px-3 py-3 font-semibold">Barbeiro</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-3 py-3 font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedReportAppointments.map((appointment) => (
                        <tr key={appointment.id} className="border-b border-border/70 hover:bg-accent/8 transition-colors">
                          <td className="px-3 py-3">
                            {new Date(appointment.date).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-3 py-3">{appointment.time}</td>
                          <td className="px-3 py-3">{appointment.name}</td>
                          <td className="px-3 py-3">{appointment.email}</td>
                          <td className="px-3 py-3">{SERVICE_LABELS[appointment.service] ?? appointment.service}</td>
                          <td className="px-3 py-3">{getBarberLabel(appointment.barber)}</td>
                          <td className="px-3 py-3"><StatusBadge status={appointment.status} size="sm" /></td>
                          <td className="px-3 py-3">R$ {(SERVICE_PRICES[appointment.service] ?? 0).toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reportFilteredAppointments.length > 0 ? (
                  <ListPaginationBar
                    showingCount={reportListPagination.showingCount}
                    totalCount={reportFilteredAppointments.length}
                    pageSize={reportListPagination.pageSize}
                    page={reportListPagination.page}
                    totalPages={reportListPagination.totalPages}
                    visiblePages={reportListPagination.visiblePages}
                    onPageChange={reportListPagination.setPage}
                    itemLabel="agendamentos"
                  />
                ) : null}
              </div>
            </motion.div>
          )}

          {selectedTab === "barbeiros" && (
            <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-6">
              <div>
                <h2 className="premium-title text-xl sm:text-2xl tracking-tight">Desempenho dos Barbeiros</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Visão consolidada do mês selecionado com ranking de receita e produtividade.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="premium-glass-card rounded-lg border border-border bg-card/70 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Receita total</div>
                  <div className="mt-2 text-2xl text-accent font-semibold">
                    R$ {totalBarberRevenue.toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="premium-glass-card rounded-lg border border-border bg-card/70 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Total de cortes</div>
                  <div className="mt-2 text-2xl font-semibold">{totalBarberCuts}</div>
                </div>
                <div className="premium-glass-card rounded-lg border border-border bg-card/70 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Top do mês</div>
                  <div className="mt-2 text-xl font-semibold">{topBarber?.nome ?? "—"}</div>
                  <div className="text-sm text-accent">
                    {topBarber ? `R$ ${topBarber.receita.toLocaleString("pt-BR")}` : "Sem registros"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
                <div className="premium-glass-card rounded-lg border border-border bg-card/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold tracking-tight">Ranking dos barbeiros</h3>
                    <span className="text-xs text-muted-foreground">Ordenado por receita</span>
                  </div>

                  {barberPerformance.length === 0 && (
                    <div className="rounded-lg border border-border/70 bg-background/50 px-4 py-5 text-sm text-muted-foreground">
                      Ainda não há dados de desempenho para o mês selecionado.
                    </div>
                  )}

                  {pagedBarberPerformance.map((barber, index) => {
                    const revenueShare = totalBarberRevenue > 0 ? Math.round((barber.receita / totalBarberRevenue) * 100) : 0;
                    const rank = barberPerformancePagination.sliceRange.start + index + 1;
                    return (
                      <div key={barber.nome} className="rounded-lg border border-border/70 bg-background/40 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full border border-accent/50 bg-accent/10 text-accent text-sm font-semibold flex items-center justify-center">
                              #{rank}
                            </div>
                            <div>
                              <div className="font-semibold">{barber.nome}</div>
                              <div className="text-xs text-muted-foreground">
                                {barber.cortes} cortes • Ticket médio R$ {barber.cortes ? Math.round(barber.receita / barber.cortes) : 0}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg text-accent font-semibold">R$ {barber.receita.toLocaleString("pt-BR")}</div>
                            <div className="text-xs text-muted-foreground">{revenueShare}% da receita</div>
                          </div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-muted/20 overflow-hidden">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${revenueShare}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {barberPerformance.length > 0 ? (
                    <ListPaginationBar
                      showingCount={barberPerformancePagination.showingCount}
                      totalCount={barberPerformance.length}
                      pageSize={barberPerformancePagination.pageSize}
                      page={barberPerformancePagination.page}
                      totalPages={barberPerformancePagination.totalPages}
                      visiblePages={barberPerformancePagination.visiblePages}
                      onPageChange={barberPerformancePagination.setPage}
                      itemLabel="barbeiros"
                    />
                  ) : null}
                </div>

                <div className="premium-glass-card rounded-lg border border-border bg-card/70 p-5">
                  <h3 className="text-lg font-semibold tracking-tight mb-1">Comparativo de receita</h3>
                  <p className="text-xs text-muted-foreground mb-4">Receita acumulada por barbeiro no mês selecionado.</p>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart
                      data={barberPerformance}
                      layout="vertical"
                      margin={{ top: 8, right: 16, left: 10, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis type="number" stroke="#9f9f9f" tickFormatter={(value) => `R$ ${value}`} />
                      <YAxis type="category" dataKey="nome" stroke="#d2d2d2" width={86} />
                      <Tooltip
                        formatter={(value: number, name: string) =>
                          name === "receita"
                            ? [`R$ ${Number(value).toLocaleString("pt-BR")}`, "Receita"]
                            : [value, "Cortes"]
                        }
                        contentStyle={{ backgroundColor: "#0a0a0a", border: "1px solid #2a2a2a" }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Bar dataKey="receita" fill="#d4af37" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          )}

          {selectedTab === "pessoas" && (
            <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-6 min-h-[58vh]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="premium-title text-xl sm:text-2xl tracking-tight">Pessoas cadastradas</h2>
                <Button
                  variant="accentOutline"
                  size="sm"
                  onClick={() => void fetchAdminUsers()}
                  isLoading={isLoadingUsers}
                  className={isLoadingUsers ? "animate-pulse" : ""}
                >
                  {isLoadingUsers ? "Atualizando..." : "Atualizar lista"}
                </Button>
              </div>

              {usersError && (
                <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {usersError}
                </div>
              )}

              {isLoadingUsers ? (
                <div className="premium-glass-card rounded-lg border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground min-h-[36vh] flex items-center">
                  Carregando pessoas cadastradas...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {pagedUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => void handleOpenUserDetail(u)}
                      className="premium-glass-card w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-accent/50"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">{u.full_name || u.username}</div>
                          <div className="text-xs text-muted-foreground">{u.email || "Sem e-mail"}</div>
                          <div className="text-xs text-muted-foreground">{u.phone || "Sem telefone"}</div>
                          {u.role === "barbeiro" && (
                            <div className="space-y-0.5 text-xs text-accent/90">
                              <div>Especialidade: {u.barber_specialties?.trim() || "Não informada"}</div>
                              {u.barber_hired_at ? (
                                <div className="text-muted-foreground">
                                  Contratado como barbeiro:{" "}
                                  {new Date(u.barber_hired_at).toLocaleString("pt-BR", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Cargo atual:{" "}
                          <span className="text-foreground">
                            {u.role === "admin" ? "Administrador" : u.role === "barbeiro" ? "Barbeiro" : "Cliente"}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {users.length === 0 && (
                    <div className="premium-glass-card rounded-lg border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                      Nenhuma pessoa cadastrada encontrada.
                    </div>
                  )}
                  {users.length > 0 ? (
                    <ListPaginationBar
                      showingCount={usersListPagination.showingCount}
                      totalCount={users.length}
                      pageSize={usersListPagination.pageSize}
                      page={usersListPagination.page}
                      totalPages={usersListPagination.totalPages}
                      visiblePages={usersListPagination.visiblePages}
                      onPageChange={usersListPagination.setPage}
                      itemLabel="pessoas"
                    />
                  ) : null}
                </div>
              )}

              {selectedUser && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 sm:p-6">
                  <div className="premium-glass-card w-full max-w-xl rounded-xl border border-border bg-background p-6 shadow-2xl">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-semibold">Perfil da pessoa</h3>
                        <p className="text-sm text-muted-foreground">
                          Edite login, nome, contato, situação da conta e cargo. Use &quot;Redefinir senha&quot; só quando
                          precisar trocar a senha dela.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseUserDetail}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Fechar perfil"
                      >
                        ✕
                      </button>
                    </div>

                    {isLoadingUserDetail ? (
                      <p className="mb-4 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent">
                        Carregando dados cadastrados do servidor…
                      </p>
                    ) : null}

                    <div className="grid gap-4 text-sm">
                      <div className="grid gap-1">
                        <label className="text-muted-foreground" htmlFor="admin-user-username">
                          Login (usuário)
                        </label>
                        <input
                          id="admin-user-username"
                          type="text"
                          autoComplete="off"
                          value={userProfileDraft.username}
                          onChange={(e) =>
                            setUserProfileDraft((d) => ({ ...d, username: e.target.value }))
                          }
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-muted-foreground" htmlFor="admin-user-email">
                          E-mail
                        </label>
                        <input
                          id="admin-user-email"
                          type="email"
                          autoComplete="off"
                          value={userProfileDraft.email}
                          onChange={(e) =>
                            setUserProfileDraft((d) => ({ ...d, email: e.target.value }))
                          }
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <label className="text-muted-foreground" htmlFor="admin-user-first">
                            Nome
                          </label>
                          <input
                            id="admin-user-first"
                            type="text"
                            value={userProfileDraft.first_name}
                            onChange={(e) =>
                              setUserProfileDraft((d) => ({ ...d, first_name: e.target.value }))
                            }
                            className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                            disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                          />
                        </div>
                        <div className="grid gap-1">
                          <label className="text-muted-foreground" htmlFor="admin-user-last">
                            Sobrenome
                          </label>
                          <input
                            id="admin-user-last"
                            type="text"
                            value={userProfileDraft.last_name}
                            onChange={(e) =>
                              setUserProfileDraft((d) => ({ ...d, last_name: e.target.value }))
                            }
                            className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                            disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                          />
                        </div>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-muted-foreground" htmlFor="admin-user-phone">
                          Telefone
                        </label>
                        <input
                          id="admin-user-phone"
                          type="tel"
                          value={userProfileDraft.phone}
                          onChange={(e) =>
                            setUserProfileDraft((d) => ({ ...d, phone: e.target.value }))
                          }
                          placeholder="Opcional"
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                        />
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/[0.02] px-3 py-2">
                        <Checkbox
                          id="admin-user-active"
                          checked={userProfileDraft.is_active}
                          onCheckedChange={(checked) =>
                            setUserProfileDraft((d) => ({ ...d, is_active: checked === true }))
                          }
                          disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                        />
                        <label htmlFor="admin-user-active" className="cursor-pointer text-sm leading-none">
                          Conta ativa (pode fazer login)
                        </label>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Cadastro em: {new Date(selectedUser.date_joined).toLocaleDateString("pt-BR")}
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="mb-2 block text-sm">Cargo de acesso</label>
                      <Select
                        value={userRoleDraft}
                        onValueChange={(value) => setUserRoleDraft(value as UserRole)}
                        disabled={isSavingUserRole || isLoadingUserDetail}
                      >
                        <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                          <SelectValue placeholder="Cargo de acesso" />
                        </SelectTrigger>
                        <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                          <SelectItem value="cliente">Cliente</SelectItem>
                          <SelectItem value="barbeiro">Barbeiro</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {userRoleDraft === "barbeiro" && (
                      <div className="mt-5">
                        {selectedUser.barber_hired_at ? (
                          <p className="mb-3 text-xs text-muted-foreground">
                            Registado como barbeiro em:{" "}
                            <span className="text-foreground">
                              {new Date(selectedUser.barber_hired_at).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                            . Atualiza-se quando o cargo volta a ser &quot;Barbeiro&quot; após outro perfil.
                          </p>
                        ) : null}
                        <label className="mb-2 block text-sm">Especialidade do barbeiro</label>
                        <input
                          type="text"
                          value={barberSpecialtiesDraft}
                          onChange={(e) => setBarberSpecialtiesDraft(e.target.value)}
                          placeholder="Ex.: Degradê, Navalhado, Barba premium"
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          disabled={isSavingUserRole || isResettingPassword || isLoadingUserDetail}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          Essa especialidade aparece na escolha de barbeiro para os clientes.
                        </p>
                      </div>
                    )}

                    <div className="mt-5">
                      <label className="mb-2 block text-sm">Redefinir senha (temporária)</label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={resetPasswordDraft}
                          onChange={(e) => setResetPasswordDraft(e.target.value)}
                          placeholder="Nova senha temporária (mín. 8)"
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                          disabled={isResettingPassword || isSavingUserRole || isLoadingUserDetail}
                        />
                        <Button
                          variant="accentOutline"
                          onClick={handleResetUserPassword}
                          isLoading={isResettingPassword}
                          disabled={isSavingUserRole || isLoadingUserDetail}
                          className="sm:min-w-[170px]"
                        >
                          Redefinir senha
                        </Button>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <Button variant="ghost" onClick={handleCloseUserDetail} disabled={isSavingUserRole || isResettingPassword}>
                        Fechar
                      </Button>
                      <Button
                        variant="accentOutline"
                        onClick={handleRequestSaveUser}
                        isLoading={isSavingUserRole}
                        disabled={isResettingPassword || isLoadingUserDetail}
                      >
                        Salvar alterações
                      </Button>
                    </div>

                    <AlertDialog open={showRoleConfirmDialog} onOpenChange={setShowRoleConfirmDialog}>
                      <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="tracking-tight">Confirmar alteração de cargo?</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground">
                            O cargo de acesso desta pessoa será alterado (junto com os demais dados que você editou).
                            Deseja continuar?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={isSavingUserRole}
                            className="border-border bg-background text-foreground hover:bg-muted/50"
                          >
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleSaveUser()}
                            disabled={isSavingUserRole}
                            className="bg-accent text-accent-foreground hover:bg-accent/90"
                          >
                            {isSavingUserRole ? "Salvando..." : "Sim, confirmar alterações"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog
                      open={successDialogMessage !== null}
                      onOpenChange={(open) => {
                        if (!open) {
                          setSuccessDialogMessage(null);
                          setSelectedUser(null);
                          setShowRoleConfirmDialog(false);
                        }
                      }}
                    >
                      <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="tracking-tight text-accent">Alterações salvas</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground">
                            {successDialogMessage ?? ""}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction
                            onClick={() => {
                              setSuccessDialogMessage(null);
                              setSelectedUser(null);
                              setShowRoleConfirmDialog(false);
                            }}
                            className="bg-accent text-accent-foreground hover:bg-accent/90"
                          >
                            OK
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>,
                document.body,
              )}
            </motion.div>
          )}

          {selectedTab === "agenda" && (
            <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="premium-title text-xl sm:text-2xl tracking-tight">Configuração da agenda</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Defina horário de funcionamento e bloqueios para evitar agendamentos em intervalos indisponíveis.
                  </p>
                </div>
                <Button
                  variant="accentOutline"
                  size="sm"
                  onClick={() => void fetchScheduleConfig()}
                  isLoading={isLoadingScheduleConfig}
                >
                  Atualizar
                </Button>
              </div>

              {scheduleConfigError && (
                <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {scheduleConfigError}
                </div>
              )}

              <div className="premium-glass-card rounded-xl border border-border/80 bg-gradient-to-b from-card/80 to-card/55 p-5 sm:p-6 space-y-4 shadow-[0_20px_55px_-35px_rgba(0,0,0,0.9)]">
                <h3 className="text-lg font-semibold tracking-tight text-accent">Horário de funcionamento</h3>
                <div className="grid grid-cols-1 gap-3">
                  {businessHours.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-border/70 bg-gradient-to-b from-background/70 to-background/40 p-3 grid grid-cols-1 md:grid-cols-[1fr_150px_150px_auto_auto] items-center gap-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.015)]"
                    >
                      <div className="text-sm font-medium">{row.weekday_label}</div>
                      <Select
                        value={normalizeTimeInput(row.open_time)}
                        onValueChange={(value) => handleBusinessHourFieldChange(row.id, "open_time", value)}
                        disabled={!row.is_open}
                      >
                        <SelectTrigger className="rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                          <SelectValue placeholder="Abertura" />
                        </SelectTrigger>
                        <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                          {AGENDA_TIME_OPTIONS.map((time) => (
                            <SelectItem key={`open-${row.id}-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={normalizeTimeInput(row.close_time)}
                        onValueChange={(value) => handleBusinessHourFieldChange(row.id, "close_time", value)}
                        disabled={!row.is_open}
                      >
                        <SelectTrigger className="rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                          <SelectValue placeholder="Fechamento" />
                        </SelectTrigger>
                        <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                          {AGENDA_TIME_OPTIONS.map((time) => (
                            <SelectItem key={`close-${row.id}-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={row.is_open}
                          onChange={(e) => handleBusinessHourFieldChange(row.id, "is_open", e.target.checked)}
                          className="h-4 w-4 rounded border-border/70 bg-background/60 accent-accent"
                        />
                        Aberto
                      </label>
                      <Button
                        variant="accentOutline"
                        size="sm"
                        onClick={() => void handleSaveBusinessHour(row)}
                        isLoading={isSavingBusinessHourId === row.id}
                      >
                        Salvar
                      </Button>
                    </div>
                  ))}
                  {businessHours.length === 0 && (
                    <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
                      Nenhum horário cadastrado. Rode o seed do backend ou crie via API.
                    </div>
                  )}
                </div>
              </div>

              <div className="premium-glass-card rounded-xl border border-border/80 bg-gradient-to-b from-card/80 to-card/55 p-5 sm:p-6 space-y-4 shadow-[0_20px_55px_-35px_rgba(0,0,0,0.9)]">
                <h3 className="text-lg font-semibold tracking-tight text-accent">Bloqueios de agenda</h3>

                <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
                  <Select
                    value={blockForm.barber_calendar_key || SELECT_ALL_BARBERS}
                    onValueChange={(value) =>
                      setBlockForm({
                        ...blockForm,
                        barber_calendar_key: value === SELECT_ALL_BARBERS ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger className="lg:col-span-2 w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Todos os barbeiros" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value={SELECT_ALL_BARBERS}>Todos os barbeiros</SelectItem>
                      {availableBarbers.map((barber) => (
                        <SelectItem key={barber.key} value={barber.key}>
                          {barber.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Popover open={isBlockDatePickerOpen} onOpenChange={setIsBlockDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className={blockForm.date ? "" : "text-muted-foreground"}>
                            {blockForm.date ? formatISODatePtBR(blockForm.date) : "Selecione uma data"}
                          </span>
                          <Calendar className="h-4 w-4 text-accent/80" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                    >
                      <UiCalendar
                        mode="single"
                        selected={parseISODate(blockForm.date)}
                        onSelect={(date) => {
                          if (!date) return;
                          const y = date.getFullYear();
                          const m = String(date.getMonth() + 1).padStart(2, "0");
                          const d = String(date.getDate()).padStart(2, "0");
                          setBlockForm((current) => ({ ...current, date: `${y}-${m}-${d}` }));
                          setIsBlockDatePickerOpen(false);
                        }}
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
                            setBlockForm((current) => ({ ...current, date: todayLocalISODate() }));
                            setIsBlockDatePickerOpen(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Hoje
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBlockForm((current) => ({ ...current, date: "" }));
                            setIsBlockDatePickerOpen(false);
                          }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          Limpar
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Select
                    value={normalizeTimeInput(blockForm.start_time)}
                    onValueChange={(value) => setBlockForm({ ...blockForm, start_time: value })}
                  >
                    <SelectTrigger className="rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Início" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      {AGENDA_TIME_OPTIONS.map((time) => (
                        <SelectItem key={`block-start-${time}`} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={normalizeTimeInput(blockForm.end_time)}
                    onValueChange={(value) => setBlockForm({ ...blockForm, end_time: value })}
                  >
                    <SelectTrigger className="rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Fim" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      {AGENDA_TIME_OPTIONS.map((time) => (
                        <SelectItem key={`block-end-${time}`} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="accentOutline"
                    onClick={() => void handleCreateBlockedSlot()}
                    isLoading={isCreatingBlockedSlot}
                  >
                    Adicionar
                  </Button>
                </div>
                <input
                  type="text"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="Motivo do bloqueio (opcional)"
                  className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setBlockForm((current) => ({
                        ...current,
                        start_time: "12:00",
                        end_time: "13:00",
                        reason: current.reason || "Intervalo de almoço",
                      }))
                    }
                  >
                    Preset almoço
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setBlockForm((current) => ({
                        ...current,
                        start_time: "09:00",
                        end_time: "20:00",
                        reason: current.reason || "Dia indisponível",
                      }))
                    }
                  >
                    Preset dia inteiro
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setBlockForm((current) => ({
                        ...current,
                        date: todayLocalISODate(),
                      }))
                    }
                  >
                    Usar data de hoje
                  </Button>
                </div>

                <div className="rounded-xl border border-border/70 bg-gradient-to-b from-background/70 to-background/40 p-3 space-y-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.012)]">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Ajuste rápido por arraste</span>
                    <span>{normalizeTimeInput(blockForm.start_time)} - {normalizeTimeInput(blockForm.end_time)}</span>
                  </div>
                  <div
                    ref={timelineRef}
                    className="relative h-10 rounded-md border border-border/70 bg-background/70"
                  >
                    <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-11 opacity-30">
                      {Array.from({ length: 11 }).map((_, idx) => (
                        <div key={`slot-grid-${idx}`} className="border-r border-border/40" />
                      ))}
                    </div>
                    <div
                      className="absolute top-1 bottom-1 rounded-md bg-accent/35 border border-accent/60"
                      style={{ left: `${timelineLeft}%`, width: `${Math.max(timelineWidth, 3)}%` }}
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border border-accent bg-accent/90 shadow"
                      style={{ left: `calc(${timelineLeft}% - 10px)` }}
                      onMouseDown={() => setDraggingHandle("start")}
                      aria-label="Arrastar início do bloqueio"
                    />
                    <button
                      type="button"
                      className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border border-accent bg-accent/90 shadow"
                      style={{ left: `calc(${timelineLeft + Math.max(timelineWidth, 3)}% - 10px)` }}
                      onMouseDown={() => setDraggingHandle("end")}
                      aria-label="Arrastar fim do bloqueio"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>09:00</span>
                    <span>20:00</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-gradient-to-b from-background/70 to-background/40 p-3 space-y-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.012)]">
                  <div className="text-xs text-muted-foreground">Templates rápidos</div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Nome do template (ex.: Intervalo almoço)"
                      className="rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                    />
                    <Button
                      variant="accentOutline"
                      size="sm"
                      onClick={() => void handleSaveTemplate()}
                      isLoading={isSavingTemplate}
                    >
                      Salvar template
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {isLoadingTemplates ? (
                      <div className="text-xs text-muted-foreground">Carregando templates...</div>
                    ) : blockTemplates.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Nenhum template salvo ainda.</div>
                    ) : (
                      blockTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="rounded-md border border-border/70 bg-background/60 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div className="text-sm">
                            <span className="font-medium">{template.name}</span>
                            <span className="text-xs text-muted-foreground"> • {template.start_time} - {template.end_time}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleApplyTemplate(template)}>
                              Aplicar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => void handleDeleteTemplate(template.id)}
                              isLoading={deletingTemplateId === template.id}
                            >
                              Excluir
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[220px_220px_auto] gap-3">
                  <Select
                    value={
                      blockedSlotFilter.barber_calendar_key === ""
                        ? SELECT_GLOBAL_BLOCKS
                        : blockedSlotFilter.barber_calendar_key
                    }
                    onValueChange={(value) =>
                      setBlockedSlotFilter((current) => ({
                        ...current,
                        barber_calendar_key: value === SELECT_GLOBAL_BLOCKS ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Filtro de barbeiro" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Filtro: todos os barbeiros</SelectItem>
                      <SelectItem value={SELECT_GLOBAL_BLOCKS}>Filtro: bloqueios globais</SelectItem>
                      {availableBarbers.map((barber) => (
                        <SelectItem key={barber.key} value={barber.key}>
                          Filtro: {barber.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Popover open={isFilterDatePickerOpen} onOpenChange={setIsFilterDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{blockedSlotFilter.date ? formatISODatePtBR(blockedSlotFilter.date) : "Filtrar por data"}</span>
                          <Calendar className="h-4 w-4 text-accent/80" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                    >
                      <UiCalendar
                        mode="single"
                        selected={blockedSlotFilter.date ? parseISODate(blockedSlotFilter.date) : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          const y = date.getFullYear();
                          const m = String(date.getMonth() + 1).padStart(2, "0");
                          const d = String(date.getDate()).padStart(2, "0");
                          setBlockedSlotFilter((current) => ({ ...current, date: `${y}-${m}-${d}` }));
                          setIsFilterDatePickerOpen(false);
                        }}
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
                            setBlockedSlotFilter((current) => ({ ...current, date: "" }));
                            setIsFilterDatePickerOpen(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBlockedSlotFilter((current) => ({ ...current, date: todayLocalISODate() }));
                            setIsFilterDatePickerOpen(false);
                          }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          Hoje
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBlockedSlotFilter({ barber_calendar_key: "all", date: "" })}
                    className="justify-self-start"
                  >
                    Limpar filtros
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[220px_220px_180px_auto] gap-3">
                  <Select
                    value={blockedSlotSort.field}
                    onValueChange={(value) =>
                      setBlockedSlotSort((current) => ({
                        ...current,
                        field: value as "date" | "start_time" | "barber_calendar_key",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="date">Ordenar por data</SelectItem>
                      <SelectItem value="start_time">Ordenar por hora início</SelectItem>
                      <SelectItem value="barber_calendar_key">Ordenar por barbeiro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={blockedSlotSort.direction}
                    onValueChange={(value) =>
                      setBlockedSlotSort((current) => ({
                        ...current,
                        direction: value as "asc" | "desc",
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Direção" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="asc">Crescente</SelectItem>
                      <SelectItem value="desc">Decrescente</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(blockedSlotsPageSize)}
                    onValueChange={(value) => setBlockedSlotsPageSize(Number(value))}
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Por página" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="5">5 por página</SelectItem>
                      <SelectItem value="10">10 por página</SelectItem>
                      <SelectItem value="20">20 por página</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground self-center lg:text-right">
                    {sortedBlockedSlots.length} bloqueio(s) encontrado(s)
                  </div>
                </div>

                <div className="space-y-2">
                  {pagedBlockedSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-xl border border-border/70 bg-gradient-to-b from-background/75 to-background/45 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.012)]"
                    >
                      {editingBlockedSlotId === slot.id ? (
                        <div className="w-full space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                            <Select
                              value={blockedSlotDraft.barber_calendar_key || SELECT_ALL_BARBERS}
                              onValueChange={(value) =>
                                setBlockedSlotDraft((current) => ({
                                  ...current,
                                  barber_calendar_key: value === SELECT_ALL_BARBERS ? "" : value,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                                <SelectValue placeholder="Todos os barbeiros" />
                              </SelectTrigger>
                              <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                                <SelectItem value={SELECT_ALL_BARBERS}>Todos os barbeiros</SelectItem>
                                {availableBarbers.map((barber) => (
                                  <SelectItem key={barber.key} value={barber.key}>
                                    {barber.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Popover
                              open={editDatePickerOpenId === slot.id}
                              onOpenChange={(open) => setEditDatePickerOpenId(open ? slot.id : null)}
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                                >
                                  <span className="flex items-center justify-between gap-3">
                                    <span className={blockedSlotDraft.date ? "" : "text-muted-foreground"}>
                                      {blockedSlotDraft.date ? formatISODatePtBR(blockedSlotDraft.date) : "Selecione uma data"}
                                    </span>
                                    <Calendar className="h-4 w-4 text-accent/80" />
                                  </span>
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                              >
                                <UiCalendar
                                  mode="single"
                                  selected={parseISODate(blockedSlotDraft.date)}
                                  onSelect={(date) => {
                                    if (!date) return;
                                    const y = date.getFullYear();
                                    const m = String(date.getMonth() + 1).padStart(2, "0");
                                    const d = String(date.getDate()).padStart(2, "0");
                                    setBlockedSlotDraft((current) => ({ ...current, date: `${y}-${m}-${d}` }));
                                    setEditDatePickerOpenId(null);
                                  }}
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
                                      setBlockedSlotDraft((current) => ({ ...current, date: todayLocalISODate() }));
                                      setEditDatePickerOpenId(null);
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    Hoje
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBlockedSlotDraft((current) => ({ ...current, date: "" }));
                                      setEditDatePickerOpenId(null);
                                    }}
                                    className="text-xs text-accent hover:text-accent/80 transition-colors"
                                  >
                                    Limpar
                                  </button>
                                </div>
                              </PopoverContent>
                            </Popover>
                            <Select
                              value={normalizeTimeInput(blockedSlotDraft.start_time)}
                              onValueChange={(value) =>
                                setBlockedSlotDraft((current) => ({ ...current, start_time: value }))
                              }
                            >
                              <SelectTrigger className="rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                                <SelectValue placeholder="Início" />
                              </SelectTrigger>
                              <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                                {AGENDA_TIME_OPTIONS.map((time) => (
                                  <SelectItem key={`edit-start-${slot.id}-${time}`} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={normalizeTimeInput(blockedSlotDraft.end_time)}
                              onValueChange={(value) =>
                                setBlockedSlotDraft((current) => ({ ...current, end_time: value }))
                              }
                            >
                              <SelectTrigger className="rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                                <SelectValue placeholder="Fim" />
                              </SelectTrigger>
                              <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                                {AGENDA_TIME_OPTIONS.map((time) => (
                                  <SelectItem key={`edit-end-${slot.id}-${time}`} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input
                              type="text"
                              value={blockedSlotDraft.reason}
                              onChange={(e) =>
                                setBlockedSlotDraft((current) => ({ ...current, reason: e.target.value }))
                              }
                              placeholder="Motivo"
                              className="rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={handleCancelEditBlockedSlot}>
                              Cancelar
                            </Button>
                            <Button
                              variant="accentOutline"
                              size="sm"
                              onClick={() => void handleSaveEditBlockedSlot()}
                              isLoading={isSavingBlockedSlotEdit}
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm">
                            <span className="font-medium">{formatISODatePtBR(slot.date)}</span> • {slot.start_time} - {slot.end_time}
                            <div className="text-xs text-muted-foreground">
                              {slot.barber_calendar_key ? `Barbeiro: ${slot.barber_calendar_key}` : "Todos os barbeiros"}
                              {slot.reason ? ` • ${slot.reason}` : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStartEditBlockedSlot(slot)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRequestDeleteBlockedSlot(slot.id)}
                              isLoading={deletingBlockedSlotId === slot.id}
                              className="text-destructive hover:text-destructive"
                            >
                              Remover
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {pagedBlockedSlots.length === 0 && (
                    <div className="rounded-lg border border-border/70 bg-background/40 px-4 py-5 text-sm text-muted-foreground">
                      Nenhum bloqueio encontrado para os filtros aplicados.
                    </div>
                  )}
                </div>
                {sortedBlockedSlots.length > 0 ? (
                  <ListPaginationBar
                    showingCount={blockedSlotsListPagination.showingCount}
                    totalCount={sortedBlockedSlots.length}
                    pageSize={blockedSlotsListPagination.pageSize}
                    page={blockedSlotsListPagination.page}
                    totalPages={blockedSlotsListPagination.totalPages}
                    visiblePages={blockedSlotsListPagination.visiblePages}
                    onPageChange={blockedSlotsListPagination.setPage}
                    itemLabel="bloqueios"
                    className="pt-2"
                  />
                ) : null}
              </div>

              <AlertDialog
                open={pendingDeleteBlockedSlotId !== null}
                onOpenChange={(open) => {
                  if (!open) setPendingDeleteBlockedSlotId(null);
                }}
              >
                <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="tracking-tight">Remover bloqueio?</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      Esta ação libera o horário novamente para agendamentos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border bg-background text-foreground hover:bg-muted/50">
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleConfirmDeleteBlockedSlot()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Confirmar remoção
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          )}

          {selectedTab === "comercial" && (
            <motion.div initial={false} animate={{ opacity: 1 }} className="space-y-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="premium-title text-xl sm:text-2xl tracking-tight">Operação Comercial</h2>
                <Button variant="accentOutline" onClick={() => void fetchCommercialData()} isLoading={isLoadingCommercial}>
                  Atualizar
                </Button>
              </div>

              {commercialError && (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {commercialError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
                <div className="premium-glass-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground">Transações (total)</div>
                  <div className="text-2xl mt-1">{paymentTransactions.length}</div>
                </div>
                <div className="premium-glass-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground">Taxa de aprovação</div>
                  <div className="text-2xl mt-1 text-accent">{approvalRate}%</div>
                </div>
                <div className="premium-glass-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground">Receita aprovada</div>
                  <div className="text-2xl mt-1">R$ {approvedRevenue.toFixed(2)}</div>
                </div>
                <div className="premium-glass-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground">Notificações com falha</div>
                  <div className="text-2xl mt-1 text-destructive">{failedNotifications}</div>
                </div>
                <div className="premium-glass-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground">Clientes com pacote ativo</div>
                  <div className="text-2xl mt-1 text-accent">{activePackageCustomers}</div>
                </div>
                <div className="premium-glass-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground">Solicitações pendentes</div>
                  <div className="text-2xl mt-1">{pendingPackageCustomers}</div>
                </div>
              </div>

              <div className="premium-glass-card border border-border rounded-xl p-5">
                <h3 className="text-lg mb-3">Planos cadastrados</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {pagedClientPackages.map((pkg) => (
                    <div key={pkg.id} className="rounded-lg border border-border/70 bg-card/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold">{pkg.name}</div>
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEditClientPackage(pkg)}>
                          Editar
                        </Button>
                      </div>
                      <div className="text-sm text-accent mt-1">R$ {Number(pkg.price).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Sessões: {formatPackageSessionsShort(pkg.sessions, pkg.sessions_unlimited)}
                      </div>
                      <div className="text-xs text-muted-foreground">Validade: {pkg.validity_days} dias</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Status: {pkg.is_active ? "Ativo" : "Inativo"}
                      </div>
                    </div>
                  ))}
                </div>
                {clientPackages.length > 0 ? (
                  <ListPaginationBar
                    showingCount={clientPackagesListPagination.showingCount}
                    totalCount={clientPackages.length}
                    pageSize={clientPackagesListPagination.pageSize}
                    page={clientPackagesListPagination.page}
                    totalPages={clientPackagesListPagination.totalPages}
                    visiblePages={clientPackagesListPagination.visiblePages}
                    onPageChange={clientPackagesListPagination.setPage}
                    itemLabel="pacotes"
                  />
                ) : null}
              </div>

              <div className="premium-glass-card border border-border rounded-xl p-5">
                <h3 className="text-lg mb-3">Assinaturas de pacotes dos clientes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2">Contato</th>
                        <th className="px-3 py-2">Pacote</th>
                        <th className="px-3 py-2">Sessões</th>
                        <th className="px-3 py-2">Encerramento</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientPackageSubscriptions.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-4 text-sm text-muted-foreground">
                            Nenhuma assinatura de pacote encontrada.
                          </td>
                        </tr>
                      )}
                      {pagedClientPackageSubscriptions.map((subscriptionItem) => (
                        <tr key={subscriptionItem.id} className="border-t border-border/60">
                          <td className="px-3 py-3 text-sm">{new Date(subscriptionItem.created_at).toLocaleString("pt-BR")}</td>
                          <td className="px-3 py-3 text-sm">{subscriptionItem.name}</td>
                          <td className="px-3 py-3 text-sm">
                            <div>{subscriptionItem.email || "-"}</div>
                            <div className="text-xs text-muted-foreground">{subscriptionItem.phone || "-"}</div>
                          </td>
                          <td className="px-3 py-3 text-sm">{subscriptionItem.package?.name ?? "-"}</td>
                          <td className="px-3 py-3 text-sm">
                            {formatSubscriptionSessionsProgress({
                              sessions_used: subscriptionItem.sessions_used,
                              sessions_total: subscriptionItem.sessions_total,
                              sessions_unlimited: subscriptionItem.sessions_unlimited,
                            })}
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {subscriptionItem.expiry_notice_label ? (
                              <div className="max-w-[200px] text-xs text-amber-200/90">{subscriptionItem.expiry_notice_label}</div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {subscriptionItem.pending_login_notice ? (
                              <div className="mt-1 text-[10px] text-muted-foreground">Aviso pendente no login do cliente</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-sm">{subscriptionItem.status_display}</td>
                          <td className="px-3 py-3 text-sm">
                            <div className="flex gap-2">
                              <Button
                                variant="accentOutline"
                                size="sm"
                                className="!h-8 !rounded-md px-2 text-xs"
                                onClick={() => void handleUpdateClientPackageSubscriptionStatus(subscriptionItem.id, "active")}
                                isLoading={savingClientPackageSubscriptionId === subscriptionItem.id}
                                disabled={subscriptionItem.status === "active"}
                              >
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Ativar
                              </Button>
                              <Button
                                variant="destructiveOutline"
                                size="sm"
                                className="!h-8 !rounded-md px-2 text-xs"
                                onClick={() => void handleUpdateClientPackageSubscriptionStatus(subscriptionItem.id, "canceled")}
                                isLoading={savingClientPackageSubscriptionId === subscriptionItem.id}
                                disabled={subscriptionItem.status === "canceled"}
                              >
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Cancelar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="!h-8 !rounded-md px-2 text-xs"
                                onClick={() => setPendingDeleteClientPackageSubscriptionId(subscriptionItem.id)}
                                isLoading={savingClientPackageSubscriptionId === subscriptionItem.id}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Remover
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {clientPackageSubscriptions.length > 0 ? (
                  <ListPaginationBar
                    showingCount={clientSubsListPagination.showingCount}
                    totalCount={clientPackageSubscriptions.length}
                    pageSize={clientSubsListPagination.pageSize}
                    page={clientSubsListPagination.page}
                    totalPages={clientSubsListPagination.totalPages}
                    visiblePages={clientSubsListPagination.visiblePages}
                    onPageChange={clientSubsListPagination.setPage}
                    itemLabel="assinaturas"
                  />
                ) : null}
              </div>

              <AlertDialog
                open={pendingDeleteClientPackageSubscriptionId !== null}
                onOpenChange={(open) => !open && setPendingDeleteClientPackageSubscriptionId(null)}
              >
                <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="tracking-tight">Remover pacote do cliente?</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                      Esta ação remove a assinatura selecionada permanentemente e não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border bg-background text-foreground hover:bg-muted/50">
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => {
                        if (pendingDeleteClientPackageSubscriptionId === null) return;
                        void handleRemoveClientPackageSubscription(pendingDeleteClientPackageSubscriptionId);
                      }}
                    >
                      Remover pacote
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="premium-glass-card border border-border rounded-xl p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">Transações de pagamento</h3>
                    <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                      Mercado Pago, dinheiro, Pix no balcão e pacotes. A coluna Valor mostra o preço de tabela do
                      serviço. Em sessão de pacote, a coluna Forma mostra o nome do plano tal como estava no momento em
                      que o atendimento foi encerrado (não o nome atual do pacote na base).
                    </p>
                  </div>
                  <Button variant="accentOutline" onClick={exportPaymentsPdf}>
                    Exportar PDF (transações)
                  </Button>
                </div>
                <div className="mb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                  <input
                    value={paymentSearchQuery}
                    onChange={(e) => setPaymentSearchQuery(e.target.value)}
                    placeholder="Buscar cliente, serviço, forma de pagamento..."
                    className="px-3 py-2 rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all duration-300 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 xl:col-span-2"
                  />
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Status pagamento" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos status</SelectItem>
                      {paymentStatusOptions.map((statusKey) => (
                        <SelectItem key={`tx-status-${statusKey}`} value={statusKey}>
                          {getPaymentStatusLabel(statusKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Popover open={paymentStartDatePickerOpen} onOpenChange={setPaymentStartDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{paymentStartDate ? formatISODatePtBR(paymentStartDate) : "Data inicial"}</span>
                          <Calendar className="h-4 w-4 text-accent/80" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                    >
                      <UiCalendar
                        mode="single"
                        selected={paymentStartDate ? parseISODate(paymentStartDate) : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          setPaymentStartDate(toLocalISODate(date));
                          setPaymentStartDatePickerOpen(false);
                        }}
                        className="rounded-lg"
                        classNames={{
                          caption_label: "text-sm font-semibold capitalize tracking-wide",
                          nav_button:
                            "h-8 w-8 rounded-md border border-border/70 bg-black/30 text-foreground hover:border-accent/50 hover:bg-accent/10",
                          day_selected: "bg-accent text-accent-foreground hover:bg-accent/90",
                          day_today: "border border-accent/60 bg-accent/20 text-accent",
                          day: "h-9 w-9 rounded-md text-sm font-medium hover:bg-accent/12",
                        }}
                        initialFocus
                      />
                      <div className="mt-2 flex items-center justify-between px-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentStartDate("");
                            setPaymentStartDatePickerOpen(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentStartDate(todayLocalISODate());
                            setPaymentStartDatePickerOpen(false);
                          }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          Hoje
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover open={paymentEndDatePickerOpen} onOpenChange={setPaymentEndDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{paymentEndDate ? formatISODatePtBR(paymentEndDate) : "Data final"}</span>
                          <Calendar className="h-4 w-4 text-accent/80" />
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                    >
                      <UiCalendar
                        mode="single"
                        selected={paymentEndDate ? parseISODate(paymentEndDate) : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          setPaymentEndDate(toLocalISODate(date));
                          setPaymentEndDatePickerOpen(false);
                        }}
                        className="rounded-lg"
                        classNames={{
                          caption_label: "text-sm font-semibold capitalize tracking-wide",
                          nav_button:
                            "h-8 w-8 rounded-md border border-border/70 bg-black/30 text-foreground hover:border-accent/50 hover:bg-accent/10",
                          day_selected: "bg-accent text-accent-foreground hover:bg-accent/90",
                          day_today: "border border-accent/60 bg-accent/20 text-accent",
                          day: "h-9 w-9 rounded-md text-sm font-medium hover:bg-accent/12",
                        }}
                        initialFocus
                      />
                      <div className="mt-2 flex items-center justify-between px-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentEndDate("");
                            setPaymentEndDatePickerOpen(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentEndDate(todayLocalISODate());
                            setPaymentEndDatePickerOpen(false);
                          }}
                          className="text-xs text-accent hover:text-accent/80 transition-colors"
                        >
                          Hoje
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPaymentSearchQuery("");
                      setPaymentStatusFilter("all");
                      setPaymentStartDate("");
                      setPaymentEndDate("");
                    }}
                  >
                    Limpar filtros
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Se não aparecer transação, limpe as datas ou ajuste o período. Após encerramentos no painel do
                    barbeiro, use <span className="text-foreground/90">Atualizar</span> no topo desta aba se já estiver
                    aqui.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/50 bg-black/20">
                  <table className="w-full min-w-[1040px] text-left">
                    <thead>
                      <tr className="border-b border-border/60 bg-black/35 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="whitespace-nowrap px-3 py-3 pl-4">Data</th>
                        <th className="whitespace-nowrap px-3 py-3">Cliente</th>
                        <th className="min-w-[120px] px-3 py-3">Serviço</th>
                        <th className="min-w-[100px] px-3 py-3">Barbeiro</th>
                        <th className="whitespace-nowrap px-3 py-3">Valor</th>
                        <th className="whitespace-nowrap px-3 py-3">Forma</th>
                        <th className="whitespace-nowrap px-3 py-3">Status</th>
                        <th className="min-w-[140px] px-3 py-3 pr-4">Provedor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {paymentTransactionsFiltered.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Nenhuma transação encontrada com os filtros atuais.
                          </td>
                        </tr>
                      )}
                      {pagedPaymentTransactions.map((tx) => {
                        const { date, time } = formatNotificationEventDateParts(tx.created_at);
                        const formaCode = String(tx.provider || "").trim().toLowerCase();
                        const formaLabel = getPaymentFormaLabel(tx);
                        const statusLabel = getPaymentStatusLabel(tx.status, tx.status_display);
                        const providerLabel = getPaymentProviderLabel(tx.provider_display);
                        const valorServico = getPaymentTransactionServiceListAmount(tx);
                        return (
                          <tr key={tx.id} className="align-top transition-colors hover:bg-white/[0.03]">
                            <td className="whitespace-nowrap px-3 py-3 pl-4 text-sm tabular-nums text-foreground/95">
                              <div className="flex items-start gap-2">
                                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/70" aria-hidden />
                                <div>
                                  <div className="font-medium capitalize leading-tight">{date}</div>
                                  {time ? <div className="text-xs text-muted-foreground">{time}</div> : null}
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-foreground">
                              {tx.appointment_summary?.name ?? "—"}
                            </td>
                            <td className="max-w-[200px] px-3 py-3 text-sm leading-snug text-foreground/90">
                              <span className="line-clamp-2" title={SERVICE_LABELS[tx.appointment_summary?.service ?? ""] ?? tx.appointment_summary?.service}>
                                {SERVICE_LABELS[tx.appointment_summary?.service ?? ""] ?? (tx.appointment_summary?.service ?? "—")}
                              </span>
                            </td>
                            <td className="max-w-[160px] px-3 py-3 text-sm font-medium text-foreground/95">
                              <span className="line-clamp-2" title={getPaymentTransactionBarberLabel(tx)}>
                                {getPaymentTransactionBarberLabel(tx)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-accent">
                              R$ {valorServico.toFixed(2)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getPaymentFormaPillClass(tx)}`}
                              >
                                {formaCode === "dinheiro" ? (
                                  <Banknote className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                ) : formaCode === "pix" ? (
                                  <QrCode className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                ) : formaCode === "mercado_pago" ? (
                                  <CreditCard className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                ) : formaCode === "pacote" ||
                                  Boolean((tx.raw_payload as { package_session?: boolean } | null)?.package_session) ? (
                                  <Package className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                ) : (
                                  <DollarSign className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                )}
                                <span className="truncate">{formaLabel}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getPaymentTransactionStatusBadgeClass(tx.status)}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-3 py-3 pr-4">
                              <span
                                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${getPaymentProviderPillClass(tx)}`}
                              >
                                <span className="truncate">{providerLabel}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {paymentTransactionsFiltered.length > 0 ? (
                  <ListPaginationBar
                    showingCount={paymentTransactionsListPagination.showingCount}
                    totalCount={paymentTransactionsFiltered.length}
                    pageSize={paymentTransactionsListPagination.pageSize}
                    page={paymentTransactionsListPagination.page}
                    totalPages={paymentTransactionsListPagination.totalPages}
                    visiblePages={paymentTransactionsListPagination.visiblePages}
                    onPageChange={paymentTransactionsListPagination.setPage}
                    itemLabel="transações"
                  />
                ) : null}
              </div>

              <div className="premium-glass-card border border-border rounded-xl p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">Eventos de notificação</h3>
                    <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                      Histórico de e-mails e WhatsApp (agendamentos, pagamentos, pacotes). Status em destaque para leitura rápida.
                    </p>
                  </div>
                  <Select value={notificationStatusFilter} onValueChange={setNotificationStatusFilter}>
                    <SelectTrigger className="w-full md:w-[220px] rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                      <SelectValue placeholder="Status notificação" />
                    </SelectTrigger>
                    <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                      <SelectItem value="all">Todos status</SelectItem>
                      {notificationStatusOptions.map((statusKey) => (
                        <SelectItem key={`notification-status-${statusKey}`} value={statusKey}>
                          {getNotificationStatusLabel(statusKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/50 bg-black/20">
                  <table className="w-full min-w-[860px] text-left">
                    <thead>
                      <tr className="border-b border-border/60 bg-black/35 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="whitespace-nowrap px-3 py-3 pl-4">Data</th>
                        <th className="whitespace-nowrap px-3 py-3">Canal</th>
                        <th className="min-w-[200px] px-3 py-3">Evento</th>
                        <th className="whitespace-nowrap px-3 py-3">Cliente</th>
                        <th className="min-w-[180px] px-3 py-3">Destino</th>
                        <th className="whitespace-nowrap px-3 py-3 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {notificationEventsFiltered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Nenhum evento de notificação encontrado.
                          </td>
                        </tr>
                      )}
                      {pagedNotificationEvents.map((event) => {
                        const { date, time } = formatNotificationEventDateParts(event.created_at);
                        const ch = String(event.channel || "").toLowerCase();
                        const isEmail = ch === "email";
                        const statusLabel = getNotificationStatusLabel(event.status) || event.status_display;
                        return (
                          <tr key={event.id} className="align-top transition-colors hover:bg-white/[0.03]">
                            <td className="whitespace-nowrap px-3 py-3 pl-4 text-sm tabular-nums text-foreground/95">
                              <div className="flex items-start gap-2">
                                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/70" aria-hidden />
                                <div>
                                  <div className="font-medium capitalize leading-tight">{date}</div>
                                  {time ? <div className="text-xs text-muted-foreground">{time}</div> : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                  isEmail
                                    ? "border-sky-500/35 bg-sky-500/10 text-sky-100"
                                    : "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                                }`}
                              >
                                {isEmail ? (
                                  <Mail className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                ) : (
                                  <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                )}
                                <span className="truncate">{event.channel_display}</span>
                              </span>
                            </td>
                            <td className="max-w-[min(280px,32vw)] px-3 py-3 text-sm leading-snug text-foreground/95">
                              <span className="line-clamp-2" title={getNotificationEventLabel(event.event_type)}>
                                {getNotificationEventLabel(event.event_type)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-foreground">
                              {event.appointment_summary?.name ?? "—"}
                            </td>
                            <td className="max-w-[220px] px-3 py-3 text-xs text-muted-foreground sm:text-sm">
                              <span className="block truncate font-mono" title={event.recipient || undefined}>
                                {event.recipient?.trim() ? event.recipient : "—"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 pr-4">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getNotificationStatusBadgeClass(event.status)}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {notificationEventsFiltered.length > 0 ? (
                  <ListPaginationBar
                    showingCount={notificationListPagination.showingCount}
                    totalCount={notificationEventsFiltered.length}
                    pageSize={notificationListPagination.pageSize}
                    page={notificationListPagination.page}
                    totalPages={notificationListPagination.totalPages}
                    visiblePages={notificationListPagination.visiblePages}
                    onPageChange={notificationListPagination.setPage}
                    itemLabel="eventos"
                  />
                ) : null}
              </div>
            </motion.div>
          )}

          {editingClientPackage && clientPackageForm && typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4 sm:p-6">
              <div className="premium-glass-card w-full max-w-2xl rounded-xl border border-border bg-background p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold">Editar pacote</h3>
                    <p className="text-sm text-muted-foreground">Esse pacote é usado na Home, Pacotes e Minha Conta.</p>
                  </div>
                  <button
                    onClick={handleCloseEditClientPackage}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Fechar edição de pacote"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2 text-sm">
                    <span>Nome</span>
                    <input
                      type="text"
                      value={clientPackageForm.name}
                      onChange={(e) => setClientPackageForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Preço (R$)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={clientPackageForm.price}
                      onChange={(e) => setClientPackageForm((prev) => (prev ? { ...prev, price: e.target.value } : prev))}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Sessões</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={clientPackageForm.sessions_unlimited}
                      value={clientPackageForm.sessions}
                      onChange={(e) => setClientPackageForm((prev) => (prev ? { ...prev, sessions: e.target.value } : prev))}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Validade (dias)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={clientPackageForm.validity_days}
                      onChange={(e) => setClientPackageForm((prev) => (prev ? { ...prev, validity_days: e.target.value } : prev))}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={clientPackageForm.sessions_unlimited}
                      onChange={(e) =>
                        setClientPackageForm((prev) =>
                          prev ? { ...prev, sessions_unlimited: e.target.checked } : prev,
                        )
                      }
                      className="h-4 w-4 rounded border-border/70 bg-background/60 accent-accent"
                    />
                    Sessões ilimitadas (na vigência do plano)
                  </label>
                  <label className="block space-y-2 text-sm sm:col-span-2">
                    <span>Descrição</span>
                    <textarea
                      value={clientPackageForm.description}
                      onChange={(e) => setClientPackageForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                      rows={3}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={clientPackageForm.is_active}
                      onChange={(e) => setClientPackageForm((prev) => (prev ? { ...prev, is_active: e.target.checked } : prev))}
                      className="h-4 w-4 rounded border-border/70 bg-background/60 accent-accent"
                    />
                    Pacote ativo
                  </label>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={handleCloseEditClientPackage} disabled={isSavingClientPackage}>
                    Cancelar
                  </Button>
                  <Button variant="accentOutline" onClick={() => void handleSaveClientPackage()} isLoading={isSavingClientPackage}>
                    Salvar pacote
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )}

          {showCreateModal && typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 sm:p-6">
              <div className="premium-glass-card w-full max-w-2xl rounded-xl border border-border bg-background p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-2xl font-semibold">Novo Agendamento</h3>
                    <p className="text-sm text-muted-foreground">Cadastre um agendamento diretamente pelo perfil admin.</p>
                  </div>
                  <button
                    onClick={handleCloseCreateModal}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Fechar criação"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2 text-sm">
                    <span>Cliente</span>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Email</span>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Telefone</span>
                    <input
                      type="text"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Data</span>
                    <Popover open={isCreateDatePickerOpen} onOpenChange={setIsCreateDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full rounded-xl border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-2 text-left text-sm text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] transition-all hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className={createForm.date ? "" : "text-muted-foreground"}>
                              {createForm.date ? formatISODatePtBR(createForm.date) : "Selecione uma data"}
                            </span>
                            <Calendar className="h-4 w-4 text-accent/80" />
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-auto rounded-xl border-accent/25 bg-gradient-to-b from-zinc-950 to-zinc-900 p-3 shadow-[0_24px_60px_-24px_rgba(212,175,55,0.55)]"
                      >
                        <UiCalendar
                          mode="single"
                          selected={parseISODate(createForm.date)}
                          onSelect={(date) => {
                            if (!date) return;
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, "0");
                            const d = String(date.getDate()).padStart(2, "0");
                            setCreateForm({ ...createForm, date: `${y}-${m}-${d}` });
                            setIsCreateDatePickerOpen(false);
                          }}
                          disabled={{ before: new Date(todayLocalISODate()) }}
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
                              setCreateForm({ ...createForm, date: todayLocalISODate() });
                              setIsCreateDatePickerOpen(false);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Hoje
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCreateForm({ ...createForm, date: "" });
                              setIsCreateDatePickerOpen(false);
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
                    <span>Serviço</span>
                    <Select
                      value={createForm.service}
                      onValueChange={(value) => setCreateForm({ ...createForm, service: value })}
                    >
                      <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                        <SelectValue placeholder="Selecione serviço" />
                      </SelectTrigger>
                      <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                        {Object.entries(SERVICE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Barbeiro</span>
                    <Select
                      value={createForm.barber}
                      onValueChange={(value) => setCreateForm({ ...createForm, barber: value })}
                    >
                      <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                        <SelectValue placeholder="Selecione barbeiro" />
                      </SelectTrigger>
                      <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                        {availableBarbers.map((barber) => (
                          <SelectItem key={barber.key} value={barber.key}>
                            {barber.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span>Horário</span>
                    <Select
                      value={createForm.time}
                      onValueChange={(value) => setCreateForm({ ...createForm, time: value })}
                    >
                      <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                        <SelectValue placeholder="Selecione horário" />
                      </SelectTrigger>
                      <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                        {availableTimes.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block space-y-2 text-sm sm:col-span-2">
                    <span>Status</span>
                    <Select
                      value={createForm.status}
                      onValueChange={(value) => setCreateForm({ ...createForm, status: value as AppointmentStatus })}
                    >
                      <SelectTrigger className="w-full rounded-xl border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                        <SelectValue placeholder="Selecione status" />
                      </SelectTrigger>
                      <SelectContent className="border-accent/30 bg-zinc-950 text-foreground">
                        <SelectItem value="agendado">Agendado</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_atendimento">Em atendimento</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={handleCloseCreateModal} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <Button
                    variant="accentOutline"
                    onClick={handleCreateAppointment}
                    className="w-full sm:w-auto"
                    disabled={isSavingAppointment}
                  >
                    {isSavingAppointment ? "Salvando..." : "Criar agendamento"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )}

          <AlertDialog open={showExportDialog} onOpenChange={setShowExportDialog}>
            <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
              <AlertDialogHeader>
                <AlertDialogTitle className="tracking-tight">Exportar relatório em PDF</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Documento na identidade visual Demo, com o período e filtros da aba Relatórios. Escolha o layout da
                  tabela.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <AlertDialogCancel className="border-border bg-background text-foreground hover:bg-muted/50">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleExport("executivo")}
                  className="bg-accent/80 text-accent-foreground hover:bg-accent"
                >
                  Executivo
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => handleExport("detalhado")}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Detalhado
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>

      </div>
    </div>
  );
}
