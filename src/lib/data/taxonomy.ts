import type { Locale } from '@/lib/i18n/config';

/**
 * Canonical category taxonomy. `source` lists the raw "Account Type" values
 * used in Airtable today; `key` is the stable public identifier used in URLs.
 * Colors are validated for distinguishability (incl. deuteranopia/protanopia)
 * against the light map surface; every colour is always paired with a label.
 */
export const CATEGORIES = [
  {
    key: 'vc',
    source: ['VC'],
    color: '#4B61D1',
    label: { it: 'Venture capital', en: 'Venture capital' },
    short: { it: 'VC', en: 'VC' },
    definition: {
      it: 'Fondi che investono in equity in startup e scaleup.',
      en: 'Funds investing equity in startups and scale-ups.',
    },
  },
  {
    key: 'incubator',
    source: ['Incubator / Accelerator'],
    color: '#1F8FB8',
    label: { it: 'Incubatori e acceleratori', en: 'Incubators & accelerators' },
    short: { it: 'Incubatori', en: 'Incubators' },
    definition: {
      it: 'Programmi che supportano startup nelle prime fasi con servizi, mentoring e network.',
      en: 'Programmes supporting early-stage startups with services, mentoring and networks.',
    },
  },
  {
    key: 'cvc',
    source: ['CVC'],
    color: '#14304F',
    label: { it: 'Corporate venture capital', en: 'Corporate venture capital' },
    short: { it: 'CVC', en: 'CVC' },
    definition: {
      it: 'Veicoli di investimento di aziende che investono in startup.',
      en: 'Investment arms of corporations that back startups.',
    },
  },
  {
    key: 'coworking',
    source: ['CoWorking'],
    color: '#D9692B',
    label: { it: 'Coworking', en: 'Coworking spaces' },
    short: { it: 'Coworking', en: 'Coworking' },
    definition: {
      it: 'Spazi di lavoro condivisi che ospitano community di innovatori.',
      en: 'Shared workspaces hosting communities of innovators.',
    },
  },
  {
    key: 'venture-builder',
    source: ['Startup Studio / Venture Builder'],
    color: '#8250C4',
    label: { it: 'Startup studio e venture builder', en: 'Startup studios & venture builders' },
    short: { it: 'Venture builder', en: 'Venture builders' },
    definition: {
      it: 'Realtà che creano e co-fondano nuove imprese.',
      en: 'Organisations that create and co-found new companies.',
    },
  },
  {
    key: 'angels',
    source: ['BAN / Club Deal'],
    color: '#B8860B',
    label: { it: 'Business angel e club deal', en: 'Business angels & club deals' },
    short: { it: 'Angel / club deal', en: 'Angels / club deals' },
    definition: {
      it: 'Network di business angel e club di investimento.',
      en: 'Business angel networks and investment clubs.',
    },
  },
  {
    key: 'institution',
    source: ['Institution'],
    color: '#2E8B57',
    label: { it: 'Istituzioni', en: 'Institutions' },
    short: { it: 'Istituzioni', en: 'Institutions' },
    definition: {
      it: 'Enti pubblici e istituzionali che sostengono l’innovazione.',
      en: 'Public and institutional bodies supporting innovation.',
    },
  },
  {
    key: 'media',
    source: ['Media & Communities'],
    color: '#C73E74',
    label: { it: 'Media e community', en: 'Media & communities' },
    short: { it: 'Media', en: 'Media' },
    definition: {
      it: 'Testate, piattaforme e community dedicate all’innovazione.',
      en: 'Outlets, platforms and communities covering innovation.',
    },
  },
  {
    key: 'programs',
    source: ['Empowerment Programs'],
    color: '#4FA3D9',
    label: { it: 'Programmi di empowerment', en: 'Empowerment programmes' },
    short: { it: 'Programmi', en: 'Programmes' },
    definition: {
      it: 'Iniziative di formazione e supporto all’imprenditorialità.',
      en: 'Training and entrepreneurship support initiatives.',
    },
  },
  {
    key: 'science-park',
    source: ['PST'],
    color: '#7A5230',
    label: { it: 'Parchi scientifici e tecnologici', en: 'Science & technology parks' },
    short: { it: 'PST', en: 'Science parks' },
    definition: {
      it: 'Poli che collegano ricerca, imprese e trasferimento tecnologico.',
      en: 'Hubs linking research, companies and technology transfer.',
    },
  },
  {
    key: 'other',
    source: ['Other'],
    color: '#6B7690',
    label: { it: 'Altri abilitatori', en: 'Other enablers' },
    short: { it: 'Altro', en: 'Other' },
    definition: {
      it: 'Altri soggetti che abilitano l’ecosistema.',
      en: 'Other organisations enabling the ecosystem.',
    },
  },
  {
    key: 'unclassified',
    source: [],
    color: '#A3ACBF',
    label: { it: 'Da classificare', en: 'Not yet classified' },
    short: { it: 'Da classificare', en: 'Unclassified' },
    definition: {
      it: 'Player la cui categoria è in corso di verifica.',
      en: 'Players whose category is being verified.',
    },
  },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as CategoryKey[];
export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CategoryKey, Category>;

const SOURCE_TO_KEY = new Map<string, CategoryKey>(
  CATEGORIES.flatMap((c) => c.source.map((s) => [s.toLowerCase(), c.key] as const)),
);

export function categoryFromSource(raw: string): CategoryKey | null {
  return SOURCE_TO_KEY.get(raw.trim().toLowerCase()) ?? null;
}

export const categoryLabel = (key: CategoryKey, locale: Locale) => CATEGORY_BY_KEY[key].label[locale];

/** Development stages, as used in the "Stage of Investment/Development" field. */
export const STAGES = [
  { key: 'idea', order: 1, label: { it: 'Idea o brevetto', en: 'Idea or patent' } },
  { key: 'prototype', order: 2, label: { it: 'Prototipo', en: 'Prototype' } },
  { key: 'early-revenue', order: 3, label: { it: 'Primi ricavi', en: 'Early revenue' } },
  { key: 'scaling', order: 4, label: { it: 'Scaling', en: 'Scaling' } },
  { key: 'growth', order: 5, label: { it: 'Crescita', en: 'Growth' } },
  { key: 'pre-ipo', order: 6, label: { it: 'Pre-IPO', en: 'Pre-IPO' } },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_BY_ORDER = new Map<number, StageKey>(STAGES.map((s) => [s.order, s.key]));
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, (typeof STAGES)[number]>;

/** Tag synonyms found in the legacy data, collapsed to one canonical spelling. */
export const TAG_SYNONYMS: Record<string, string> = {
  ia: 'AI',
  'artificial intelligence': 'AI',
  healthcare: 'Healthcare',
  'internet of things': 'IoT',
  iot: 'IoT',
  'decentralized finance': 'DeFi',
  defi: 'DeFi',
  saas: 'SaaS',
  'machine learning': 'Machine Learning',
  'big data': 'Big Data',
  'industria 4.0': 'Industry 4.0',
  logitech: 'LogisTech',
  sex: 'SexTech',
};
/** Placeholder values that must never be shown publicly. */
export const TAG_BLOCKLIST = new Set(['tbd', 'n/a', '-']);
