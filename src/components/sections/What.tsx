import type { DatasetStats } from '@/lib/data/stats';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { Icon } from '../ui/Icon';
import { CategoriesWheel } from './CategoriesWheel';
import { SectionHeader } from './SectionHeader';

/**
 * "Cosa facciamo", then "Le categorie della Rainforest": interactive two-ring
 * infographic (kinds of enablers inside, categories outside) with a linked
 * legend. Every slice and row opens the explorer filtered on it.
 */
export function What({ t, locale, stats }: { t: Dictionary['what']; locale: Locale; stats: DatasetStats }) {
  return (
    <section id="what" aria-labelledby="what-title" className="on-dark section section-blue relative overflow-hidden">
      <div className="container-irf">
        <SectionHeader caps id="what-title" title={t.title} accent={t.accent} lead={t.lead} dark>
          <p className="lead mt-4 text-white/85">{rich(t.text)}</p>
        </SectionHeader>
        <div className="reveal mt-14 max-w-3xl">
          <h3 className="text-2xl font-black tracking-[-0.02em] sm:text-3xl">{t.categoriesTitle}</h3>
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-white/85">{t.categoriesLead}</p>
        </div>
        <CategoriesWheel counts={stats.categoryCounts} familyCounts={stats.familyCounts} locale={locale} t={t} />
        <p className="reveal mt-10 flex items-start gap-2 text-[0.9375rem] text-white/85">
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-sky" />
          <span>{rich(t.license)}</span>
        </p>
      </div>
    </section>
  );
}
