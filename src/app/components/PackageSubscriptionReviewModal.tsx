import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

type PackageSubscriptionReviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome do pacote escolhido, para personalizar a mensagem. */
  packageName?: string | null;
};

/**
 * Modal exibido após o cliente solicitar um novo pacote: informa que a assinatura
 * será analisada pela barbearia antes da ativação.
 */
export function PackageSubscriptionReviewModal({
  open,
  onOpenChange,
  packageName,
}: PackageSubscriptionReviewModalProps) {
  const nomePacote = (packageName || "").trim();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border/80 bg-card/95 backdrop-blur-xl sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-left text-lg font-semibold tracking-tight text-foreground">
            Solicitação de pacote recebida
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm leading-relaxed text-muted-foreground">
              <p>Prezado(a) cliente,</p>
              <p>
                Informamos que a sua solicitação de adesão
                {nomePacote ? (
                  <>
                    {" "}
                    ao pacote <span className="font-medium text-foreground/90">{nomePacote}</span>
                  </>
                ) : (
                  " a um novo pacote"
                )}{" "}
                foi registada com sucesso nos nossos sistemas.
              </p>
              <p>
                Neste momento, a sua assinatura encontra-se{" "}
                <span className="font-semibold text-foreground/90">em análise</span> pela equipa da Barbearia Demo.
                Após a validação, entraremos em contacto consigo pelos meios habituais
                (e-mail e/ou WhatsApp) para confirmar os próximos passos, sem que seja necessária qualquer ação adicional
                da sua parte até lá.
              </p>
              <p className="text-foreground/80">
                Agradecemos a sua confiança e pedimos, com a devida vênia, que aguarde o nosso retorno.
              </p>
              <p className="text-xs text-muted-foreground/90">Barbearia Demo</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            type="button"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Entendi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
