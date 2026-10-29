import { motion } from "motion/react";
import { Link } from "react-router";
import { LOGIN_PATH, loginLocationState, setLoginIntent } from "@/lib/authRoutes";
import { useState } from "react";
import { KeyRound, Mail, Scissors } from "lucide-react";
import { API_URL } from "@/services/api";
import { Button } from "@/app/components/ui/button";

export default function RecuperarSenha() {
  const [identifier, setIdentifier] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestRecovery = async () => {
    const value = identifier.trim();
    if (!value) {
      setFeedback("Informe seu usuário ou e-mail para solicitar recuperação.");
      return;
    }

    setIsLoading(true);
    setFeedback("");

    try {
      const response = await fetch(`${API_URL}/api/auth/password/forgot/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier: value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback(
          typeof data?.detail === "string"
            ? data.detail
            : "Não foi possível processar sua solicitação agora.",
        );
        return;
      }
      setFeedback(
        "Se o usuário existir, você receberá por e-mail um link para redefinir sua senha.",
      );
    } catch {
      setFeedback("Não foi possível processar sua solicitação agora.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-73px)] bg-background flex items-center justify-center py-12 px-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,0.18),transparent_45%),radial-gradient(circle_at_85%_5%,rgba(255,255,255,0.08),transparent_35%)]" />
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="mx-auto mb-6 flex w-fit flex-col items-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/45 bg-gradient-to-b from-accent/20 to-accent/5 shadow-[0_14px_34px_-18px_rgba(212,175,55,0.85)]">
              <Scissors className="w-7 h-7 text-accent" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl mb-2 tracking-tight">Recuperar senha</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Informe seu usuário ou e-mail para solicitar a redefinição.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-5 rounded-2xl border border-border/80 bg-card/85 p-6 sm:p-7 backdrop-blur-sm shadow-[0_20px_55px_-30px_rgba(0,0,0,0.85)]"
        >
          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-accent" />
              Usuário ou E-mail
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-xl px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Digite seu usuário ou e-mail"
            />
          </div>

          <Button
            type="button"
            variant="primary"
            icon={KeyRound}
            onClick={() => void handleRequestRecovery()}
            disabled={isLoading}
            isLoading={isLoading}
            className="w-full rounded-xl py-6 text-base shadow-[0_14px_30px_-18px_rgba(212,175,55,0.85)]"
          >
            Enviar link de recuperação
          </Button>

          {feedback && (
            <p className="text-sm text-accent text-center">{feedback}</p>
          )}

          <div className="text-center text-sm text-muted-foreground">
            Lembrou a senha?{" "}
            <Link
              to={LOGIN_PATH}
              state={loginLocationState}
              onClick={() => setLoginIntent()}
              className="text-accent hover:underline"
            >
              Voltar para o login
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
