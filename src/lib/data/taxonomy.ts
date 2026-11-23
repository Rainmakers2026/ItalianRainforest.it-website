import type { Locale } from '@/lib/i18n/config';

/**
 * Canonical player types of the Italian Rainforest database.
 * `source` lists the raw PLAYER TYPE values used in the database export and in the
 * Airtable base "Rainmakers OS" (plus legacy spellings); `key` is the stable public
 * identifier used in URLs. Colours follow the family (one hue per family, varied in
 * lightness) so map and charts read by family first; every colour is always paired
 * with a label.
 */
export const CATEGORIES = [
  // ── Personal enablers
  {
    key: 'programs',
    family: 'personal',
    source: ['EMPOWERMENT PROGRAM', 'Empowerment Programs'],
    color: '#0B8A78',
    label: { it: 'Programmi di empowerment', en: 'Empowerment programmes' },
    short: { it: 'Programmi', en: 'Programmes' },
    definition: {
      it: 'Percorsi che rafforzano competenze e mentalità imprenditoriale di persone e team.',
      en: 'Programmes that build entrepreneurial skills and mindset in people and teams.',
    },
  },
  {
    key: 'training',
    family: 'personal',
    source: ['CORSI DI FORMAZIONE', 'Training'],
    color: '#3FB8A4',
    label: { it: 'Corsi di formazione', en: 'Training courses' },
    short: { it: 'Formazione', en: 'Training' },
    definition: {
      it: 'Scuole e corsi su imprenditorialità, innovazione e venture capital.',
      en: 'Schools and courses on entrepreneurship, innovation and venture capital.',
    },
  },
  // ── Business enablers
  {
    key: 'incubator',
    family: 'business',
    source: ['INCUBATOR/ACCELERATOR', 'Incubator / Accelerator'],
    color: '#1F5FBF',
    label: { it: 'Incubatori e acceleratori', en: 'Incubators & accelerators' },
    short: { it: 'Incubatori', en: 'Incubators' },
    definition: {
      it: 'Programmi che supportano le startup nelle prime fasi con servizi, mentoring e network.',
      en: 'Programmes supporting early-stage startups with services, mentoring and networks.',
    },
  },
  {
    key: 'venture-builder',
    family: 'business',
    source: ['VENTURE BUILDER/STARTUP STUDIO', 'Startup Studio / Venture Builder'],
    color: '#4F8FEA',
    label: { it: 'Venture builder e startup studio', en: 'Venture builders & startup studios' },
    short: { it: 'Venture builder', en: 'Venture builders' },
    definition: {
      it: 'Realtà che creano, co-fondano e fanno crescere nuove imprese.',
      en: 'Organisations that create, co-found and grow new companies.',
    },
  },
  {
    key: 'science-park',
    family: 'business',
    source: ['PST', 'Science Park'],
    color: '#14306B',
    label: { it: 'Parchi scientifici e tecnologici', en: 'Science & technology parks' },
    short: { it: 'PST', en: 'Science parks' },
    definition: {
      it: 'Poli che collegano ricerca, imprese e trasferimento tecnologico.',
      en: 'Hubs linking research, companies and technology transfer.',
    },
  },
  // ── Financial enablers
  {
    key: 'vc',
    family: 'financial',
    source: ['VC'],
    color: '#C2410C',
    label: { it: 'Venture capital', en: 'Venture capital' },
    short: { it: 'VC', en: 'VC' },
    definition: {
      it: 'Fondi che investono in equity in startup e scaleup.',
      en: 'Funds investing equity in startups and scale-ups.',
    },
  },
  {
    key: 'cvc',
    family: 'financial',
    source: ['CVC'],
    color: '#7C2D12',
    label: { it: 'Corporate venture capital', en: 'Corporate venture capital' },
    short: { it: 'CVC', en: 'CVC' },
    definition: {
      it: 'Veicoli di investimento di aziende che investono in startup.',
      en: 'Investment arms of corporations that back startups.',
    },
  },
  {
    key: 'angels',
    family: 'financial',
    source: ['BAN/CLUB DEAL', 'BAN / Club Deal'],
    color: '#E0782F',
    label: { it: 'Business angel e club deal', en: 'Business angels & club deals' },
    short: { it: 'Angel / club deal', en: 'Angels / club deals' },
    definition: {
      it: 'Network di business angel e club di investimento.',
      en: 'Business angel networks and investment clubs.',
    },
  },
  {
    key: 'crowdfunding',
    family: 'financial',
    source: ['CROWDFUNDING PLATFORM', 'Crowdfunding'],
    color: '#C99A12',
    label: { it: 'Piattaforme di crowdfunding', en: 'Crowdfunding platforms' },
    short: { it: 'Crowdfunding', en: 'Crowdfunding' },
    definition: {
      it: 'Portali autorizzati per raccogliere capitale da molti investitori.',
      en: 'Licensed portals raising capital from many investors.',
    },
  },
  {
    key: 'family-office',
    family: 'financial',
    source: ['FAMILY OFFICE'],
    color: '#A8552A',
    label: { it: 'Family office', en: 'Family offices' },
    short: { it: 'Family office', en: 'Family offices' },
    definition: {
      it: 'Strutture che gestiscono patrimoni familiari e investono anche in innovazione.',
      en: 'Firms managing family wealth that also invest in innovation.',
    },
  },
  {
    key: 'investor',
    family: 'financial',
    source: ['INVESTOR', 'Investor'],
    color: '#D9893F',
    label: { it: 'Investitori', en: 'Investors' },
    short: { it: 'Investitori', en: 'Investors' },
    definition: {
      it: 'Altri investitori in startup: fondi di trasferimento tecnologico, holding e network di investimento.',
      en: 'Other startup investors: tech-transfer funds, holdings and investment networks.',
    },
  },
  // ── Environmental enablers
  {
    key: 'institution',
    family: 'environmental',
    source: ['INSTITUTIONS', 'Institution'],
    color: '#1E6B3A',
    label: { it: 'Istituzioni', en: 'Institutions' },
    short: { it: 'Istituzioni', en: 'Institutions' },
    definition: {
      it: 'Enti pubblici e istituzionali che sostengono l’innovazione.',
      en: 'Public and institutional bodies supporting innovation.',
    },
  },
  {
    key: 'associations',
    family: 'environmental',
    source: ['ASSOCIATIONS', 'Association'],
    color: '#5E9E2E',
    label: { it: 'Associazioni', en: 'Associations' },
    short: { it: 'Associazioni', en: 'Associations' },
    definition: {
      it: 'Associazioni di categoria e network che rappresentano e connettono l’ecosistema.',
      en: 'Trade associations and networks representing and connecting the ecosystem.',
    },
  },
  {
    key: 'media',
    family: 'environmental',
    source: ['MEDIA', 'Media & Communities'],
    color: '#2F9C6A',
    label: { it: 'Media e community', en: 'Media & communities' },
    short: { it: 'Media', en: 'Media' },
    definition: {
      it: 'Testate, piattaforme e community dedicate all’innovazione.',
      en: 'Outlets, platforms and communities covering innovation.',
    },
  },
  {
    key: 'coworking',
    family: 'environmental',
    source: ['COWORKING', 'CoWorking'],
    color: '#8CC152',
    label: { it: 'Coworking', en: 'Coworking spaces' },
    short: { it: 'Coworking', en: 'Coworking' },
    definition: {
      it: 'Spazi di lavoro condivisi che ospitano community di innovatori.',
      en: 'Shared workspaces hosting communities of innovators.',
    },
  },
  // ── Outside the four families
  {
    key: 'other',
    family: null,
    source: ['ALTRI ABILITATORI', 'Other'],
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
    family: null,
    source: [],
    color: '#A3ACBF',
    label: { it: 'Da classificare', en: 'Not yet classified' },
    short: { it: 'Da classificare', en: 'Unclassified' },
    definition: {
      it: 'Player la cui tipologia è in corso di verifica.',
      en: 'Players whose type is being verified.',
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

/** PLAYER TYPE value → category. STARTUP and unknown values return null. */
export function categoryFromSource(raw: string): CategoryKey | null {
  return SOURCE_TO_KEY.get(raw.trim().toLowerCase()) ?? null;
}

export const categoryLabel = (key: CategoryKey, locale: Locale) => CATEGORY_BY_KEY[key].label[locale];

/**
 * The four kinds of enablers (same model as the ecosystem infographic). "other" and
 * "unclassified" stay outside them. Labels live in the dictionaries (what.families).
 */
export const CATEGORY_FAMILIES = [
  { key: 'personal', icon: 'book', color: '#0B8A78', categories: ['programs', 'training'] },
  { key: 'business', icon: 'rocket', color: '#1F5FBF', categories: ['incubator', 'venture-builder', 'science-park'] },
  { key: 'financial', icon: 'coins', color: '#C2410C', categories: ['vc', 'cvc', 'angels', 'crowdfunding', 'family-office', 'investor'] },
  { key: 'environmental', icon: 'landmark', color: '#1E6B3A', categories: ['institution', 'associations', 'media', 'coworking'] },
] as const satisfies readonly { key: string; icon: string; color: string; categories: readonly CategoryKey[] }[];
export type FamilyKey = (typeof CATEGORY_FAMILIES)[number]['key'];
export const FAMILY_BY_KEY = Object.fromEntries(CATEGORY_FAMILIES.map((f) => [f.key, f])) as Record<
  FamilyKey,
  (typeof CATEGORY_FAMILIES)[number]
>;

/** Status values of the STATUS column. Most rows are still being verified. */
export const STATUSES = ['active', 'unverified', 'inactive'] as const;
export type StatusKey = (typeof STATUSES)[number];
