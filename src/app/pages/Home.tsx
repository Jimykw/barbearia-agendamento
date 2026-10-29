import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Calendar, Scissors, Star, Award, BadgeCheck, Package } from "lucide-react";
import { InstagramBrandIcon, WhatsAppBrandIcon } from "@/app/components/icons/SocialBrandIcons";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { GalleryCard } from "@/app/components/Gallery/GalleryCard";
import { usePortfolioConfig } from "@/hooks/usePortfolioConfig";
import { API_URL } from "@/services/api";
import { formatPackageSessionsLabel } from "@/lib/clientPackageCopy";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/app/components/ui/carousel";

const scrollToTop = () => {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

export default function Home() {
  type HomePackage = {
    id: number;
    name: string;
    description: string;
    sessions: number;
    sessions_unlimited?: boolean;
    price: string;
    validity_days: number;
    is_active: boolean;
  };
  const instagramUrl = "#";
  const whatsappUrl = "#";
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [packages, setPackages] = useState<HomePackage[]>([]);
  const { items: portfolioItems, categoryLabelById } = usePortfolioConfig();

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => {
      setCurrentSlide(carouselApi.selectedScrollSnap());
      setSlideCount(carouselApi.scrollSnapList().length);
    };
    onSelect();
    carouselApi.on("select", onSelect);
    carouselApi.on("reInit", onSelect);
    return () => {
      carouselApi.off("select", onSelect);
      carouselApi.off("reInit", onSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi || isCarouselPaused) return;
    const timer = window.setInterval(() => {
      carouselApi.scrollNext();
    }, 3200);
    return () => window.clearInterval(timer);
  }, [carouselApi, isCarouselPaused]);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const response = await fetch(`${API_URL}/api/client-packages/`);
        if (!response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data)) return;
        const active = (data as HomePackage[]).filter((pkg) => pkg.is_active).slice(0, 3);
        setPackages(active);
      } catch {
        // seção permanece oculta se API falhar
      }
    };
    void fetchPackages();
  }, []);

  return (
    <div className="bg-background">
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.4 }}
            transition={{ duration: 1.2 }}
            className="w-full h-full"
          >
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1759134248487-e8baaf31e33e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920"
              alt="Barbearia Demo"
              className="w-full h-full object-cover"
            />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/30" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_35%,rgba(212,175,55,0.20),transparent_50%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.10),transparent_40%)]" />
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.07)_50%,transparent_65%)] opacity-25 animate-pulse" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="max-w-4xl"
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex items-center gap-3 mb-6"
            >
              <div className="h-px w-12 bg-accent" />
              <span className="text-accent tracking-[0.22em] text-xs sm:text-sm uppercase">Experiência premium</span>
            </motion.div>

            <h1 className="premium-title text-5xl sm:text-7xl md:text-8xl lg:text-9xl mb-6 tracking-tight leading-[0.92]">
              <span className="bg-gradient-to-r from-white via-white to-zinc-300 bg-clip-text text-transparent">Barbearia</span><br />
              <span className="bg-gradient-to-r from-accent via-amber-200 to-accent bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(212,175,55,0.28)]">Demo</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-zinc-300 mb-8 max-w-2xl leading-relaxed">
              Onde tradição encontra modernidade. Experiência premium em cortes masculinos com acabamento de alto nível.
            </p>

            <div className="flex flex-wrap gap-2 sm:gap-3 mb-8">
              <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs sm:text-sm text-accent">
                Desde 2020
              </span>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs sm:text-sm text-zinc-200">
                4.9 de avaliação
              </span>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs sm:text-sm text-zinc-200">
                +5.000 cortes realizados
              </span>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex flex-col sm:flex-row flex-wrap gap-4">
                <Link
                  to="/agendamento"
                  onClick={scrollToTop}
                  className="premium-cta px-8 py-4 bg-accent text-accent-foreground hover:bg-accent/90 transition-all inline-flex items-center justify-center gap-2 group w-full sm:w-auto shadow-[0_8px_30px_-10px_rgba(212,175,55,0.8)]"
                >
                  <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Agendar Horário
                </Link>
                <Link
                  to="/portfolio"
                  onClick={scrollToTop}
                  className="premium-cta px-8 py-4 border border-white/50 text-white hover:bg-white hover:text-black transition-all inline-flex items-center justify-center w-full sm:w-auto"
                >
                  Ver Portfolio
                </Link>
              </div>
              <div className="flex items-center justify-center gap-4 md:pb-[2px]">
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram da Barbearia Demo"
                  title="Instagram"
                  className="premium-cta inline-flex h-14 w-12 items-center justify-center border border-accent/60 text-accent hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  <InstagramBrandIcon className="h-6 w-6 shrink-0 opacity-95" />
                </a>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp da Barbearia Demo"
                  title="WhatsApp"
                  className="premium-cta inline-flex h-14 w-12 items-center justify-center border border-emerald-500/70 text-emerald-300 hover:bg-emerald-500 hover:text-emerald-950 transition-all"
                >
                  <WhatsAppBrandIcon className="h-6 w-6 shrink-0 opacity-95" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-card/80 border-y border-border relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(212,175,55,0.12),transparent_35%)]" />
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="premium-glass-card text-center p-6"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 border border-accent/70 mb-6 shadow-[0_0_20px_-8px_rgba(212,175,55,0.6)]">
                <Scissors className="w-8 h-8 text-accent" />
              </div>
              <h3 className="mb-3">Profissionais Especializados</h3>
              <p className="text-muted-foreground">
                Equipe experiente com foco em acabamento e estilo masculinos.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="premium-glass-card text-center p-6"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 border border-accent/70 mb-6 shadow-[0_0_20px_-8px_rgba(212,175,55,0.6)]">
                <Star className="w-8 h-8 text-accent" />
              </div>
              <h3 className="mb-3">Atendimento Personalizado</h3>
              <p className="text-muted-foreground">
                Cada agendamento é tratado com cuidado, conforto e agilidade.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="premium-glass-card text-center p-6"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 border border-accent/70 mb-6 shadow-[0_0_20px_-8px_rgba(212,175,55,0.6)]">
                <Award className="w-8 h-8 text-accent" />
              </div>
              <h3 className="mb-3">Produtos Profissionais</h3>
              <p className="text-muted-foreground">
                Utilizamos linhas premium para garantir acabamento duradouro.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-24 relative">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="premium-title text-3xl sm:text-4xl md:text-5xl mb-4 tracking-tight">Nosso Trabalho</h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Confira alguns dos nossos cortes e transformações
            </p>
          </motion.div>

          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            setApi={setCarouselApi}
            onMouseEnter={() => setIsCarouselPaused(true)}
            onMouseLeave={() => setIsCarouselPaused(false)}
            onTouchStart={() => setIsCarouselPaused(true)}
            onTouchEnd={() => setIsCarouselPaused(false)}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {portfolioItems.map((item, index) => (
                <CarouselItem key={item.id} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                  <GalleryCard
                    url={item.url}
                    title={item.title}
                    category={item.categoryId}
                    categoryLabel={categoryLabelById[item.categoryId]}
                    index={index}
                    aspectRatio="square"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2 top-1/2 -translate-y-1/2 border-accent/40 bg-black/70 text-accent hover:bg-accent hover:text-accent-foreground" />
            <CarouselNext className="right-2 top-1/2 -translate-y-1/2 border-accent/40 bg-black/70 text-accent hover:bg-accent hover:text-accent-foreground" />
          </Carousel>

          {slideCount > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2">
              {Array.from({ length: slideCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Ir para slide ${index + 1}`}
                  onClick={() => carouselApi?.scrollTo(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    currentSlide === index
                      ? "w-6 bg-accent shadow-[0_0_12px_rgba(212,175,55,0.6)]"
                      : "w-2.5 bg-white/35 hover:bg-white/55"
                  }`}
                />
              ))}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link
              to="/portfolio"
              onClick={scrollToTop}
              className="premium-cta inline-flex items-center justify-center px-10 py-5 bg-accent text-accent-foreground hover:bg-accent/90 transition-all shadow-[0_10px_32px_-12px_rgba(212,175,55,0.9)]"
            >
              Ver Portfolio Completo
            </Link>
          </motion.div>
        </div>
      </section>

      {packages.length > 0 && (
        <section className="py-20 border-t border-border bg-card/50 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(212,175,55,0.12),transparent_45%)]" />
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-10 text-center"
            >
              <h2 className="premium-title text-3xl sm:text-4xl md:text-5xl mb-3 tracking-tight">
                Pacotes de Assinatura
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg">
                Mais economia e prioridade para clientes recorrentes.
              </p>
            </motion.div>

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-3">
              {packages.map((pkg, index) => (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.08 * index }}
                  className="premium-glass-card flex h-full min-h-[390px] flex-col rounded-xl border border-border bg-card/40 p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="min-h-[64px] text-xl leading-tight sm:text-2xl">{pkg.name}</h3>
                    <Package className="w-5 h-5 text-accent" />
                  </div>
                  <p className="min-h-[64px] text-sm text-muted-foreground">
                    {pkg.description || "Pacote exclusivo para clientes da Demo."}
                  </p>
                  <div className="mt-4 min-h-[62px] space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-accent" />
                      {formatPackageSessionsLabel(pkg.sessions, pkg.sessions_unlimited)}
                    </div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-accent" />
                      Validade de {pkg.validity_days} dias
                    </div>
                  </div>
                  <div className="mt-4 min-h-[52px] text-4xl font-semibold text-accent tabular-nums">
                    R$ {Number(pkg.price).toFixed(2)}
                  </div>
                  <Link
                    to={`/pacotes?package=${pkg.id}`}
                    onClick={scrollToTop}
                    className="premium-cta mt-auto inline-flex w-full items-center justify-center border border-accent/60 px-6 py-3 text-accent transition-all hover:bg-accent hover:text-accent-foreground"
                  >
                    Assinar pacote
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-24 bg-card border-t border-border relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(212,175,55,0.14),transparent_40%)]" />
        <div className="mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-3 mb-5">
              <div className="h-px w-10 bg-accent" />
              <span className="text-accent tracking-[0.2em] text-xs uppercase">Experiência Premium</span>
              <div className="h-px w-10 bg-accent" />
            </div>
            <h2 className="premium-title text-3xl sm:text-4xl md:text-5xl mb-6 tracking-tight">Pronto para transformar seu visual?</h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Agende seu horário agora e experimente o melhor da barbearia premium
            </p>
            <Link
              to="/agendamento"
              onClick={scrollToTop}
              className="premium-cta inline-flex items-center justify-center gap-3 px-10 py-5 bg-accent text-accent-foreground hover:bg-accent/90 transition-all group w-full sm:w-auto shadow-[0_10px_34px_-10px_rgba(212,175,55,0.9)]"
            >
              <Calendar className="w-6 h-6 group-hover:scale-110 transition-transform" />
              Agendar Agora
            </Link>
            <div className="mt-4 flex flex-col sm:flex-row justify-center gap-3">
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-accent/60 text-accent hover:bg-accent hover:text-accent-foreground transition-all w-full sm:w-auto"
              >
                <InstagramBrandIcon className="h-5 w-5 shrink-0" />
                Instagram
              </a>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-emerald-500/70 text-emerald-300 hover:bg-emerald-500 hover:text-emerald-950 transition-all w-full sm:w-auto"
              >
                <WhatsAppBrandIcon className="h-5 w-5 shrink-0" />
                WhatsApp
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
