import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';

interface UseAppointmentSyncOptions {
  filter?: 'today' | 'upcoming' | 'all';
  statusFilter?: string;
  barberFilter?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useAppointmentSync(options: UseAppointmentSyncOptions = {}) {
  const {
    filter = 'all',
    autoRefresh = true,
    refreshInterval = 10000, // 10 segundos
  } = options;

  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let endpoint = '/api/appointments-sync/';

      if (filter === 'today') {
        endpoint += 'today/';
      } else if (filter === 'upcoming') {
        endpoint += 'upcoming/';
      }

      const response = await api.get(endpoint);
      setAppointments(response.data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos');
      console.error('Erro ao sincronizar agendamentos:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/api/appointments-sync/stats/');
      setStats(response.data);
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
    }
  }, []);

  const updateAppointmentStatus = useCallback(
    async (
      appointmentId: number,
      newStatus: string,
      paymentMethod?: "dinheiro" | "pix",
    ) => {
      try {
        const body: Record<string, string> = { status: newStatus };
        if (newStatus === "concluido" && paymentMethod) {
          body.payment_method = paymentMethod;
        }
        const response = await api.patch(`/api/appointments/${appointmentId}/`, body);

        setAppointments((prev) =>
          (prev as { id: number }[]).map((apt) =>
            apt.id === appointmentId ? response.data : apt,
          ),
        );

        await fetchStats();
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao atualizar status");
        throw err;
      }
    },
    [fetchStats],
  );

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    fetchAppointments();
    fetchStats();

    const interval = setInterval(() => {
      fetchAppointments();
      fetchStats();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchAppointments, fetchStats]);

  return {
    appointments,
    stats,
    loading,
    error,
    lastUpdate,
    refresh: fetchAppointments,
    updateStatus: updateAppointmentStatus,
  };
}
