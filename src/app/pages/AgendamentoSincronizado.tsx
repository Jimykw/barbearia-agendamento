import React from 'react';
import { AppointmentSync } from '@/app/components/AppointmentSync';
import './AgendamentoSincronizado.css';

export default function AgendamentoSincronizado() {
  return (
    <div className="agendamento-sincronizado-page">
      <div className="page-header">
        <h1>Central de Agendamentos</h1>
        <p className="subtitle">Sincronização em tempo real com todos os usuários</p>
      </div>
      <AppointmentSync />
    </div>
  );
}
