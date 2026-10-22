import type { Dictionary } from '@/lib/i18n';
import { SITE } from '@/lib/site';
import { SuggestLink } from '../forms/UpdateForm';
import { OutboundLink } from '../OutboundLink';
import { Icon, type IconName } from '../ui/Icon';

function Row({ icon, label }: { icon: IconName; label: string }) {
  return (
    <>
      <span className="flex items-center gap-3">
        <Icon name={icon} className="text-sky" />
        {label}
      </span>
      <Icon name="arrowRight" size={18} className="text-white/60" />
    </>
  );
}

export function Contact({ t }: { t: Dictionary['contact'] }) {
  const tile =
    'flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-white/[0.08] px-5 py-4 font-bold ring-1 ring-white/20 transition-colors hover:bg-white/[0.14]';
  return (
    <section id="contacts" aria-labelledby="contacts-title" className="on-dark section bg-savoia text-white">
      <div className="container-irf grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div className="reveal">
          <p className="eyebrow text-sky">{t.eyebrow}</p>
          <h2 id="contacts-title" className="h2 mt-3">
            {t.title}
          </h2>
          <p className="lead mt-4 text-white/85">{t.lead}</p>
          <dl className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-bold text-white/75">{t.emailLabel}</dt>
              <dd className="mt-1">
                <a
                  href={`mailto:${SITE.email}`}
                  className="text-lg font-bold break-all underline decoration-white/40 underline-offset-4 hover:decoration-white"
                >
                  {SITE.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-bold text-white/75">{t.community}</dt>
              <dd className="mt-1 text-sm text-white/85">{t.communityText}</dd>
              <dd className="mt-3">
                <a href={SITE.whatsappCommunity} target="_blank" rel="noopener" className="btn btn-light btn-sm">
                  <Icon name="chat" size={16} />
                  {t.communityCta}
                </a>
              </dd>
            </div>
          </dl>
        </div>
        <ul className="reveal grid content-start gap-3">
          <li>
            <SuggestLink type="new" className={tile}>
              <Row icon="plus" label={t.actions.suggest} />
            </SuggestLink>
          </li>
          <li>
            <SuggestLink type="correction" className={tile}>
              <Row icon="reset" label={t.actions.correct} />
            </SuggestLink>
          </li>
          <li>
            <a href="#map-embed" className={tile}>
              <Row icon="code" label={t.actions.embed} />
            </a>
          </li>
          <li>
            <a href={`mailto:${SITE.email}?subject=${encodeURIComponent(t.collaborateSubject)}`} className={tile}>
              <Row icon="mail" label={t.actions.collaborate} />
            </a>
          </li>
          <li>
            <OutboundLink href={SITE.rainmakers.url} event="rainmakers_outbound" props={{ placement: 'contact' }} className={tile}>
              <Row icon="external" label={t.actions.rainmakers} />
            </OutboundLink>
          </li>
        </ul>
      </div>
    </section>
  );
}
