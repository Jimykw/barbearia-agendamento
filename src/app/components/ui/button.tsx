import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 disabled:translate-y-0 disabled:scale-100 active:scale-[0.98] motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-[1px] shadow-[0_6px_20px_-12px_rgba(255,255,255,0.35)]",
        primary: "bg-accent text-accent-foreground hover:bg-accent/90 hover:-translate-y-[1px] focus-visible:ring-accent/50 shadow-[0_10px_30px_-12px_rgba(212,175,55,0.85)] hover:shadow-[0_14px_34px_-12px_rgba(212,175,55,0.9)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 hover:-translate-y-[1px] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 shadow-[0_10px_24px_-12px_rgba(220,38,38,0.65)]",
        danger:
          "bg-destructive text-white hover:bg-destructive/90 hover:-translate-y-[1px] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 shadow-[0_10px_24px_-12px_rgba(220,38,38,0.65)]",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground hover:-translate-y-[1px] dark:bg-input/30 dark:border-input dark:hover:bg-input/50 hover:border-accent/70",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-[1px] border border-border/70",
        ghost:
          "bg-transparent text-foreground border border-border hover:bg-muted/10 hover:text-foreground hover:-translate-y-[1px] hover:border-accent/50",
        /** Alinha ao tema “Editar perfil”: fundo escuro, borda e texto dourados. */
        accentOutline:
          "rounded-full border border-accent bg-black/40 text-accent hover:bg-accent hover:text-accent-foreground hover:-translate-y-[1px] focus-visible:ring-accent/40 shadow-none",
        /** Cancelar / ações destrutivas sem preenchimento sólido. */
        destructiveOutline:
          "rounded-full border border-destructive/85 bg-black/30 text-destructive hover:bg-destructive hover:text-white hover:-translate-y-[1px] focus-visible:ring-destructive/35 shadow-none",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "h-9 w-9 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps extends React.ComponentPropsWithoutRef<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  isLoading?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  icon: Icon,
  iconPosition = "left",
  isLoading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const isDisabled = disabled || isLoading;

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        "disabled:cursor-not-allowed disabled:opacity-60"
      )}
      disabled={isDisabled}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{children ?? "Carregando"}</span>
        </span>
      ) : (
        <>
          {Icon && iconPosition === "left" && <Icon className="w-4 h-4" aria-hidden="true" />}
          {children}
          {Icon && iconPosition === "right" && <Icon className="w-4 h-4" aria-hidden="true" />}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
