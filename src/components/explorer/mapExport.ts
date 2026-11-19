import type { Map as MLMap } from 'maplibre-gl';

export type MapExportMeta = {
  title: string;
  subtitle: string;
  legend: { label: string; color: string; count: string }[];
  footer: string;
};

/**
 * Renders the current map view (filters, zoom and all) to a branded PNG:
 * header with title and active filters, the map, a category legend and the
 * required attribution. Loaded on demand (dynamic import) by the download button.
 * The WebGL buffer is read inside the 'render' event, so preserveDrawingBuffer
 * is not needed (no runtime cost for regular map use).
 */
export function exportMapPng(map: MLMap, meta: MapExportMeta): Promise<Blob> {
  return new Promise((resolve, reject) => {
    map.once('render', () => {
      try {
        const src = map.getCanvas();
        const dpr = src.width / Math.max(1, src.clientWidth);
        const W = src.width;
        const pad = 24 * dpr;
        const font = getComputedStyle(document.body).fontFamily || 'Roboto, Arial, sans-serif';
        const headerH = 92 * dpr;

        // Measure the legend to size the footer.
        const probe = document.createElement('canvas').getContext('2d')!;
        probe.font = `600 ${13 * dpr}px ${font}`;
        const rows: { x: number; y: number; item: MapExportMeta['legend'][number] }[] = [];
        let x = pad;
        let y = 0;
        for (const item of meta.legend) {
          const w = 14 * dpr + probe.measureText(`${item.label} ${item.count}`).width + 20 * dpr;
          if (x + w > W - pad) {
            x = pad;
            y += 24 * dpr;
          }
          rows.push({ x, y, item });
          x += w;
        }
        const legendH = meta.legend.length ? y + 24 * dpr : 0;
        const footerH = pad + legendH + 34 * dpr;

        const out = document.createElement('canvas');
        out.width = W;
        out.height = headerH + src.height + footerH;
        const ctx = out.getContext('2d')!;

        // Header (IRF navy → Savoia).
        const g = ctx.createLinearGradient(0, 0, W, headerH);
        g.addColorStop(0, '#1b3a5c');
        g.addColorStop(1, '#3a5ec4');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, headerH);
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${24 * dpr}px ${font}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(meta.title, pad, 40 * dpr);
        ctx.fillStyle = '#9fe3f5';
        ctx.font = `600 ${14 * dpr}px ${font}`;
        ctx.fillText(meta.subtitle, pad, 68 * dpr, W - pad * 2);

        // Map.
        ctx.drawImage(src, 0, headerH);

        // Footer: legend + attribution.
        const top = headerH + src.height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, top, W, footerH);
        ctx.font = `600 ${13 * dpr}px ${font}`;
        for (const r of rows) {
          const cy = top + pad + r.y + 8 * dpr;
          ctx.fillStyle = r.item.color;
          ctx.beginPath();
          ctx.arc(r.x + 6 * dpr, cy, 6 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#14304f';
          ctx.fillText(`${r.item.label} ${r.item.count}`, r.x + 16 * dpr, cy + 4.5 * dpr);
        }
        ctx.fillStyle = '#6b7690';
        ctx.font = `500 ${11 * dpr}px ${font}`;
        ctx.fillText(meta.footer, pad, top + footerH - 14 * dpr, W - pad * 2);

        out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png');
      } catch (err) {
        reject(err as Error);
      }
    });
    map.triggerRepaint();
  });
}
