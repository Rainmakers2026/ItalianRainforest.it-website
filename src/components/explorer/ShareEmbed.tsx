'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { useLeadProfile, type LeadProfile } from '@/lib/lead-profile';
import { newRequestId, originOf, recordGatedEvent, type Origin } from '@/lib/submission';
import { LOCALES, type Locale } from '@/lib/i18n/config';
import { SITE } from '@/lib/site';
import { Icon } from '../ui/Icon';
import { useExplorer } from './ExplorerProvider';

/**
 * "Sharing is caring": copy-paste iframe for the map or the database, IT or EN.
 * The code is unlocked by the same one-time sign-up as the downloads.
 */
export function ShareEmbed({ kind }: { kind: 'map' | 'database' }) {
  const { t, locale, requireLead } = useExplorer();
  const profile = useLeadProfile();
  const unlocked = !!profile;
  const [lang, setLang] = useState<Locale>(locale);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const codeId = useId();
  const path = `/${lang}/embed/${kind}`;
  const title =
    kind === 'map'
      ? lang === 'it'
        ? 'Mappa Italian Rainforest'
        : 'Italian Rainforest map'
      : lang === 'it'
        ? 'Database Italian Rainforest'
        : 'Italian Rainforest database';
  const code = `<iframe src="${SITE.url}${path}" width="100%" height="640" style="border:0;border-radius:12px" loading="lazy" title="${title}" allow="clipboard-write"></iframe>`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) {
          track('embed_code_view', { kind });
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [kind]);

  /** Sign-up (first time) → copy. Each copy is recorded (sharing_is_caring_registrations, EVENT). */
  const copy = (cta: string) => {
    const ctx = { origin: originOf(`share_${kind}`, cta), embedKind: kind, embedLocale: lang };
    requireLead('embed', (p) => void doCopy(p, ctx), ctx);
  };
  const doCopy = async (p: LeadProfile, ctx: { origin: Origin; embedKind: 'map' | 'database'; embedLocale: Locale }) => {
    // One copy at a time: a double click never records two events.
    if (inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    try {
      await recordGatedEvent(p, { reason: 'embed', requestId: newRequestId(), ...ctx });
    } catch {
      setFailed(true);
      return;
    } finally {
      inFlight.current = false;
    }
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.getElementById(codeId) as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    track('embed_code_copy', { kind, lang });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      ref={ref}
      id={`${kind}-embed`}
      className="on-dark reveal mt-8 grid gap-5 rounded-[var(--radius-card)] bg-[linear-gradient(135deg,#3a52c2,#4b61d1_55%,#6079e0)] p-6 text-white shadow-[0_24px_50px_-28px_rgb(27_58_92/0.8)] md:grid-cols-[0.9fr_1.1fr] md:items-center md:p-7"
    >
      <div>
        <h3 className="text-2xl font-black tracking-[-0.02em]">{t.share.eyebrow}</h3>
        <p className="mt-1 text-lg font-bold">{t.share.title}</p>
        <p className="mt-1 text-white/85">{kind === 'map' ? t.share.mapText : t.share.databaseText}</p>
        <p className="mt-3 text-sm text-white/90">{t.share.free}</p>
      </div>
      <div className="on-dark min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor={codeId} className="text-xs font-bold text-white/75">
            {t.share.codeLabel}
          </label>
          <div role="group" aria-label={t.share.language} className="flex rounded-full bg-white/10 p-0.5 text-xs font-bold">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`min-h-7 rounded-full px-2.5 uppercase ${lang === l ? 'bg-white text-navy' : 'text-white/80 hover:text-white'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <textarea
          id={codeId}
          readOnly
          value={unlocked ? code : code.replace(/src="[^"]+"/, 'src="https://…"')}
          rows={3}
          onFocus={(e) => (unlocked ? e.currentTarget.select() : copy('code_focus'))}
          aria-describedby={unlocked ? undefined : `${codeId}-locked`}
          className={`w-full resize-none rounded-xl bg-deep/70 p-3 font-mono text-[0.75rem] leading-relaxed text-sky ring-1 ring-white/15 ${unlocked ? '' : 'blur-[3px] select-none'}`}
        />
        {!unlocked && (
          <p id={`${codeId}-locked`} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-white/85">
            <Icon name="lock" size={14} />
            {t.share.locked}
          </p>
        )}
        {failed && (
          <p role="alert" className="mt-2 text-xs font-semibold text-white">
            {t.share.copyError}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => copy(unlocked ? 'copy_button' : 'unlock_button')} className="btn btn-light btn-sm">
            <Icon name={copied ? 'check' : 'copy'} size={16} />
            <span aria-live="polite">{copied ? t.share.copied : unlocked ? t.share.copy : t.share.unlock}</span>
          </button>
          <a href={path} target="_blank" rel="noopener" className="btn btn-ghost-dark btn-sm">
            <Icon name="external" size={16} />
            {t.share.preview}
          </a>
        </div>
      </div>
    </div>
  );
}
