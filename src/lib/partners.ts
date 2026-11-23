import type { Locale } from '@/lib/i18n/config';

type Text = Record<Locale, string>;

export type Partner = {
  key: string;
  name: string;
  url: string;
  logo: string;
  /** Logo intrinsic size (public/partners, trimmed). */
  w: number;
  h: number;
  kind: Text;
  since?: number;
  description: Text;
};

/**
 * Partners of the initiative (source: Rainmakers' "I partner dell’iniziativa" slide).
 * Italian texts as provided; English translated for the /en page.
 */
export const PARTNERS: Partner[] = [
  {
    key: 'rainmakers',
    name: 'Rainmakers',
    url: 'https://www.rainmakers.it/',
    logo: '/partners/rainmakers.webp',
    w: 480,
    h: 163,
    kind: { it: 'Promotore', en: 'Promoter' },
    since: 2011,
    description: {
      it: 'Key player dell’ecosistema innovazione italiano attivo dal 2011 su innovazione e startup.',
      en: 'A key player in the Italian innovation ecosystem, working on innovation and startups since 2011.',
    },
  },
  {
    key: 'innovup',
    name: 'InnovUp',
    url: 'https://innovup.net/',
    logo: '/partners/innovup.webp',
    w: 480,
    h: 163,
    kind: { it: 'Associazione', en: 'Association' },
    since: 2012,
    description: {
      it: 'Associazione di riferimento per tutti gli abilitatori dell’ecosistema attiva dal 2012.',
      en: 'The reference association for all the enablers of the ecosystem, active since 2012.',
    },
  },
  {
    key: 'italian-tech-alliance',
    name: 'Italian Tech Alliance',
    url: 'https://www.italiantechalliance.com/',
    logo: '/partners/italian-tech-alliance.webp',
    w: 167,
    h: 50,
    kind: { it: 'Associazione', en: 'Association' },
    since: 2019,
    description: {
      it: 'Associazione di riferimento per tutti i fondi VC e scaleup dell’ecosistema attiva dal 2019.',
      en: 'The reference association for the ecosystem’s VC funds and scale-ups, active since 2019.',
    },
  },
  {
    key: 'social-innovation-monitor',
    name: 'Social Innovation Monitor',
    url: 'https://www.socialinnovationmonitor.com/',
    logo: '/partners/social-innovation-monitor.webp',
    w: 429,
    h: 200,
    kind: { it: 'Osservatorio', en: 'Research observatory' },
    description: {
      it: 'Osservatorio del PoliTo su incubatori, acceleratori, venture builder e business angel.',
      en: 'Politecnico di Torino’s observatory on incubators, accelerators, venture builders and business angels.',
    },
  },
  {
    key: 'startupbusiness',
    name: 'Startupbusiness',
    url: 'https://www.startupbusiness.it/',
    logo: '/partners/startupbusiness.webp',
    w: 480,
    h: 90,
    kind: { it: 'Media', en: 'Media' },
    since: 2009,
    description: {
      it: 'Media di riferimento dell’ecosistema startup e innovazione dal 2009.',
      en: 'The reference media outlet for the startup and innovation ecosystem since 2009.',
    },
  },
  {
    key: 'economyup',
    name: 'EconomyUp',
    url: 'https://www.economyup.it/',
    logo: '/partners/economyup.webp',
    w: 480,
    h: 116,
    kind: { it: 'Media', en: 'Media' },
    description: {
      it: 'Media di riferimento per il mondo PMI e corporate interessate all’innovazione.',
      en: 'The reference media outlet for SMEs and corporates interested in innovation.',
    },
  },
];
