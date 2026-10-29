import type { ComponentType } from "react";
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "./utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

export type AppointmentStatusKey =
  | "confirmado"
  | "agendado"
  | "pendente"
  | "em_atendimento"
  | "concluido"
  | "cancelado";

type StatusMeta = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
  selectClassName: string;
  iconClass?: string;
};

export const STATUS_META: Record<AppointmentStatusKey, StatusMeta> = {
  confirmado: {
    label: "Confirmado",
    icon: CheckCircle,
    className: "border-accent text-accent bg-accent/10",
    selectClassName: "border-accent text-accent bg-accent/10 focus:ring-accent/30",
  },
  agendado: {
    label: "Agendado",
    icon: CalendarCheck,
    className: "border-accent text-accent bg-accent/10",
    selectClassName: "border-accent text-accent bg-accent/10 focus:ring-accent/30",
  },
  pendente: {
    label: "Pendente",
    icon: AlertCircle,
    className: "border-muted-foreground/60 text-muted-foreground bg-muted/20",
    selectClassName:
      "border-muted-foreground/60 text-muted-foreground bg-muted/20 focus:ring-muted-foreground/30",
  },
  em_atendimento: {
    label: "Em atendimento",
    icon: Sparkles,
    className: "border-accent text-accent bg-accent/10",
    selectClassName: "border-accent text-accent bg-accent/10 focus:ring-accent/30",
    iconClass: "animate-pulse",
  },
  concluido: {
    label: "Concluído",
    icon: CheckCircle,
    className: "border-emerald-500 text-emerald-400 bg-emerald-500/10",
    selectClassName:
      "border-emerald-500 text-emerald-400 bg-emerald-500/10 focus:ring-emerald-500/30",
  },
  cancelado: {
    label: "Cancelado",
    icon: XCircle,
    className: "border-destructive text-destructive bg-destructive/10",
    selectClassName:
      "border-destructive text-destructive bg-destructive/10 focus:ring-destructive/30",
  },
};

const FALLBACK_KEY: AppointmentStatusKey = "pendente";

function normalizeStatus(status?: string | null): AppointmentStatusKey {
  const cleaned = String(status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return (cleaned in STATUS_META ? cleaned : FALLBACK_KEY) as AppointmentStatusKey;
}

export function getStatusMeta(status?: string | null) {
  return STATUS_META[normalizeStatus(status)];
}

export type StatusBadgeSize = "sm" | "md";

const SIZE_CLASSES: Record<StatusBadgeSize, string> = {
  sm: "gap-1.5 px-2.5 py-1 text-xs",
  md: "gap-2 px-3 py-1.5 text-sm",
};

const ICON_SIZE_CLASSES: Record<StatusBadgeSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
};

type StatusBadgeProps = {
  status?: string | null;
  size?: StatusBadgeSize;
  className?: string;
};

export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
        SIZE_CLASSES[size],
        meta.className,
        className,
      )}
    >
      <Icon className={cn(ICON_SIZE_CLASSES[size], "shrink-0", meta.iconClass)} />
      {meta.label}
    </span>
  );
}

type StatusSelectProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "value" | "onChange"
> & {
  value: AppointmentStatusKey;
  onValueChange: (value: AppointmentStatusKey) => void;
  size?: StatusBadgeSize;
  options?: AppointmentStatusKey[];
};

const DEFAULT_OPTIONS: AppointmentStatusKey[] = [
  "agendado",
  "confirmado",
  "pendente",
  "em_atendimento",
  "concluido",
  "cancelado",
];

export function StatusSelect({
  value,
  onValueChange,
  size = "md",
  options = DEFAULT_OPTIONS,
  className,
  disabled,
  ...rest
}: StatusSelectProps) {
  const meta = getStatusMeta(value);
  const Icon = meta.icon;

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as AppointmentStatusKey)} disabled={disabled}>
      <SelectTrigger
        size={size === "sm" ? "sm" : "default"}
        className={cn(
          "w-auto rounded-full border font-medium shadow-[0_0_0_0_rgba(0,0,0,0)]",
          SIZE_CLASSES[size],
          meta.selectClassName,
          className,
        )}
        {...rest}
      >
        <SelectValue>
          <span className="inline-flex items-center gap-2">
            <Icon className={cn(ICON_SIZE_CLASSES[size], "shrink-0", meta.iconClass)} />
            <span className="whitespace-nowrap">{meta.label}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="border-border bg-popover/95 backdrop-blur-xl">
        {options.map((option) => {
          const opt = STATUS_META[option];
          const OptIcon = opt.icon;
          return (
            <SelectItem key={option} value={option} className="cursor-pointer">
              <span className="inline-flex items-center gap-2">
                <OptIcon className={cn("w-4 h-4", opt.iconClass, option === "cancelado" && "text-destructive")} />
                <span>{opt.label}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
