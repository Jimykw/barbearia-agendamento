import { motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import { LOGIN_PATH, loginLocationState, setLoginIntent } from "@/lib/authRoutes";
import { useState } from "react";
import { Mail, Lock, User, Phone, Scissors, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { API_URL } from "@/services/api";
import { Button } from "@/app/components/ui/button";

export default function Cadastro() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    senha: "",
    confirmarSenha: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (formData.senha !== formData.confirmarSenha) {
      setError("As senhas não coincidem");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.senha,
          first_name: formData.nome,
          phone: formData.telefone,
          role: "cliente",
        }),
      });

      if (response.ok) {
        setSuccessMessage("Conta criada com sucesso! Redirecionando para login...");
        setFormData({ nome: "", email: "", telefone: "", senha: "", confirmarSenha: "" });
        setTimeout(() => {
          setLoginIntent();
          navigate(LOGIN_PATH, { state: loginLocationState });
        }, 1400);
        return;
      }

      const data = await response.json();
      setError(
        data.non_field_errors?.[0] || data.detail || data.email?.[0] || data.password?.[0] || "Erro ao criar conta.",
      );
    } catch (err) {
      setError("Erro de conexão com o servidor. Verifique se o backend Django está rodando.");
    } finally {
      setIsSubmitting(false);
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
          <h1 className="text-3xl sm:text-4xl md:text-5xl mb-2 tracking-tight">Criar Conta</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Cadastre-se para agendar e gerenciar seus atendimentos.</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-border/80 bg-card/85 p-6 sm:p-7 backdrop-blur-sm shadow-[0_20px_55px_-30px_rgba(0,0,0,0.85)]"
        >
          {error && (
            <div className="rounded-xl p-4 bg-destructive/10 border border-destructive text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="rounded-xl p-4 bg-emerald-500/10 border border-emerald-500/50 text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <User className="w-5 h-5 text-accent" />
              Nome Completo
            </label>
            <input
              type="text"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              disabled={isSubmitting}
              className="w-full rounded-xl px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Seu nome"
              required
            />
          </div>

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-accent" />
              E-mail
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={isSubmitting}
              className="w-full rounded-xl px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Phone className="w-5 h-5 text-accent" />
              Telefone
            </label>
            <input
              type="tel"
              value={formData.telefone}
              onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              disabled={isSubmitting}
              className="w-full rounded-xl px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="(11) 99999-9999"
              required
            />
          </div>

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-accent" />
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={formData.senha}
                onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                disabled={isSubmitting}
                className="w-full rounded-xl px-4 py-3 pr-12 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isSubmitting}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-accent" />
              Confirmar Senha
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmarSenha}
                onChange={(e) => setFormData({ ...formData, confirmarSenha: e.target.value })}
                disabled={isSubmitting}
                className="w-full rounded-xl px-4 py-3 pr-12 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isSubmitting}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border/70 bg-background/60 accent-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
              required
              disabled={isSubmitting}
            />
            <label className="text-sm text-muted-foreground">
              Concordo com os{" "}
              <Link to="/termos-de-servico" className="text-accent hover:underline">
                Termos de Serviço
              </Link>{" "}
              e{" "}
              <Link to="/politica-de-privacidade" className="text-accent hover:underline">
                Política de Privacidade
              </Link>
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            isLoading={isSubmitting}
            className="w-full rounded-xl py-6 text-base shadow-[0_14px_30px_-18px_rgba(212,175,55,0.85)]"
          >
            Criar Conta
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">ou</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground">
              Já tem uma conta?{" "}
              <Link
                to={LOGIN_PATH}
                state={loginLocationState}
                onClick={() => {
                  setLoginIntent();
                  window.scrollTo({ top: 0, behavior: "instant" });
                }}
                className="text-accent hover:underline"
              >
                Faça login
              </Link>
            </p>
          </div>
        </motion.form>

        <div className="mt-6 rounded-2xl border border-border/80 bg-muted/5 p-4 text-sm text-muted-foreground">
          Seus dados são usados apenas para confirmar agendamentos e enviar avisos da Barbearia Demo.
        </div>
      </div>
    </div>
  );
}
