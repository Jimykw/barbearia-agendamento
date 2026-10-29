import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * PDF alinhado ao tema premium do site (`src/styles/theme.css`):
 * --background #000, --card #0a0a0a, --accent #d4af37, --muted-foreground #a3a3a3
 * Amarelo/dourado mais escuro na faixa superior e contornos; accent oficial nos valores.
 */
export const PDF_THEME = {
  /** --background */
  background: [0, 0, 0] as [number, number, number],
  /** --card */
  card: [10, 10, 10] as [number, number, number],
  /** --secondary / leve elevação */
  secondary: [26, 26, 26] as [number, number, number],
  /** --foreground */
  foreground: [255, 255, 255] as [number, number, number],
  /** --muted-foreground */
  mutedForeground: [163, 163, 163] as [number, number, number],
  /** --accent #d4af37 */
  accent: [212, 175, 55] as [number, number, number],
  /** Amarelo/dourado escuro (faixa topo, cabeçalho de tabela alternativo) */
  accentDark: [138, 104, 28] as [number, number, number],
  /** Ainda mais escuro para bordas “premium” */
  accentBorder: [100, 78, 22] as [number, number, number],
  /** --accent-foreground */
  accentForeground: [0, 0, 0] as [number, number, number],
  /** Linhas de grelha tipo border do site */
  borderSoft: [38, 38, 38] as [number, number, number],
  /** Linha alternada sutil */
  rowAlt: [18, 18, 18] as [number, number, number],
};

export type PdfThemeContext = {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
};

export function beginBrandedPdf(): PdfThemeContext {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { background, accentDark, foreground } = PDF_THEME;
  doc.setFillColor(...background);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(...accentDark);
  doc.rect(0, 0, pageWidth, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...foreground);
  doc.setFontSize(14);
  doc.text("BARBEARIA DEMO", 14, 8.2);
  return { doc, pageWidth, pageHeight };
}

export function writeReportTitle(ctx: PdfThemeContext, title: string, y = 22): number {
  const { doc } = ctx;
  const { foreground, accent } = PDF_THEME;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...foreground);
  doc.setFontSize(18);
  const lines = doc.splitTextToSize(title, ctx.pageWidth - 28);
  let cursor = y;
  for (const line of lines) {
    doc.text(line, 14, cursor);
    cursor += 7;
  }
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.45);
  doc.line(14, cursor - 1, Math.min(14 + 92, ctx.pageWidth - 14), cursor - 1);
  return cursor + 4;
}

export function writeMetaLines(ctx: PdfThemeContext, lines: string[], startY: number): number {
  const { doc, pageWidth } = ctx;
  const { mutedForeground } = PDF_THEME;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedForeground);
  doc.setFontSize(9.5);
  let y = startY;
  const maxW = pageWidth - 28;
  for (const raw of lines) {
    const parts = doc.splitTextToSize(raw, maxW);
    for (const p of parts) {
      doc.text(p, 14, y);
      y += 4.3;
    }
  }
  return y + 2;
}

/** Cartões estilo premium-glass: fundo card, borda dourada suave, rótulos muted, valores accent. */
export function drawSummaryCards(
  ctx: PdfThemeContext,
  startY: number,
  cards: { label: string; value: string }[],
): number {
  const { doc, pageWidth } = ctx;
  const { card, accent, accentBorder, mutedForeground } = PDF_THEME;
  const cardHeight = 18;
  const cardGap = 5;
  const cardWidth = (pageWidth - 28 - cardGap) / 2;

  cards.forEach((cardItem, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 14 + col * (cardWidth + cardGap);
    const y = startY + row * (cardHeight + cardGap);
    doc.setFillColor(...card);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.4, 2.4, "F");
    doc.setDrawColor(...accentBorder);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.4, 2.4, "S");
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.15);
    doc.roundedRect(x + 0.2, y + 0.2, cardWidth - 0.4, cardHeight - 0.4, 2.2, 2.2, "S");

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedForeground);
    doc.setFontSize(8.8);
    doc.text(cardItem.label, x + 3, y + 6.2);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...accent);
    doc.setFontSize(12.5);
    const valueLines = doc.splitTextToSize(cardItem.value, cardWidth - 6);
    let vy = y + 12.5;
    for (const vl of valueLines) {
      doc.text(vl, x + 3, vy);
      vy += 4.5;
    }
  });

  const rows = Math.ceil(cards.length / 2);
  return startY + rows * (cardHeight + cardGap) + 4;
}

const tableBase = (startY: number) => ({
  startY,
  theme: "grid" as const,
  styles: {
    font: "helvetica",
    fontSize: 9,
    cellPadding: 2.5,
    textColor: PDF_THEME.foreground,
    fillColor: PDF_THEME.card,
    lineColor: PDF_THEME.borderSoft,
    lineWidth: 0.15,
  },
  /** Cabeçalho: dourado escuro + texto claro (contraste premium) */
  headStyles: {
    fillColor: PDF_THEME.accentDark,
    textColor: PDF_THEME.foreground,
    fontStyle: "bold" as const,
  },
  alternateRowStyles: {
    fillColor: PDF_THEME.rowAlt,
  },
  margin: { left: 14, right: 14 },
});

function paintDarkPageBackground(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(...PDF_THEME.background);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

/**
 * O jsPDF cria páginas seguintes com fundo branco por defeito. O autoTable só desenha a grelha:
 * pintamos o fundo premium (preto) antes do conteúdo da tabela em cada página a partir da 2.ª.
 * A 1.ª página já foi preparada em `beginBrandedPdf` (e título/cartões acima da tabela).
 */
export function drawDataTable(
  doc: jsPDF,
  startY: number,
  head: string[][],
  body: string[][],
): number {
  autoTable(doc, {
    ...tableBase(startY),
    head,
    body,
    willDrawPage: (data) => {
      if (data.pageNumber <= 1) return;
      paintDarkPageBackground(data.doc);
    },
  });
  const extended = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  return extended.lastAutoTable?.finalY ?? startY + 24;
}

export function applyPdfFooters(ctx: PdfThemeContext, leftFooter: string): void {
  const { doc, pageWidth, pageHeight } = ctx;
  const { mutedForeground, accent } = PDF_THEME;
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedForeground);
    doc.text(leftFooter, 14, pageHeight - 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...accent);
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - 38, pageHeight - 6);
  }
}

export function savePdf(doc: jsPDF, filename: string): void {
  doc.save(filename);
}
