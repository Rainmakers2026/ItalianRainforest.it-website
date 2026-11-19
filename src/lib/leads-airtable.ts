import 'server-only';

/**
 * Lead approval queue on Airtable — the ONLY Airtable write path of the site.
 *
 * People who sign up (downloads, embed code) are appended, create-only, to a
 * dedicated staging base/table (e.g. "IRF – Contatti da approvare"). Rainmakers
 * reviews them there and moves the approved ones into "Rainmakers OS" by hand or
 * with an Airtable automation. This module:
 *   - only creates records (no read, update or delete);
 *   - uses its own credentials (AIRTABLE_LEADS_TOKEN / _BASE_ID / _TABLE);
 *   - refuses to run if the staging base is the data base (AIRTABLE_BASE_ID), so the
 *     official database stays read-only. scripts/check-airtable-readonly.mjs enforces it.
 */

const API = 'https://api.airtable.com/v0';

type Config = { token: string; baseId: string; table: string };

function config(): Config | null {
  const token = process.env.AIRTABLE_LEADS_TOKEN;
  const baseId = process.env.AIRTABLE_LEADS_BASE_ID;
  const table = process.env.AIRTABLE_LEADS_TABLE;
  if (!token || !baseId || !table) return null;
  if (process.env.AIRTABLE_BASE_ID && baseId === process.env.AIRTABLE_BASE_ID)
    throw new Error('AIRTABLE_LEADS_BASE_ID must be a staging base, not the read-only data base');
  return { token, baseId, table };
}

export const airtableLeadsConfigured = () => {
  try {
    return !!config();
  } catch {
    return false;
  }
};

export type StagedLead = {
  kind: string;
  reason?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  referent?: string;
  company?: string;
  marketing?: boolean;
  locale: string;
  utm?: Record<string, string>;
  detail?: string;
};

/** Appends one lead to the approval table. Field names are documented in docs/data-schema.md. */
export async function stageLead(lead: StagedLead): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  const fields = {
    Nome: lead.firstName ?? '',
    Cognome: lead.lastName ?? '',
    Email: lead.email,
    Referente: lead.referent ?? '',
    Organizzazione: lead.company ?? '',
    Motivo: lead.reason ?? lead.kind,
    Dettaglio: lead.detail ?? '',
    Lingua: lead.locale,
    'Consenso marketing': !!lead.marketing,
    UTM: lead.utm ? Object.entries(lead.utm).map(([k, v]) => `${k}=${v}`).join('&') : '',
    'Ricevuto il': new Date().toISOString(),
    Stato: 'Da approvare',
  };
  const res = await fetch(`${API}/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(cfg.table)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable lead staging failed (${res.status})`);
}
