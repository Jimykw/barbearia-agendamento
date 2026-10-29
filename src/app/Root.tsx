import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu,
  X,
  Scissors,
  User,
  LogOut,
  LayoutDashboard,
  Home,
  Image as ImageIcon,
  CalendarDays,
  Package,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useMemo, type ComponentType } from "react";
import ScrollToTop from "@/app/components/ScrollToTop";
import { API_URL } from "@/services/api";
import { LOGIN_PATH, loginLocationState, setLoginIntent } from "@/lib/authRoutes";
import { ClientPackageExpiryModal } from "@/app/components/ClientPackageExpiryModal";
import { AuthProvider, useAuth } from "@/app/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type Role = "admin" | "barbeiro" | "cliente";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  barbeiro: "Barbeiro",
  cliente: "Cliente",
};

function RootContent() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoading: authLoading } = useAuth();

  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_URL.replace(/\/+$/, "")}/api/demo/`, {
      signal: ac.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setDemoMode(Boolean(data?.demo_mode)))
      .catch(() => {
        /* sem demo: banner oculto */
      });
    return () => ac.abort();
  }, []);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const baseNavItems: NavItem[] = [
    { to: "/", label: "Início", icon: Home },
    { to: "/portfolio", label: "Portfolio", icon: ImageIcon },
    { to: "/pacotes", label: "Pacotes", icon: Package },
  ];
  const navItems: NavItem[] = useMemo(() => {
    if (user?.role === "barbeiro") {
      return baseNavItems;
    }
    return [...baseNavItems, { to: "/agendamento", label: "Agendamento", icon: CalendarDays }];
  }, [user?.role]);

  const roleArea: NavItem | null = user
    ? user.role === "admin"
      ? { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }
      : user.role === "barbeiro"
        ? { to: "/funcionario?tab=hoje", label: "Painel", icon: Scissors }
        : { to: "/minha-conta", label: "Minha Conta", icon: User }
    : null;

  const userInitial = user?.name?.trim()?.charAt(0)?.toUpperCase() ?? "?";

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await logout();
  };

  const scrollToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  useEffect(() => {
    const handleScroll = () => {
      if (menuOpen) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      window.addEventListener('scroll', handleScroll);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <ScrollToTop />
      <header className="fixed top-0 left-0 right-0 z-50 min-h-[73px] border-b border-accent/15 bg-black/70 backdrop-blur-xl supports-[backdrop-filter]:bg-black/60 shadow-[0_2px_24px_-12px_rgba(212,175,55,0.25)]">
        <nav className="mx-auto flex h-[73px] min-w-0 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          <Link
            to="/"
            onClick={scrollToTop}
            className="flex min-w-0 items-center gap-2 sm:gap-3 group shrink-0"
            aria-label="Barbearia Demo - Início"
          >
            <span className="relative flex shrink-0 items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-accent/55 bg-gradient-to-b from-accent/25 via-accent/10 to-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(0,0,0,0.35)] ring-1 ring-white/5 transition-all duration-300 group-hover:border-accent group-hover:shadow-[0_0_26px_-6px_rgba(212,175,55,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]">
              <Scissors className="w-[18px] h-[18px] sm:w-5 sm:h-5 text-accent drop-shadow-[0_0_10px_rgba(212,175,55,0.5)] transition-transform duration-500 group-hover:rotate-[-12deg]" />
            </span>
            <span className="hidden min-[400px]:inline-flex max-w-[44vw] sm:max-w-none flex-col items-start leading-tight [font-family:var(--font-heading),serif]">
              <span className="mb-0.5 flex items-center gap-2">
                <span className="h-px w-5 bg-gradient-to-r from-transparent via-accent to-accent/80 sm:w-7" aria-hidden />
                <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.24em] text-accent/95 sm:tracking-[0.26em]">
                  Experiência premium
                </span>
              </span>
              <span className="flex flex-wrap items-baseline tracking-[-0.02em] text-[15px] font-semibold leading-[1.05] sm:text-[1.125rem] xl:text-[1.35rem]">
                <span className="bg-gradient-to-r from-white via-white to-zinc-300 bg-clip-text text-transparent drop-shadow-[0_1px_14px_rgba(0,0,0,0.45)]">
                  Barbearia
                </span>
                <span className="ml-[0.14em] bg-gradient-to-r from-accent via-amber-200 to-accent bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.38)]">
                  Demo
                </span>
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="xl:hidden inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-md border border-border text-foreground hover:border-accent hover:text-accent transition-colors"
            aria-expanded={menuOpen}
            aria-controls="mobile-main-nav"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="hidden min-w-0 xl:flex xl:items-center xl:gap-0.5 2xl:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={scrollToTop}
                  className={`group relative inline-flex items-center gap-1.5 xl:gap-2 px-2 py-2 xl:px-3 text-xs xl:text-sm rounded-md transition-colors ${
                    active ? "text-accent" : "text-foreground hover:text-accent"
                  } hover:bg-accent/5`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                  <span>{item.label}</span>
                  <span
                    className={`pointer-events-none absolute inset-x-2 xl:inset-x-3 -bottom-px h-px bg-accent transition-transform duration-300 origin-left ${
                      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </Link>
              );
            })}

            <div className="min-w-0 flex shrink-0 justify-start">
              {roleArea ? (
                <Link
                  key={roleArea.to}
                  to={roleArea.to}
                  onClick={scrollToTop}
                  className={`group relative inline-flex items-center gap-1.5 xl:gap-2 px-2 py-2 xl:px-3 text-xs xl:text-sm rounded-md transition-colors ${
                    isActive(roleArea.to) ? "text-accent" : "text-foreground hover:text-accent"
                  } hover:bg-accent/5`}
                  aria-current={isActive(roleArea.to) ? "page" : undefined}
                >
                  <roleArea.icon className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                  <span className="whitespace-nowrap">{roleArea.label}</span>
                  <span
                    className={`pointer-events-none absolute inset-x-2 xl:inset-x-3 -bottom-px h-px bg-accent transition-transform duration-300 origin-left ${
                      isActive(roleArea.to) ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </Link>
              ) : authLoading ? (
                <div
                  aria-hidden
                  className="h-9 w-24 xl:w-[132px] rounded-md border border-border/60 bg-card/35 animate-pulse"
                />
              ) : null}
            </div>

            <span className="mx-1 hidden 2xl:block w-px h-6 shrink-0 bg-border" aria-hidden />

            <div className="flex shrink-0 justify-end xl:pl-1">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Conta de ${user.name}`}
                    className="group flex max-w-[min(196px,28vw)] xl:max-w-[196px] xl:w-[196px] min-w-0 items-center gap-1.5 xl:gap-3 pl-1 pr-1.5 xl:pr-3 py-1 rounded-full border border-border bg-card/40 hover:border-accent/60 hover:bg-card/80 transition-all data-[state=open]:border-accent data-[state=open]:bg-card data-[state=open]:shadow-[0_0_0_3px_rgba(212,175,55,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-foreground font-semibold text-sm shrink-0">
                      {userInitial}
                    </span>
                    <div className="hidden xl:flex flex-col leading-tight items-start min-w-0 flex-1">
                      <span className="text-sm text-foreground truncate w-full text-left">
                        {user.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-accent/80">
                        {ROLE_LABEL[user.role as Role] ?? "Usuário"}
                      </span>
                    </div>
                    <ChevronDown
                      className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                      aria-hidden
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="min-w-[240px] border-border bg-popover/95 backdrop-blur-xl p-1.5"
                >
                  <DropdownMenuLabel className="px-2 py-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-foreground font-semibold shrink-0">
                        {userInitial}
                      </span>
                      <div className="flex flex-col leading-tight min-w-0">
                        <span className="text-sm text-foreground font-medium truncate">
                          {user.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-accent/80">
                          {ROLE_LABEL[user.role as Role] ?? "Usuário"}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {roleArea && (
                    <DropdownMenuItem
                      onSelect={() => {
                        scrollToTop();
                        navigate(roleArea.to);
                      }}
                      className="cursor-pointer gap-2.5 py-2.5"
                    >
                      <roleArea.icon className="w-4 h-4 text-accent" />
                      <span>{roleArea.label}</span>
                    </DropdownMenuItem>
                  )}
                  {user.role === "barbeiro" && (
                    <DropdownMenuItem
                      onSelect={() => {
                        scrollToTop();
                        navigate("/funcionario?tab=perfil");
                      }}
                      className="cursor-pointer gap-2.5 py-2.5"
                    >
                      <User className="w-4 h-4 text-accent" />
                      <span>Perfil</span>
                    </DropdownMenuItem>
                  )}
                  {user.role !== "barbeiro" && (
                    <DropdownMenuItem
                      onSelect={() => {
                        scrollToTop();
                        navigate("/agendamento");
                      }}
                      className="cursor-pointer gap-2.5 py-2.5"
                    >
                      <CalendarDays className="w-4 h-4 text-accent" />
                      <span>Novo agendamento</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      scrollToTop();
                      navigate("/pacotes");
                    }}
                    className="cursor-pointer gap-2.5 py-2.5"
                  >
                    <Package className="w-4 h-4 text-accent" />
                    <span>Pacotes</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setShowLogoutModal(true)}
                    className="cursor-pointer gap-2.5 py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair da conta</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : authLoading ? (
              <div
                aria-hidden
                className="h-10 w-28 xl:w-[196px] rounded-full border border-border/60 bg-card/35 animate-pulse"
              />
            ) : (
              <Link
                to={LOGIN_PATH}
                state={loginLocationState}
                onClick={() => {
                  setLoginIntent();
                  scrollToTop();
                }}
                className="inline-flex h-10 min-w-0 max-w-[min(196px,40vw)] xl:w-[196px] xl:max-w-none items-center justify-center gap-2 px-4 xl:px-5 py-2 text-xs xl:text-sm rounded-md bg-accent text-accent-foreground font-medium hover:bg-accent/90 hover:shadow-[0_0_18px_-2px_rgba(212,175,55,0.6)] transition-all"
              >
                <User className="w-4 h-4" />
                Login
              </Link>
            )}
            </div>
          </div>
        </nav>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="mobile-main-nav"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="xl:hidden border-t border-border overflow-hidden bg-black/95 backdrop-blur-xl"
            >
              <div className="max-h-[min(70vh,calc(100dvh-73px))] overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 space-y-1.5">
                {user && (
                  <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border">
                    <span className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent/60 text-accent-foreground font-semibold shrink-0">
                      {userInitial}
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm text-foreground">{user.name}</span>
                      <span className="text-[10px] uppercase tracking-widest text-accent/80">
                        {ROLE_LABEL[user.role as Role] ?? "Usuário"}
                      </span>
                    </div>
                  </div>
                )}

                {[...navItems, ...(roleArea ? [roleArea] : [])].map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => {
                        setMenuOpen(false);
                        scrollToTop();
                      }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors ${
                        active
                          ? "bg-accent/10 text-accent border border-accent/30"
                          : "text-foreground hover:bg-muted/10 hover:text-accent border border-transparent"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}

                {user ? (
                  <button
                    onClick={() => {
                      setShowLogoutModal(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm border border-transparent hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                ) : (
                  <Link
                    to={LOGIN_PATH}
                    state={loginLocationState}
                    onClick={() => {
                      setLoginIntent();
                      setMenuOpen(false);
                      scrollToTop();
                    }}
                    className="mt-2 flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-md bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Login
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="pt-[73px]">
        {demoMode && (
          <div className="border-b border-accent/25 bg-accent/10 px-4 py-2 text-center text-xs text-accent sm:text-sm">
            Ambiente de demonstração — dados fictícios; pagamentos, WhatsApp e e-mail simulados.
          </div>
        )}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 xl:hidden"
            />
          )}
        </AnimatePresence>

        <AlertDialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
          <AlertDialogContent className="border-accent/60 bg-card/95 backdrop-blur-xl shadow-[0_24px_60px_-30px_rgba(212,175,55,0.45)]">
            <AlertDialogHeader>
              <AlertDialogTitle className="tracking-tight flex items-center gap-2 text-foreground">
                <LogOut className="w-5 h-5 text-accent" />
                Confirmar Saída
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                Tem certeza que deseja sair da sua conta?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <AlertDialogCancel className="border-border bg-background text-foreground hover:bg-muted/50">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleLogout()}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Sair
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div
          key={location.pathname}
          className={location.pathname.startsWith("/dashboard") ? "page-enter-ultra-soft" : "page-enter"}
        >
          <Outlet />
        </div>

        <ClientPackageExpiryModal />
      </main>

      <footer className="border-t border-border bg-black">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/55 bg-gradient-to-b from-accent/25 via-accent/10 to-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/5">
                  <Scissors className="h-5 w-5 text-accent drop-shadow-[0_0_10px_rgba(212,175,55,0.45)]" />
                </span>
                <div className="flex min-w-0 flex-col leading-tight [font-family:var(--font-heading),serif]">
                  <span className="mb-0.5 flex items-center gap-2">
                    <span className="h-px w-6 bg-gradient-to-r from-transparent via-accent to-accent/80" aria-hidden />
                    <span className="text-[10px] font-medium uppercase tracking-[0.26em] text-accent/95">
                      Experiência premium
                    </span>
                  </span>
                  <span className="text-xl font-semibold tracking-[-0.02em] leading-[1.05] sm:text-2xl">
                    <span className="bg-gradient-to-r from-white via-white to-zinc-300 bg-clip-text text-transparent">
                      Barbearia
                    </span>
                    <span className="ml-[0.14em] bg-gradient-to-r from-accent via-amber-200 to-accent bg-clip-text text-transparent">
                      Demo
                    </span>
                  </span>
                </div>
              </div>
              <p className="text-muted-foreground">
                Excelência em cortes masculinos desde 2020
              </p>
            </div>

            <div>
              <h3 className="mb-4">Horário</h3>
              <p className="text-muted-foreground">Segunda - Sexta: 9h - 20h</p>
              <p className="text-muted-foreground">Sábado: 9h - 18h</p>
              <p className="text-muted-foreground">Domingo: Fechado</p>
            </div>

            <div>
              <h3 className="mb-4">Contato</h3>
              <p className="text-muted-foreground">contato@example.com</p>
              <p className="text-muted-foreground">(79) 90000-0000</p>
              <p className="text-muted-foreground">Rua das Palmeiras, 123 - São Paulo, SP</p>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-border text-center text-muted-foreground">
            <p>&copy; 2026 Barbearia Demo. Projeto de demonstração com dados fictícios.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Root() {
  return (
    <AuthProvider>
      <RootContent />
    </AuthProvider>
  );
}
