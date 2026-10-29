import React from 'react';
import { BillingDashboard } from '@/app/components/BillingDashboard';
import './Faturamento.css';

export default function Faturamento() {
  return (
    <div className="faturamento-page">
      <div className="page-header">
        <h1>Faturamento e Gastos</h1>
        <p className="subtitle">Acompanhe seus gastos e faturas</p>
      </div>
      <BillingDashboard />
    </div>
  );
}
