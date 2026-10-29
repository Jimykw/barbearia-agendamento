export type UiAppointmentStatus =
  | "agendado"
  | "pendente"
  | "confirmado"
  | "cancelado"
  | "em_atendimento"
  | "concluido";

export function toLocalDateTime(date: string, time: string) {
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

export function isAtLeast24HoursAhead(date: string, time: string) {
  const appointmentAt = toLocalDateTime(date, time);
  if (!appointmentAt) return false;
  return appointmentAt.getTime() - Date.now() >= 24 * 60 * 60 * 1000;
}

export function resolveOperationalStatus(
  status: string,
  date: string,
  time: string,
  opts?: { convertPastToPending?: boolean },
): UiAppointmentStatus {
  const normalized = String(status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_") as UiAppointmentStatus | "";

  if (normalized === "cancelado" || normalized === "concluido" || normalized === "em_atendimento") {
    return normalized;
  }

  const appointmentAt = toLocalDateTime(date, time);
  if (!appointmentAt) {
    return normalized || "confirmado";
  }

  const diffMs = appointmentAt.getTime() - Date.now();
  if (diffMs >= 24 * 60 * 60 * 1000) {
    return "agendado";
  }
  if (opts?.convertPastToPending !== false && diffMs < 0) {
    return "pendente";
  }
  if (normalized === "agendado" || !normalized) {
    return "confirmado";
  }
  return normalized;
}
