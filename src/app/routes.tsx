import { createBrowserRouter, Navigate } from "react-router";
import Root from "@/app/Root";
import Home from "@/app/pages/Home";
import Portfolio from "@/app/pages/Portfolio";
import PortfolioEditar from "@/app/pages/PortfolioEditar";
import Agendamento from "@/app/pages/Agendamento";
import AgendamentoSincronizado from "@/app/pages/AgendamentoSincronizado";
import LoginGate from "@/app/pages/LoginGate";
import { HOME_PATH } from "@/lib/authRoutes";
import RecuperarSenha from "@/app/pages/RecuperarSenha";
import RedefinirSenha from "@/app/pages/RedefinirSenha";
import Cadastro from "@/app/pages/Cadastro";
import Pacotes from "@/app/pages/Pacotes";
import TermosUso from "@/app/pages/TermosUso";
import PoliticaPrivacidade from "@/app/pages/PoliticaPrivacidade";
import Dashboard from "@/app/pages/Dashboard";
import MinhaConta from "@/app/pages/MinhaConta";
import Funcionario from "@/app/pages/Funcionario";
import Faturamento from "@/app/pages/Faturamento";

export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: Root,
      children: [
        { index: true, Component: Home },
        { path: "portfolio/editar", Component: PortfolioEditar },
        { path: "portfolio", Component: Portfolio },
        { path: "agendamento", Component: Agendamento },
        { path: "agendamentos-sync", Component: AgendamentoSincronizado },
        { path: "login", element: <Navigate to={HOME_PATH} replace /> },
        { path: "entrar", Component: LoginGate },
        { path: "recuperar-senha", Component: RecuperarSenha },
        { path: "redefinir-senha", Component: RedefinirSenha },
        { path: "cadastro", Component: Cadastro },
        { path: "pacotes", Component: Pacotes },
        { path: "termos-de-servico", Component: TermosUso },
        { path: "politica-de-privacidade", Component: PoliticaPrivacidade },
        { path: "dashboard", Component: Dashboard },
        { path: "minha-conta", Component: MinhaConta },
        { path: "funcionario", Component: Funcionario },
        { path: "faturamento", Component: Faturamento },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  }
);
