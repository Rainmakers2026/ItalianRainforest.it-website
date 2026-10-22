import { ImageResponse } from 'next/og';
import { getDataset } from '@/lib/data/provider';
import { computeStats } from '@/lib/data/stats';
import { isLocale, LOCALES } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function OG({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : 'it';
  const t = getDictionary(l);
  const stats = computeStats(await getDataset());
  const dots = Array.from({ length: 46 }, (_, i) => ({
    x: 760 + ((i * 97) % 380),
    y: 120 + ((i * 61) % 420),
    r: i % 6 === 0 ? 9 : 5,
    c: ['#ffffff', '#9fe3f5', '#c9d3ff', '#ffd08a', '#b9f0d0', '#ffb3cf'][i % 6],
  }));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: 'linear-gradient(135deg, #0b1a2e 0%, #14304f 45%, #4b61d1 100%)',
        color: 'white',
        padding: 72,
        position: 'relative',
        fontFamily: 'sans-serif',
      }}
    >
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: 99,
            background: d.c,
            opacity: 0.85,
          }}
        />
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 34, fontWeight: 800 }}>
          <div style={{ width: 64, height: 64, borderRadius: 99, background: '#4b61d1', border: '4px solid white', display: 'flex' }} />
          Italian Rainforest
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{t.hero.title}</div>
          <div
            style={{ fontSize: 28, opacity: 0.85 }}
          >{`${stats.active} ${t.hero.statOrgs} · ${stats.categories} ${t.hero.statCategories}`}</div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.8 }}>{t.footer.initiative}</div>
      </div>
    </div>,
    size,
  );
}
