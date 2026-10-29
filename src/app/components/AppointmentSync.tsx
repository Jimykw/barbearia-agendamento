import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppointmentSync } from "@/hooks/useAppointmentSync";
import { useAuth } from "@/app/context/AuthContext";
import { API_URL } from "@/services/api";
import { Button } from '@/app/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import './AppointmentSync.css';
import { usePagination } from "@/app/hooks/usePagination";
import { ListPaginationBar } from "@/app/components/ListPaginationBar";

interface Appointment {
  id: number;
  name: string;
  email: string;
  phone: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  status: string;
  closing_payment_display?: string;
  package_subscription?: number | null;
  package_close_available?: boolean;
  customer?: {
    id: number;
    username: string;
    first_name: string;
    email: string;
  };
}

export function AppointmentSync() {
  const { user, getAuthHeaders } = useAuth();
  const [activeFilter, setActiveFilter] = useState<'today' | 'upcoming' | 'all'>('today');
  const [finalizePaymentModalId, setFinalizePaymentModalId] = useState<number | null>(null);
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false);
  const [packageActiveByEmail, setPackageActiveByEmail] = useState<Record<string, string>>({});

  const {
    appointments,
    stats,
    loading,
    error,
    lastUpdate,
    refresh,
    updateStatus,
  } = useAppointmentSync({
    filter: activeFilter,
    autoRefresh: true,
    refreshInterval: 5000,
  });

  const isBarber = user?.role === "barbeiro";
  const isAdmin = user?.role === "admin";

  const fetchPackageCustomers = useCallback(async () => {
    const headers = getAuthHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`${API_URL}/api/client-packages/subscriptions/`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;
      const mapped: Record<string, string> = {};
      for (const item of data as Array<{ email?: string; status?: string; package?: { name?: string } }>) {
        const email = String(item.email || "").trim().toLowerCase();
        const status = String(item.status || "").trim().toLowerCase();
        if (!email || status !== "active") continue;
        mapped[email] = item.package?.name || "Cliente de pacote";
      }
      setPackageActiveByEmail(mapped);
    } catch {
      // ignore
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isBarber || isAdmin) void fetchPackageCustomers();
  }, [isBarber, isAdmin, fetchPackageCustomers]);

  const appointmentsIdsKey = useMemo(
    () => (appointments as Appointment[]).map((a) => a.id).join(","),
    [appointments],
  );
  const appointmentsListPagination = usePagination({
    totalCount: (appointments as Appointment[]).length,
    resetDeps: `${activeFilter}|${appointmentsIdsKey}`,
  });
  const pagedAppointments = useMemo(
    () =>
      (appointments as Appointment[]).slice(
        appointmentsListPagination.sliceRange.start,
        appointmentsListPagination.sliceRange.end,
      ),
    [appointments, appointmentsListPagination.sliceRange],
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pendente: '#FFA500',
      confirmado: '#4169E1',
      em_atendimento: '#FF6347',
      concluido: '#32CD32',
      cancelado: '#DC143C',
    };
    return colors[status] || '#808080';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pendente: 'Pendente',
      confirmado: 'Confirmado',
      em_atendimento: 'Em Atendimento',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
    };
    return labels[status] || status;
  };

  const handleStartService = async (appointmentId: number) => {
    try {
      await updateStatus(appointmentId, 'em_atendimento');
    } catch (error) {
      console.error('Erro ao iniciar serviço:', error);
    }
  };

  const handleCompleteService = (appointmentId: number) => {
    const apt = (appointments as Appointment[]).find((a) => a.id === appointmentId);
    const email = String(apt?.email || "")
      .trim()
      .toLowerCase();
    const linkedPackage =
      typeof apt?.package_subscription === "number" &&
      !Number.isNaN(apt.package_subscription) &&
      apt.package_subscription > 0;
    const apiSays = apt?.package_close_available;
    const canCloseWithPackage =
      typeof apiSays === "boolean"
        ? apiSays === true
        : linkedPackage || Boolean(email && packageActiveByEmail[email]);
    if (canCloseWithPackage) {
      void confirmCompleteWithPackage(appointmentId);
      return;
    }
    setFinalizePaymentModalId(appointmentId);
  };

  const confirmCompleteWithPackage = async (appointmentId: number) => {
    setFinalizeSubmitting(true);
    try {
      await updateStatus(appointmentId, "concluido");
      void fetchPackageCustomers();
    } catch (error) {
      console.error("Erro ao concluir serviço:", error);
    } finally {
      setFinalizeSubmitting(false);
    }
  };

  const confirmCompleteWithPayment = async (paymentMethod: "dinheiro" | "pix") => {
    if (finalizePaymentModalId === null) return;
    setFinalizeSubmitting(true);
    try {
      await updateStatus(finalizePaymentModalId, "concluido", paymentMethod);
      void fetchPackageCustomers();
      setFinalizePaymentModalId(null);
    } catch (error) {
      console.error("Erro ao concluir serviço:", error);
    } finally {
      setFinalizeSubmitting(false);
    }
  };

  if (loading && !appointments.length) {
    return (
      <div className="appointment-sync loading">
        <p>Carregando agendamentos...</p>
      </div>
    );
  }

  return (
    <div className="appointment-sync-container">
      {/* Header com Estatísticas */}
      {stats && (
        <div className="sync-stats-header">
          <div className="stat-card">
            <div className="stat-number">{stats.total_appointments}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="stat-card pending">
            <div className="stat-number">{stats.pending}</div>
            <div className="stat-label">Pendentes</div>
          </div>
          <div className="stat-card confirmed">
            <div className="stat-number">{stats.confirmed}</div>
            <div className="stat-label">Confirmados</div>
          </div>
          <div className="stat-card in-progress">
            <div className="stat-number">{stats.em_atendimento}</div>
            <div className="stat-label">Em Atendimento</div>
          </div>
          <div className="stat-card completed">
            <div className="stat-number">{stats.concluidos}</div>
            <div className="stat-label">Concluídos</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="sync-filters">
        <button
          className={`filter-btn ${activeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setActiveFilter('today')}
        >
          Hoje
        </button>
        <button
          className={`filter-btn ${activeFilter === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveFilter('upcoming')}
        >
          Próximos 7 dias
        </button>
        <button
          className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          Todos
        </button>
        <button className="refresh-btn" onClick={refresh} disabled={loading}>
          🔄 Atualizar
        </button>
      </div>

      {/* Última atualização */}
      {lastUpdate && (
        <div className="last-update">
          Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
        </div>
      )}

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Lista de Agendamentos */}
      <div className="appointments-list">
        {appointments.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum agendamento encontrado</p>
          </div>
        ) : (
          pagedAppointments.map((appointment: Appointment) => (
            <div key={appointment.id} className="appointment-card">
              <div className="appointment-header">
                <div className="appointment-info">
                  <h3>{appointment.name}</h3>
                  <p className="appointment-service">{appointment.service}</p>
                  <p className="appointment-datetime">
                    {new Date(appointment.date).toLocaleDateString('pt-BR')} às {appointment.time}
                  </p>
                </div>
                <div className="appointment-status" style={{ borderColor: getStatusColor(appointment.status) }}>
                  <span style={{ backgroundColor: getStatusColor(appointment.status) }}>
                    {getStatusLabel(appointment.status)}
                  </span>
                </div>
              </div>

              <div className="appointment-details">
                <div className="detail-item">
                  <span className="label">Cliente:</span>
                  <span>{appointment.customer?.first_name || appointment.name}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Email:</span>
                  <span>{appointment.email}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Telefone:</span>
                  <span>{appointment.phone}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Barbeiro:</span>
                  <span>{appointment.barber}</span>
                </div>
                {appointment.status === "concluido" && appointment.closing_payment_display ? (
                  <div className="detail-item">
                    <span className="label">Pagamento:</span>
                    <span>{appointment.closing_payment_display}</span>
                  </div>
                ) : null}
              </div>

              {/* Ações para Barbeiros/Admin */}
              {(isBarber || isAdmin) && (
                <div className="appointment-actions">
                  {appointment.status === 'pendente' && (
                    <button
                      className="btn-start"
                      onClick={() => handleStartService(appointment.id)}
                    >
                      ▶ Iniciar Atendimento
                    </button>
                  )}
                  {appointment.status === 'em_atendimento' && (
                    <button
                      className="btn-complete"
                      onClick={() => handleCompleteService(appointment.id)}
                    >
                      ✓ Concluir Atendimento
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        {(appointments as Appointment[]).length > 0 ? (
          <ListPaginationBar
            showingCount={appointmentsListPagination.showingCount}
            totalCount={(appointments as Appointment[]).length}
            pageSize={appointmentsListPagination.pageSize}
            page={appointmentsListPagination.page}
            totalPages={appointmentsListPagination.totalPages}
            visiblePages={appointmentsListPagination.visiblePages}
            onPageChange={appointmentsListPagination.setPage}
            itemLabel="agendamentos"
          />
        ) : null}
      </div>

      <AlertDialog
        open={finalizePaymentModalId !== null}
        onOpenChange={(open) => {
          if (!open && !finalizeSubmitting) setFinalizePaymentModalId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Como foi o pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha Dinheiro ou Pix. O registro aparece nas transações do admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel type="button" disabled={finalizeSubmitting} className="mt-0 w-full sm:w-auto">
              Voltar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="primary"
              className="w-full sm:w-auto"
              disabled={finalizeSubmitting}
              isLoading={finalizeSubmitting}
              onClick={() => void confirmCompleteWithPayment('dinheiro')}
            >
              Dinheiro
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-full sm:w-auto"
              disabled={finalizeSubmitting}
              isLoading={finalizeSubmitting}
              onClick={() => void confirmCompleteWithPayment('pix')}
            >
              Pix
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
