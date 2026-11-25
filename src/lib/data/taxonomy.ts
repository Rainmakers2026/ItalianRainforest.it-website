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
  // ── Financial enablers
  {
    key: 'vc',
    family: 'financial',
    source: ['VC', 'INVESTOR', 'Investor'],
    color: '#C2410C',
    label: { it: 'Venture capital', en: 'Venture capital' },
    short: { it: 'VC', en: 'VC' },
    definition: {
      it: 'Fondi che investono in equity in startup e scaleup.',
      en: 'Funds investing equity in startups and scale-ups.',
    },
  },
  {
    key: 'angels',
    family: 'financial',
    source: ['BAN', 'BAN/CLUB DEAL', 'BAN / Club Deal'],
    color: '#E0782F',
    label: { it: 'Business angel network (BAN)', en: 'Business angel networks (BAN)' },
    short: { it: 'BAN', en: 'BAN' },
    definition: {
      it: 'Network e club di business angel che investono capitali propri, spesso insieme, nelle prime fasi delle startup.',
      en: 'Networks and clubs of business angels investing their own money, often together, in early-stage startups.',
    },
  },
  {
    key: 'regional-finance',
    family: 'financial',
    source: ['FINANZIARIE REGIONALI'],
    color: '#9A3412',
    label: { it: 'Finanziarie regionali', en: 'Regional financial agencies' },
    short: { it: 'Finanziarie reg.', en: 'Regional finance' },
    definition: {
      it: 'Società finanziarie e di sviluppo delle Regioni che sostengono le startup del territorio con fondi, coinvestimenti e bandi.',
      en: 'Financial and development companies of the Italian regions backing local startups through funds, co-investment and calls.',
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
    key: 'crowdfunding',
    family: 'financial',
    source: ['CROWDFUNDING', 'CROWDFUNDING PLATFORM', 'Crowdfunding'],
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
    key: 'banks',
    family: 'financial',
    source: ['BANCHE PER STARTUP'],
    color: '#D9893F',
    label: { it: 'Banche per startup', en: 'Banks for startups' },
    short: { it: 'Banche', en: 'Banks' },
    definition: {
      it: 'Banche con programmi, sportelli e strumenti di credito dedicati alle startup.',
      en: 'Banks with programmes, desks and lending products dedicated to startups.',
    },
  },
  // ── Personal enablers
  {
    key: 'university',
    family: 'personal',
    source: ['CORSI UNIVERSITARI PUBBLICI'],
    color: '#0B8A78',
    label: { it: 'Corsi universitari pubblici', en: 'Public university programmes' },
    short: { it: 'Università', en: 'Universities' },
    definition: {
      it: 'Corsi, laboratori e percorsi di università pubbliche su imprenditorialità e innovazione.',
      en: 'Courses, labs and programmes of public universities on entrepreneurship and innovation.',
    },
  },
  {
    key: 'training',
    family: 'personal',
    source: ['PERCORSI FORMATIVI PRIVATI', 'CORSI DI FORMAZIONE', 'Training'],
    color: '#3FB8A4',
    label: { it: 'Percorsi formativi privati', en: 'Private training programmes' },
    short: { it: 'Formazione privata', en: 'Private training' },
    definition: {
      it: 'Scuole, academy e corsi privati su imprenditorialità, innovazione e venture capital.',
      en: 'Private schools, academies and courses on entrepreneurship, innovation and venture capital.',
    },
  },
  {
    key: 'mentors',
    family: 'personal',
    source: ['GRUPPI DI MENTOR', 'EMPOWERMENT PROGRAM', 'Empowerment Programs'],
    color: '#0E5F55',
    label: { it: 'Gruppi di mentor', en: 'Mentor groups' },
    short: { it: 'Mentor', en: 'Mentors' },
    definition: {
      it: 'Reti di imprenditori e manager esperti che affiancano founder e team con mentoring e percorsi di crescita.',
      en: 'Networks of experienced entrepreneurs and managers who support founders and teams through mentoring and growth programmes.',
    },
  },
  // ── Environmental enablers
  {
    key: 'institution',
    family: 'environmental',
    source: ['ISTITUZIONI', 'INSTITUTIONS', 'Institution'],
    color: '#1E6B3A',
    label: { it: 'Istituzioni', en: 'Institutions' },
    short: { it: 'Istituzioni', en: 'Institutions' },
    definition: {
      it: 'Enti pubblici e istituzionali che sostengono l’innovazione.',
      en: 'Public and institutional bodies supporting innovation.',
    },
  },
  {
    key: 'media',
    family: 'environmental',
    source: ['MEDIA', 'Media & Communities'],
    color: '#2F9C6A',
    label: { it: 'Media', en: 'Media' },
    short: { it: 'Media', en: 'Media' },
    definition: {
      it: 'Testate, piattaforme e community dedicate all’innovazione.',
      en: 'Outlets, platforms and communities covering innovation.',
    },
  },
  {
    key: 'associations',
    family: 'environmental',
    source: ['ASSOCIAZIONI DI CATEGORIA', 'ASSOCIATIONS', 'Association'],
    color: '#5E9E2E',
    label: { it: 'Associazioni di categoria', en: 'Trade associations' },
    short: { it: 'Associazioni', en: 'Associations' },
    definition: {
      it: 'Associazioni di categoria e network che rappresentano e connettono l’ecosistema.',
      en: 'Trade associations and networks representing and connecting the ecosystem.',
    },
  },
  // ── Business enablers
  {
    key: 'incubator',
    family: 'business',
    source: ['INCUBATOR/ACCELERATOR', 'INCUBATOR / ACCELERATOR', 'Incubator / Accelerator', 'PST', 'Science Park', 'COWORKING', 'CoWorking'],
    color: '#1F5FBF',
    label: { it: 'Incubatori e acceleratori', en: 'Incubators & accelerators' },
    short: { it: 'Incubatori', en: 'Incubators' },
    definition: {
      it: 'Programmi e spazi che supportano le startup nelle prime fasi con servizi, mentoring e network, inclusi parchi scientifici e coworking per startup.',
      en: 'Programmes and spaces supporting early-stage startups with services, mentoring and networks, including science parks and startup coworking spaces.',
    },
  },
  {
    key: 'venture-builder',
    family: 'business',
    source: ['VENTURE BUILDER', 'VENTURE BUILDER/STARTUP STUDIO', 'Startup Studio / Venture Builder'],
    color: '#4F8FEA',
    label: { it: 'Venture builder', en: 'Venture builders' },
    short: { it: 'Venture builder', en: 'Venture builders' },
    definition: {
      it: 'Realtà che creano, co-fondano e fanno crescere nuove imprese insieme a founder, corporate e investitori.',
      en: 'Organisations that create, co-found and grow new companies together with founders, corporates and investors.',
    },
  },
  {
    key: 'startup-studio',
    family: 'business',
    source: ['STARTUP STUDIO'],
    color: '#14306B',
    label: { it: 'Startup studio', en: 'Startup studios' },
    short: { it: 'Startup studio', en: 'Startup studios' },
    definition: {
      it: 'Team stabili che generano idee in proprio e lanciano in serie nuove startup, condividendo risorse e competenze.',
      en: 'Standing teams that generate their own ideas and launch new startups in series, sharing resources and skills.',
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

const sourceKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\s*\/\s*/g, '/');
const SOURCE_TO_KEY = new Map<string, CategoryKey>(
  CATEGORIES.flatMap((c) => c.source.map((s) => [sourceKey(s), c.key] as const)),
);

/** MAIN TYPE value → category (spaces and case normalised). STARTUP and unknown values return null. */
export function categoryFromSource(raw: string): CategoryKey | null {
  return SOURCE_TO_KEY.get(sourceKey(raw)) ?? null;
}

export const categoryLabel = (key: CategoryKey, locale: Locale) => CATEGORY_BY_KEY[key].label[locale];

/**
 * The four kinds of enablers (same model as the ecosystem infographic). "other" and
 * "unclassified" stay outside them. Labels live in the dictionaries (what.families).
 */
export const CATEGORY_FAMILIES = [
  { key: 'financial', icon: 'coins', color: '#C2410C', categories: ['vc', 'angels', 'regional-finance', 'cvc', 'crowdfunding', 'family-office', 'banks'] },
  { key: 'personal', icon: 'book', color: '#0B8A78', categories: ['university', 'training', 'mentors'] },
  { key: 'environmental', icon: 'landmark', color: '#1E6B3A', categories: ['institution', 'media', 'associations'] },
  { key: 'business', icon: 'rocket', color: '#1F5FBF', categories: ['incubator', 'venture-builder', 'startup-studio'] },
] as const satisfies readonly { key: string; icon: string; color: string; categories: readonly CategoryKey[] }[];
export type FamilyKey = (typeof CATEGORY_FAMILIES)[number]['key'];
export const FAMILY_BY_KEY = Object.fromEntries(CATEGORY_FAMILIES.map((f) => [f.key, f])) as Record<
  FamilyKey,
  (typeof CATEGORY_FAMILIES)[number]
>;

/** Status values of the STATUS column. Most rows are still being verified. */
export const STATUSES = ['active', 'unverified', 'inactive'] as const;
export type StatusKey = (typeof STATUSES)[number];
