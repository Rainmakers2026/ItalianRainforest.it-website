import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { isLocale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n';
import { alternates } from '@/lib/seo';
import { SITE } from '@/lib/site';

// DRAFT — structure only. TODO(owner): replace with the text validated by Rainmakers' legal counsel.
const BODY = {
  it: [
    ['Titolare del trattamento', `Rainmakers (Milano). Contatto: ${SITE.email}. [Ragione sociale, sede legale e P.IVA da completare]`],
    [
      'Dati trattati',
      'Indirizzo email e, se forniti, messaggio e dati della segnalazione, inviati tramite i moduli “Richiedi i contatti”, “Scarica i dati” e “Segnala un aggiornamento”. Le statistiche di utilizzo del sito sono raccolte in forma aggregata e non contengono dati personali.',
    ],
    [
      'Finalità e base giuridica',
      'Gestire la tua richiesta (esecuzione di misure precontrattuali / legittimo interesse) e, solo con il tuo consenso facoltativo, inviarti aggiornamenti su Italian Rainforest.',
    ],
    ['Destinatari', '[Fornitori di servizi (hosting, CRM/email) da elencare]. I dati non vengono pubblicati né ceduti a terzi.'],
    ['Conservazione', '[Periodo di conservazione da definire].'],
    [
      'Diritti',
      `Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento scrivendo a ${SITE.email}. Puoi proporre reclamo al Garante per la protezione dei dati personali.`,
    ],
  ],
  en: [
    [
      'Data controller',
      `Rainmakers (Milan, Italy). Contact: ${SITE.email}. [Company name, registered office and VAT number to be completed]`,
    ],
    [
      'Data we process',
      'Your email address and, if provided, your message and submission details, sent through the “Get contact details”, “Download the data” and “Suggest an update” forms. Website analytics are aggregated and contain no personal data.',
    ],
    [
      'Purpose and legal basis',
      'To handle your request (pre-contractual measures / legitimate interest) and, only with your optional consent, to send you updates about Italian Rainforest.',
    ],
    ['Recipients', '[Service providers (hosting, CRM/email) to be listed]. Data is never published or sold.'],
    ['Retention', '[Retention period to be defined].'],
    [
      'Your rights',
      `You can request access, rectification, erasure, restriction and portability, or object to processing, by writing to ${SITE.email}. You may lodge a complaint with the Italian Data Protection Authority (Garante).`,
    ],
  ],
} as const;

export async function generateMetadata({ params }: PageProps<'/[locale]/privacy'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: getDictionary(locale).meta.privacyTitle,
    alternates: alternates(locale, '/privacy'),
    // Draft: not indexed until the final text is published.
    robots: { index: false, follow: true },
  };
}

export default async function PrivacyPage({ params }: PageProps<'/[locale]/privacy'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <>
      <header className="border-b border-line">
        <div className="container-irf flex h-16 items-center">
          <a href={`/${locale}`} aria-label="Italian Rainforest — home">
            <Logo size={32} />
          </a>
        </div>
      </header>
      <main id="main" className="container-irf max-w-3xl py-16">
        <h1 className="h2 text-navy">{t.privacy.title}</h1>
        <p role="note" className="mt-4 rounded-xl bg-[#fff6e0] px-4 py-3 text-sm font-semibold text-[#6b4a00] ring-1 ring-[#f2d48a]">
          {t.privacy.draft}
        </p>
        <div className="mt-8 grid gap-6">
          {BODY[locale].map(([h, p]) => (
            <section key={h}>
              <h2 className="text-lg font-extrabold text-navy">{h}</h2>
              <p className="mt-2 leading-relaxed text-muted">{p}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer locale={locale} t={t.footer} />
    </>
  );
}
