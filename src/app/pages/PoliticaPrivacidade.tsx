import { motion } from "motion/react";

export default function PoliticaPrivacidade() {
  return (
    <div className="bg-background py-24 pb-14">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="premium-glass-card rounded-2xl border border-border/80 bg-card/70 p-6 sm:p-8"
        >
          <h1 className="premium-title text-2xl sm:text-3xl tracking-tight">Política de Privacidade</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>

          <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="text-foreground text-base font-semibold">1. Dados coletados</h2>
              <p>
                Coletamos dados de identificação e contato como nome, e-mail e telefone, além de dados operacionais
                ligados a agendamentos, pagamentos e notificações.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">2. Finalidade do tratamento</h2>
              <p>
                Os dados são utilizados para prestação do serviço, gestão de agenda, confirmação de atendimentos,
                comunicação com clientes e suporte administrativo/financeiro.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">3. Base legal (LGPD)</h2>
              <p>
                O tratamento ocorre com base na execução de contrato, legítimo interesse e cumprimento de obrigações
                legais, conforme aplicável.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">4. Compartilhamento</h2>
              <p>
                Poderá haver compartilhamento com provedores de pagamento, serviços de e-mail e APIs de mensageria,
                sempre limitado ao necessário para execução do serviço.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">5. Retenção e segurança</h2>
              <p>
                Os dados são mantidos pelo período necessário às finalidades informadas e protegidos por medidas
                técnicas e organizacionais razoáveis.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">6. Direitos do titular</h2>
              <p>
                O titular pode solicitar confirmação de tratamento, acesso, correção, anonimização/bloqueio,
                portabilidade e eliminação de dados, quando cabível.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">7. Contato para privacidade</h2>
              <p>
                Solicitações relacionadas à privacidade e proteção de dados podem ser encaminhadas pelos canais
                oficiais da Barbearia Demo.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
