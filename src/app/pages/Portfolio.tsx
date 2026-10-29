import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { Settings2 } from "lucide-react";
import { GalleryCard } from "@/app/components/Gallery/GalleryCard";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolioConfig } from "@/hooks/usePortfolioConfig";

export default function Portfolio() {
  const { user } = useAuth();
  const { fetchError, filterCategories, items, categoryLabelById } = usePortfolioConfig();

  const [selectedCategory, setSelectedCategory] = useState("todos");

  const filteredPortfolio =
    selectedCategory === "todos"
      ? items
      : items.filter((item) => item.categoryId === selectedCategory);

  return (
    <div className="bg-background py-24 pb-12">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 tracking-tight">Nosso portfólio</h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground">
            Veja cortes, barba e styling finalizados por nossa equipe.
          </p>
        </motion.div>

        {user?.role === "admin" ? (
          <div className="mb-10 flex justify-center">
            <Link
              to="/portfolio/editar"
              className="premium-cta inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-5 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Settings2 className="h-4 w-4" />
              Editar portfólio
            </Link>
          </div>
        ) : null}

        {fetchError ? (
          <p className="mb-8 text-center text-sm text-amber-200/80">
            {fetchError} Exibindo o portfólio padrão até a API responder.
          </p>
        ) : null}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-16"
        >
          {filterCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base transition-all ${
                selectedCategory === category.id
                  ? "bg-accent text-accent-foreground"
                  : "border border-foreground text-foreground hover:bg-foreground hover:text-background"
              }`}
            >
              {category.label}
            </button>
          ))}
        </motion.div>

        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
        >
          {filteredPortfolio.map((item, index) => (
            <GalleryCard
              key={item.id}
              url={item.url}
              title={item.title}
              category={item.categoryId}
              categoryLabel={categoryLabelById[item.categoryId]}
              index={index}
            />
          ))}
        </motion.div>

        {filteredPortfolio.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <p className="text-xl text-muted-foreground">
              Nenhum trabalho encontrado nesta categoria
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
