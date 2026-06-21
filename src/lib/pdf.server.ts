// Server-only PDF rendering for agendas and minutes.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type RenderArgs = {
  title: string;
  subtitle?: string;
  sections: { heading: string; body: string }[];
  footer?: string;
};

export async function renderDocumentPdf(args: RenderArgs): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const drawWrapped = (text: string, size: number, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
    const words = text.split(/\s+/);
    let line = "";
    const lineHeight = size * 1.35;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      const w = useFont.widthOfTextAtSize(test, size);
      if (w > maxWidth && line) {
        if (y < margin + lineHeight) newPage();
        page.drawText(line, { x: margin, y, size, font: useFont, color });
        y -= lineHeight;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      if (y < margin + lineHeight) newPage();
      page.drawText(line, { x: margin, y, size, font: useFont, color });
      y -= lineHeight;
    }
  };

  drawWrapped(args.title, 18, bold);
  y -= 4;
  if (args.subtitle) {
    drawWrapped(args.subtitle, 11, font, rgb(0.35, 0.35, 0.4));
    y -= 6;
  }
  y -= 6;

  for (const section of args.sections) {
    if (y < margin + 60) newPage();
    drawWrapped(section.heading, 13, bold);
    y -= 2;
    const paragraphs = section.body.split(/\n\n+/);
    for (const para of paragraphs) {
      for (const line of para.split("\n")) {
        drawWrapped(line.length ? line : " ", 11);
      }
      y -= 4;
    }
    y -= 6;
  }

  if (args.footer) {
    if (y < margin + 30) newPage();
    y = Math.max(y, margin + 20);
    drawWrapped(args.footer, 9, font, rgb(0.45, 0.45, 0.5));
  }

  return pdf.save();
}
