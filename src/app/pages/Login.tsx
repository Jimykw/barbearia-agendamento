import { motion } from "motion/react";
import { Link, useNavigate } from "react-router";
import { HOME_PATH, clearLoginIntent } from "@/lib/authRoutes";
import { useState, useEffect, useRef } from "react";
import { Mail, Lock, Scissors, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { API_URL } from "@/services/api";
import { Button } from "@/app/components/ui/button";

export default function Login() {
  const [formData, setFormData] = useState({
    username: "",
    senha: ""
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submitLockRef = useRef(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  /** Pré-aquecimento leve do worker (cold start Render); não autentica, sem dados sensíveis. */
  useEffect(() => {
    const ac = new AbortController();
    const healthUrl = `${API_URL.replace(/\/+$/, "")}/api/health/`;
    void fetch(healthUrl, {
      method: "GET",
      signal: ac.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).catch(() => {
      /* ignorar — só tentativa de acordar o serviço */
    });
    return () => ac.abort();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || isLoading) {
      return;
    }
    if (!formData.username.trim() || !formData.senha) {
      setError("Preencha usuário ou e-mail e senha.");
      return;
    }

    submitLockRef.current = true;
    setIsLoading(true);
    setError("");

    try {
      await login(formData.username.trim(), formData.senha);
      clearLoginIntent();
      navigate(HOME_PATH, { replace: true });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao autenticar.");
    } finally {
      setIsLoading(false);
      submitLockRef.current = false;
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
          <h1 className="text-3xl sm:text-4xl md:text-5xl mb-2 tracking-tight">Bem-vindo de volta</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Entre com sua conta para continuar.</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          aria-busy={isLoading}
          className="space-y-6 rounded-2xl border border-border/80 bg-card/85 p-6 sm:p-7 backdrop-blur-sm shadow-[0_20px_55px_-30px_rgba(0,0,0,0.85)]"
        >
          {error && (
            <div className="rounded-xl p-4 bg-destructive/10 border border-destructive text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-accent" />
              Usuário ou E-mail
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              disabled={isLoading}
              className="w-full rounded-xl px-4 py-3 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Digite seu usuário ou e-mail"
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
                disabled={isLoading}
                className="w-full rounded-xl px-4 py-3 pr-12 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
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

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border/70 bg-background/60 accent-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
              />
              <span className="text-muted-foreground">Lembrar de mim</span>
            </label>
            <Link to="/recuperar-senha" className="text-accent hover:underline">
              Esqueceu a senha?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            isLoading={isLoading}
            className="w-full rounded-xl py-6 text-base shadow-[0_14px_30px_-18px_rgba(212,175,55,0.85)]"
          >
            {isLoading ? "Entrando..." : "Entrar"}
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
              Não tem uma conta?{" "}
              <Link
                to="/cadastro"
                onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })}
                className="text-accent hover:underline"
              >
                Cadastre-se
              </Link>
            </p>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
