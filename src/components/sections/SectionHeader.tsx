import type { ReactNode } from 'react';

export function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
  dark = false,
  align = 'left',
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  dark?: boolean;
  align?: 'left' | 'center';
  children?: ReactNode;
}) {
  return (
    <div className={`reveal max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
      <p className={`eyebrow ${dark ? 'text-sky' : 'text-savoia'}`}>{eyebrow}</p>
      <h2 id={id} className={`h2 mt-3 ${dark ? 'text-white' : 'text-navy'}`}>
        {title}
      </h2>
      {lead && <p className={`lead mt-4 ${dark ? 'text-white/85' : 'text-muted'}`}>{lead}</p>}
      {children}
    </div>
  );
}
