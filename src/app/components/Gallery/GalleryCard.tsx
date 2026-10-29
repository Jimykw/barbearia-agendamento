import { motion } from "motion/react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";

interface GalleryCardProps {
  url: string;
  title: string;
  /** Slug da categoria (fallback se categoryLabel não for passado). */
  category: string;
  /** Texto exibido no selo (ex.: nome amigável da classe). */
  categoryLabel?: string;
  index: number;
  aspectRatio?: "square" | "portrait";
}

export function GalleryCard({
  url,
  title,
  category,
  categoryLabel,
  index,
  aspectRatio = "portrait",
}: GalleryCardProps) {
  const badgeText = (categoryLabel ?? category).replace(/-/g, " ");
  const aspectClass = aspectRatio === "square" ? "aspect-square" : "aspect-[3/4]";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.015 }}
      className={`group relative ${aspectClass} overflow-hidden cursor-pointer rounded-sm border border-white/10 bg-black/20`}
    >
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_20%_10%,rgba(212,175,55,0.22),transparent_45%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <ImageWithFallback
        src={url}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
      />

      {/* Mobile: overlay aparece ao entrar na viewport */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.5 }}
        className="sm:hidden absolute inset-0 z-[2] bg-gradient-to-t from-black via-black/60 to-transparent opacity-0 transition-all duration-300 ease-out"
      >
        <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-4 transition-transform duration-300">
          <span className="inline-flex items-center rounded-full border border-accent/60 bg-accent/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-accent mb-3">
            {badgeText}
          </span>
          <h3 className="text-lg sm:text-xl text-white font-semibold mb-2">{title}</h3>
          <div className="h-px w-14 bg-accent shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
        </div>
      </motion.div>

      {/* Desktop: overlay aparece no hover */}
      <div className="hidden sm:block absolute inset-0 z-[2] bg-gradient-to-t from-black via-black/45 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-400 ease-out">
        <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-5 group-hover:translate-y-0 transition-transform duration-400 ease-out">
          <span className="inline-flex items-center rounded-full border border-accent/60 bg-accent/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-accent mb-3">
            {badgeText}
          </span>
          <h3 className="text-lg sm:text-xl text-white font-semibold mb-2">{title}</h3>
          <div className="h-px w-14 bg-accent shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
        </div>
      </div>

      {/* Borda premium com glow discreto */}
      <div className="absolute inset-0 z-[3] border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute inset-0 z-[3] rounded-sm shadow-[inset_0_0_0_1px_rgba(212,175,55,0.25)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </motion.div>
  );
}
