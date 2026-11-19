import 'server-only';
import type { RawContactRecord } from './public-contact';

/**
 * MOCK data source for the /database-preview prototype. No external service is
 * contacted. Records mimic the shape of a raw Airtable record (`{ id, fields }`)
 * INCLUDING private fields, so the allowlist in public-contact.ts is exercised
 * exactly as it will be with the real base. Every private value below is a
 * fictitious placeholder (example.invalid, 000 numbers).
 */

/** Fixed timestamp of this demo dataset (not an Airtable sync date). */
export const MOCK_UPDATED_AT = '2026-10-24T10:00:00.000Z';

const PRIVATE_PLACEHOLDERS = {
  Email: 'private@example.invalid',
  Phone: '+39 000 000 0000',
  Mobile: '+39 000 000 0001',
  'Internal Notes': 'Nota interna fittizia — non deve mai uscire dal server.',
  'Investor Status': 'Fittizio / interno',
};

const LI = 'https://www.linkedin.com/in/dev-placeholder';

function rec(
  id: string,
  first: string,
  last: string,
  company: string | null,
  types: string[],
  jobTitle: string | null,
  linkedin: boolean,
): RawContactRecord {
  return {
    id,
    fields: {
      'Full Name': `${first} ${last}`.trim(),
      'First Name': first,
      'Last Name': last,
      Company: company ?? undefined,
      'Contact Type': types,
      'Job Title': jobTitle ?? undefined,
      LinkedIn: linkedin ? LI : undefined,
      ...PRIVATE_PLACEHOLDERS,
    },
  };
}

const RECORDS: RawContactRecord[] = [
  // Reference records from the brief.
  rec('rec001', 'Adib', 'Mouchanan', 'HubSpot', ['Investor/BA'], 'Corporate Sales Account Executive', true),
  rec('rec002', 'Andrea', 'Magenes', null, ['Investor/BA'], 'Sales Development Representative', false),
  rec('rec003', 'Diana', 'Ganea', 'Dealroom', [], 'Sales Representative', false),
  rec('rec004', 'Emanuele', 'Leonardi', 'MyTaxi', ['Advisor/Mentor'], 'Head of Business Development', true),
  rec('rec005', 'Fabio', 'De Martino', 'AF Toscano AG', ['Investor/BA', 'Advisor/Mentor'], 'Managing Director', true),
  rec('rec006', 'Francesco', 'Barone', 'Integra Fragrances', ['Investor/BA'], 'Chief Executive Officer', true),
  rec('rec007', 'Gabriele', 'Sardelli', 'HubSpot', ['Advisor/Mentor'], 'Senior Account Manager', true),
  rec('rec008', 'Giovanni', 'Ghirardi', 'Well-Work', ['Advisor/Mentor'], 'Co-Founder', false),
  rec('rec009', 'Leonardo', 'Trifiletti', null, ['Investor/BA'], null, true),
  rec('rec010', 'Luana', 'Tropeano', 'Mapadore', [], 'Marketing Manager', true),
  rec('rec011', 'Michele', 'Motta', 'Mapadore', ['Advisor/Mentor'], 'Chief Technology Officer', false),
  rec('rec012', 'Roberta', 'Vellucci', 'Ufleet', ['Investor/BA'], 'Head of Partnerships', true),

  // DEV FIXTURES — entirely fictitious people and companies, only to exercise
  // search, filters and pagination. Ids are prefixed `dev`.
  rec('dev013', 'Chiara', 'Fontanesi', 'Orizzonte Ventures', ['Investor/BA'], 'Investment Associate', true),
  rec('dev014', 'Marco', 'Belluzzi', 'Orizzonte Ventures', ['Investor/BA'], 'General Partner', true),
  rec('dev015', 'Sara', 'Quaglino', 'Brezza Labs', ['Advisor/Mentor'], 'Product Lead', false),
  rec('dev016', 'Tommaso', 'Righetti', 'Quarzo Capital', ['Investor/BA', 'Advisor/Mentor'], 'Partner', true),
  rec('dev017', 'Elena', 'Marchetti', 'Tessera Studio', [], 'Design Director', true),
  rec('dev018', 'Davide', 'Colombera', null, ['Advisor/Mentor'], 'Startup Mentor', true),
  rec('dev019', 'Giulia', 'Ferraris', 'Brezza Labs', ['Investor/BA'], 'Chief Financial Officer', false),
  rec('dev020', 'Lorenzo', 'Pagnotta', 'Faro Digitale', [], 'Sales Development Representative', false),
  rec('dev021', 'Martina', 'Savioli', 'Quarzo Capital', ['Investor/BA'], 'Analyst', true),
  rec('dev022', 'Riccardo', 'Albanese', 'Faro Digitale', ['Advisor/Mentor'], 'Founder & CEO', true),
  rec('dev023', 'Federica', 'Nardini', 'Tessera Studio', ['Advisor/Mentor'], 'Head of Growth', false),
  rec('dev024', 'Alessio', 'Cantù', null, ['Investor/BA'], 'Business Angel', true),
  rec('dev025', 'Valentina', 'Orsenigo', 'Lanterna Bio', [], 'Research Scientist', false),
  rec('dev026', 'Stefano', 'Zappalà', 'Lanterna Bio', ['Investor/BA'], 'Chief Operating Officer', true),
  rec('dev027', 'Ilaria', 'Benvenuti', 'Orizzonte Ventures', ['Advisor/Mentor'], 'Platform Manager', true),
  rec('dev028', 'Nicola', 'Ferretto', 'Molo Robotics', ['Investor/BA', 'Advisor/Mentor'], 'Board Member', false),
  rec('dev029', 'Beatrice', 'Lombardo', 'Molo Robotics', [], 'Software Engineer', true),
  rec('dev030', 'Paolo', 'Ricciardi', null, [], null, false),
];

/** Raw records, as a real data source would return them (private fields included). */
export async function getMockRecords(): Promise<RawContactRecord[]> {
  return RECORDS;
}
