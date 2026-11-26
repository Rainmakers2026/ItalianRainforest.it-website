'use client';

/**
 * PDF export (map + list of the filtered players). Loaded on demand: jsPDF never ships in
 * the main bundle. Standard PDF fonts only cover Windows-1252, so text is folded to
 * it (emoji and other symbols are dropped, accented Latin letters are kept).
 */

/**
 * The table, as built by /api/download (format "pdf"): the column names, number and order
 * of the Rainmakers OS master, one row per player; reserved columns are empty cells.
 */
export type PdfTable = { columns: string[]; rows: string[][] };
export type PdfMeta = {
  title: string;
  subtitle: string;
  footer: string;
};

const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
export function toWinAnsi(s: string): string {
  return [...s.normalize('NFC')]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (c < 0x80 || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch)) return ch;
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\x7e]$/.test(base) ? base : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAVY: [number, number, number] = [27, 58, 92];
const BRAND: [number, number, number] = [44, 79, 156];

async function loadLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch('/brand/irf-logo-blue.png')).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function setup(orientation: 'landscape' | 'portrait') {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // A3: room for every column of the master structure.
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a3', compress: true });
  return { doc, autoTable };
}

function header(doc: import('jspdf').jsPDF, meta: PdfMeta, logo: string | null) {
  const w = doc.internal.pageSize.getWidth();
  if (logo) doc.addImage(logo, 'PNG', 12, 9, 38, 11.5);
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...NAVY);
  doc.text(toWinAnsi(meta.title), logo ? 56 : 12, 15);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90, 100, 120);
  doc.text(toWinAnsi(meta.subtitle), logo ? 56 : 12, 20.5, { maxWidth: w - (logo ? 68 : 24) });
  doc.setDrawColor(...BRAND).setLineWidth(0.4).line(12, 25, w - 12, 25);
}

function footers(doc: import('jspdf').jsPDF, meta: PdfMeta) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120, 128, 145);
    doc.text(toWinAnsi(meta.footer), 12, h - 7, { maxWidth: w - 40 });
    doc.text(`${i} / ${n}`, w - 12, h - 7, { align: 'right' });
  }
}

const WIDTH: Record<string, number> = { 'COMPANY NAME': 34, 'SHORT DESCRIPTION': 78, ADDRESS: 34, INDUSTRY: 30, 'GOOGLE MAPS LINK': 34, WEBSITE: 30 };

function table(doc: import('jspdf').jsPDF, autoTable: typeof import('jspdf-autotable').autoTable, t: PdfTable, meta: PdfMeta, startY: number) {
  autoTable(doc, {
    startY,
    margin: { left: 12, right: 12, top: 30, bottom: 14 },
    head: [t.columns.map(toWinAnsi)],
    body: t.rows.map((r) => r.map((v) => toWinAnsi(v ?? ''))),
    styles: { font: 'helvetica', fontSize: 6, cellPadding: 1.2, textColor: [30, 40, 60], overflow: 'linebreak', lineColor: [225, 230, 240], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 253] },
    columnStyles: Object.fromEntries(
      t.columns.map((c, i) => [i, { ...(WIDTH[c.trim().toUpperCase()] ? { cellWidth: WIDTH[c.trim().toUpperCase()] } : {}), ...(i === 0 ? { fontStyle: 'bold' as const } : {}) }]),
    ),
    didDrawPage: () => header(doc, meta, logoCache),
  });
}

let logoCache: string | null = null;

/** Map: the rendered map (PNG from mapExport) on page 1, the listed players after it. */
export async function exportMapPdf(mapPng: Blob, rows: PdfTable, meta: PdfMeta): Promise<Blob> {
  const { doc, autoTable } = await setup('landscape');
  logoCache = await loadLogo();
  header(doc, meta, logoCache);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(mapPng);
  });
  const props = doc.getImageProperties(dataUrl);
  const w = doc.internal.pageSize.getWidth() - 24;
  const hMax = doc.internal.pageSize.getHeight() - 30 - 16;
  const scale = Math.min(w / props.width, hMax / props.height);
  const iw = props.width * scale;
  const ih = props.height * scale;
  doc.addImage(dataUrl, 'PNG', 12 + (w - iw) / 2, 29, iw, ih);
  doc.addPage();
  table(doc, autoTable, rows, meta, 30);
  footers(doc, meta);
  return doc.output('blob');
}
