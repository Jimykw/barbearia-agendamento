import { motion } from "motion/react";

export default function TermosUso() {
  return (
    <div className="bg-background py-24 pb-14">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="premium-glass-card rounded-2xl border border-border/80 bg-card/70 p-6 sm:p-8"
        >
          <h1 className="premium-title text-2xl sm:text-3xl tracking-tight">Termos de Serviço</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>

          <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="text-foreground text-base font-semibold">1. Objeto</h2>
              <p>
                Estes termos regulam o uso da plataforma da Barbearia Demo para agendamentos, contratação de
                pacotes e relacionamento comercial entre clientes e a barbearia.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">2. Cadastro e conta</h2>
              <p>
                O usuário se compromete a fornecer dados verdadeiros e manter suas informações atualizadas. O acesso
                é pessoal e intransferível.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">3. Agendamentos e cancelamentos</h2>
              <p>
                Os horários estão sujeitos à disponibilidade. Reagendamentos e cancelamentos devem respeitar as regras
                operacionais da barbearia e janelas mínimas de antecedência.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">4. Pagamentos e pacotes</h2>
              <p>
                Pagamentos podem ser processados por provedores terceiros. Pacotes possuem quantidade de sessões,
                validade e status. Sessões consumidas seguem a confirmação de atendimento na plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">5. Conduta e uso adequado</h2>
              <p>
                É vedado utilizar a plataforma para fraude, tentativa de invasão, envio de conteúdo ilícito ou
                qualquer prática que prejudique a operação da barbearia.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">6. Limitação de responsabilidade</h2>
              <p>
                A barbearia não se responsabiliza por indisponibilidades temporárias causadas por terceiros,
                manutenção, falhas de internet ou eventos fora de controle razoável.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">7. Alterações dos termos</h2>
              <p>
                Estes termos podem ser atualizados periodicamente para adequação legal, operacional e comercial.
                Recomenda-se leitura recorrente.
              </p>
            </section>

            <section>
              <h2 className="text-foreground text-base font-semibold">8. Contato</h2>
              <p>
                Para dúvidas sobre estes termos, entre em contato pelos canais oficiais da Barbearia Demo.
              </p>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
