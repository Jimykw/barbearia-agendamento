/** Textos consistentes para pacotes e assinaturas (sessões limitadas vs ilimitadas). */

export function formatPackageSessionsLabel(sessions: number, sessionsUnlimited?: boolean): string {
  if (sessionsUnlimited) return "Sessões ilimitadas";
  const n = Math.max(0, Number(sessions) || 0);
  return n === 1 ? "1 sessão" : `${n} sessões`;
}

export function formatPackageSessionsShort(sessions: number, sessionsUnlimited?: boolean): string {
  if (sessionsUnlimited) return "Ilimitadas";
  const n = Math.max(0, Number(sessions) || 0);
  return `${n} sessões`;
}

export function formatSubscriptionSessionsProgress(sub: {
  sessions_used: number;
  sessions_total: number;
  sessions_unlimited?: boolean;
}): string {
  if (sub.sessions_unlimited) return "Ilimitado";
  return `${sub.sessions_used}/${sub.sessions_total}`;
}
