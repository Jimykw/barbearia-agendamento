import React, { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import './BillingDashboard.css';
import { usePagination } from "@/app/hooks/usePagination";
import { ListPaginationBar } from "@/app/components/ListPaginationBar";

interface BillingData {
  id: number;
  user: number;
  month: string;
  total_cost: number;
  status: string;
  status_display: string;
  due_date: string;
  paid_at: string | null;
  usage_details: Record<string, any>;
}

interface SubscriptionPlan {
  id: number;
  slug: string;
  name: string;
  monthly_price: string;
  yearly_price: string;
  max_barbers: number;
  max_monthly_appointments: number;
  features: string[];
}

interface SiteSubscription {
  id: number;
  status: string;
  status_display: string;
  billing_cycle: string;
  billing_cycle_display: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plan?: SubscriptionPlan | null;
}

export function BillingDashboard() {
  const [billings, setBillings] = useState<BillingData[]>([]);
  const [currentMonth, setCurrentMonth] = useState<BillingData | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<SiteSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Carrega fatura do mês atual
      const currentResponse = await api.get('/api/billing/current_month/');
      setCurrentMonth(currentResponse.data);

      // Carrega todas as faturas
      const allResponse = await api.get('/api/billing/');
      setBillings(allResponse.data);

      // Carrega planos e assinatura atual
      const [plansResponse, subscriptionResponse] = await Promise.all([
        api.get('/api/subscription/plans/'),
        api.get('/api/subscription/current/'),
      ]);
      setPlans(Array.isArray(plansResponse.data) ? plansResponse.data : []);
      setSubscription(subscriptionResponse.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar faturamento');
      console.error('Erro ao carregar faturamento:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: '#FFA500',
      paid: '#32CD32',
      overdue: '#DC143C',
    };
    return colors[status] || '#808080';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const usageRows = useMemo(
    () => Object.entries(currentMonth?.usage_details ?? {}),
    [currentMonth],
  );
  const billingsIdsKey = useMemo(() => billings.map((b) => b.id).join(","), [billings]);
  const plansIdsKey = useMemo(() => plans.map((p) => p.id).join(","), [plans]);

  const usagePagination = usePagination({
    totalCount: usageRows.length,
    resetDeps: currentMonth?.id ?? currentMonth?.month ?? "",
  });
  const pagedUsageRows = useMemo(
    () => usageRows.slice(usagePagination.sliceRange.start, usagePagination.sliceRange.end),
    [usageRows, usagePagination.sliceRange],
  );

  const billingsPagination = usePagination({
    totalCount: billings.length,
    resetDeps: billingsIdsKey,
  });
  const pagedBillings = useMemo(
    () => billings.slice(billingsPagination.sliceRange.start, billingsPagination.sliceRange.end),
    [billings, billingsPagination.sliceRange],
  );

  const plansPagination = usePagination({
    totalCount: plans.length,
    resetDeps: plansIdsKey,
  });
  const pagedPlans = useMemo(
    () => plans.slice(plansPagination.sliceRange.start, plansPagination.sliceRange.end),
    [plans, plansPagination.sliceRange],
  );

  if (loading) {
    return (
      <div className="billing-dashboard loading">
        <p>Carregando dados de faturamento...</p>
      </div>
    );
  }

  return (
    <div className="billing-dashboard-container">
      <h1>Faturamento e Gastos</h1>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {subscription && (
        <div className="current-month-card">
          <h2>Assinatura do Sistema</h2>
          <div className="month-header">
            <div className="month-info">
              <p className="month-label">{subscription.plan?.name ?? 'Sem plano ativo'}</p>
              <p className="total-cost">Status: {subscription.status_display}</p>
              <p className="due-date">Ciclo: {subscription.billing_cycle_display}</p>
            </div>
            <div className="month-status" style={{ backgroundColor: subscription.status === 'active' ? '#32CD32' : subscription.status === 'trial' ? '#1e90ff' : '#DC143C' }}>
              <span>{subscription.status_display}</span>
              {subscription.current_period_end && (
                <p className="due-date">Vigente até: {formatDate(subscription.current_period_end)}</p>
              )}
              {!subscription.current_period_end && subscription.trial_ends_at && (
                <p className="due-date">Trial até: {formatDate(subscription.trial_ends_at)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card do Mês Atual */}
      {currentMonth && (
        <div className="current-month-card">
          <h2>Fatura do Mês Atual</h2>
          <div className="month-header">
            <div className="month-info">
              <p className="month-label">{new Date(currentMonth.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
              <p className="total-cost">{formatCurrency(currentMonth.total_cost)}</p>
            </div>
            <div className="month-status" style={{ backgroundColor: getStatusColor(currentMonth.status) }}>
              <span>{currentMonth.status_display}</span>
              {currentMonth.due_date && (
                <p className="due-date">Vencimento: {formatDate(currentMonth.due_date)}</p>
              )}
            </div>
          </div>

          {/* Detalhes de Uso */}
          {Object.keys(currentMonth.usage_details).length > 0 && (
            <div className="usage-details">
              <h3>Detalhamento de Uso</h3>
              <table>
                <thead>
                  <tr>
                    <th>Ação</th>
                    <th>Quantidade</th>
                    <th>Custo Unitário</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsageRows.map(([key, value]: [string, any]) => (
                    <tr key={key}>
                      <td>{key.replace(/_/g, ' ').toUpperCase()}</td>
                      <td>{value.count}</td>
                      <td>{formatCurrency(parseFloat(value.cost_per_action))}</td>
                      <td className="total-cell">{formatCurrency(parseFloat(value.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ListPaginationBar
                showingCount={usagePagination.showingCount}
                totalCount={usageRows.length}
                pageSize={usagePagination.pageSize}
                page={usagePagination.page}
                totalPages={usagePagination.totalPages}
                visiblePages={usagePagination.visiblePages}
                onPageChange={usagePagination.setPage}
                itemLabel="linhas de uso"
              />
            </div>
          )}
        </div>
      )}

      {/* Histórico de Faturas */}
      <div className="billing-history">
        <h2>Histórico de Faturas</h2>
        {billings.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma fatura encontrada</p>
          </div>
        ) : (
          <>
          <div className="billing-cards">
            {pagedBillings.map((billing) => (
              <div key={billing.id} className="billing-card">
                <div className="billing-header">
                  <div className="billing-month">
                    {new Date(billing.month).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                  </div>
                  <div className="billing-amount">{formatCurrency(billing.total_cost)}</div>
                </div>
                <div className="billing-status" style={{ backgroundColor: getStatusColor(billing.status) }}>
                  {billing.status_display}
                </div>
                {billing.due_date && (
                  <div className="billing-due">
                    Vencimento: {formatDate(billing.due_date)}
                  </div>
                )}
                {billing.paid_at && (
                  <div className="billing-paid">
                    Pago em: {formatDate(billing.paid_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <ListPaginationBar
            showingCount={billingsPagination.showingCount}
            totalCount={billings.length}
            pageSize={billingsPagination.pageSize}
            page={billingsPagination.page}
            totalPages={billingsPagination.totalPages}
            visiblePages={billingsPagination.visiblePages}
            onPageChange={billingsPagination.setPage}
            itemLabel="faturas"
          />
          </>
        )}
      </div>

      <div className="billing-history">
        <h2>Planos Disponíveis</h2>
        {plans.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum plano disponível no momento.</p>
          </div>
        ) : (
          <>
          <div className="billing-cards">
            {pagedPlans.map((plan) => (
              <div key={plan.id} className="billing-card">
                <div className="billing-header">
                  <div className="billing-month">{plan.name}</div>
                  <div className="billing-amount">{formatCurrency(Number(plan.monthly_price))}/mês</div>
                </div>
                <div className="billing-due">Anual: {formatCurrency(Number(plan.yearly_price))}</div>
                <div className="billing-due">Barbeiros: até {plan.max_barbers}</div>
                <div className="billing-due">Agendamentos/mês: {plan.max_monthly_appointments}</div>
              </div>
            ))}
          </div>
          <ListPaginationBar
            showingCount={plansPagination.showingCount}
            totalCount={plans.length}
            pageSize={plansPagination.pageSize}
            page={plansPagination.page}
            totalPages={plansPagination.totalPages}
            visiblePages={plansPagination.visiblePages}
            onPageChange={plansPagination.setPage}
            itemLabel="planos"
          />
          </>
        )}
      </div>

      {/* Resumo de Atividade */}
      <div className="activity-summary">
        <h2>Resumo de Uso</h2>
        <p className="info-text">
          Você está sendo cobrado por ações específicas no sistema. Quanto mais você utiliza o sistema, maior será seu custo.
        </p>
        <div className="actions-list">
          <div className="action-item">
            <span className="action-name">Criar Agendamento</span>
            <span className="action-note">Rastreado cada vez que você agenda um serviço</span>
          </div>
          <div className="action-item">
            <span className="action-name">Visualizar Agendamento</span>
            <span className="action-note">Rastreado quando você acessa detalhes de agendamentos</span>
          </div>
          <div className="action-item">
            <span className="action-name">Acessar Dashboard</span>
            <span className="action-note">Rastreado quando você acessa o dashboard</span>
          </div>
        </div>
      </div>

      <button className="refresh-btn" onClick={fetchBillingData} disabled={loading}>
        🔄 Atualizar Dados
      </button>
    </div>
  );
}
