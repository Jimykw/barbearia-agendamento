import { motion } from "motion/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LOGIN_PATH, loginLocationState, setLoginIntent } from "@/lib/authRoutes";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, Scissors } from "lucide-react";
import { API_URL } from "@/services/api";
import { Button } from "@/app/components/ui/button";

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const hasToken = Boolean(uid && token);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!hasToken) {
      setError("Link inválido ou incompleto.");
      return;
    }
    if (newPassword.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/password/reset/confirm/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          token,
          new_password: newPassword,
          new_password_confirm: confirmPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          typeof data?.detail === "string"
            ? data.detail
            : "Não foi possível redefinir sua senha.",
        );
        return;
      }
      setSuccess("Senha redefinida com sucesso. Redirecionando para o login...");
      setTimeout(() => {
        setLoginIntent();
        navigate(LOGIN_PATH, { state: loginLocationState });
      }, 1200);
    } catch {
      setError("Não foi possível redefinir sua senha.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-73px)] bg-background flex items-center justify-center py-12 px-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,175,55,0.18),transparent_45%),radial-gradient(circle_at_85%_5%,rgba(255,255,255,0.08),transparent_35%)]" />
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="mx-auto mb-6 flex w-fit flex-col items-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/45 bg-gradient-to-b from-accent/20 to-accent/5 shadow-[0_14px_34px_-18px_rgba(212,175,55,0.85)]">
              <Scissors className="w-7 h-7 text-accent" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl mb-2 tracking-tight">Redefinir senha</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Digite sua nova senha para concluir a recuperação.
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-border/80 bg-card/85 p-6 sm:p-7 backdrop-blur-sm shadow-[0_20px_55px_-30px_rgba(0,0,0,0.85)]"
        >
          {!hasToken && (
            <div className="rounded-xl p-4 bg-destructive/10 border border-destructive text-destructive flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5" />
              Link inválido ou expirado. Solicite uma nova recuperação.
            </div>
          )}

          {error && (
            <div className="rounded-xl p-4 bg-destructive/10 border border-destructive text-destructive flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {success && <p className="text-sm text-accent text-center">{success}</p>}

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <Lock className="w-5 h-5 text-accent" />
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading || !hasToken}
                className="w-full rounded-xl px-4 py-3 pr-12 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Mínimo 8 caracteres"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isLoading || !hasToken}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block mb-2 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-accent" />
              Confirmar nova senha
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading || !hasToken}
                className="w-full rounded-xl px-4 py-3 pr-12 bg-input-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Repita a nova senha"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                disabled={isLoading || !hasToken}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isLoading || !hasToken}
            isLoading={isLoading}
            className="w-full rounded-xl py-6 text-base shadow-[0_14px_30px_-18px_rgba(212,175,55,0.85)]"
          >
            Redefinir senha
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <Link to="/recuperar-senha" className="text-accent hover:underline">
              Solicitar novo link
            </Link>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
