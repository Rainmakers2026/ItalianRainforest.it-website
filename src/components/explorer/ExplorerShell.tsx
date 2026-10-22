import type { ReactNode } from 'react';

/** Section frame shared by the lazy placeholder and the loaded explorer, so the swap is seamless. */
export function ExplorerShell({
  map,
  database,
}: {
  map: { header: ReactNode; body: ReactNode };
  database: { header: ReactNode; body: ReactNode };
}) {
  return (
    <>
      <section id="map" aria-labelledby="map-title" className="section bg-mist">
        <div className="container-irf">
          {map.header}
          {map.body}
        </div>
      </section>
      <section id="database" aria-labelledby="database-title" className="section bg-white">
        <div className="container-irf">
          {database.header}
          {database.body}
        </div>
      </section>
    </>
  );
}

/** Server-rendered section heading (crawlable without JavaScript). */
export function ExplorerHeader({
  id,
  eyebrow,
  title,
  lead,
  stamp,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  stamp: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="max-w-3xl">
        <p className="eyebrow text-savoia">{eyebrow}</p>
        <h2 id={id} className="h2 mt-3 text-navy">
          {title}
        </h2>
        <p className="lead mt-3 text-muted">{lead}</p>
      </div>
      {stamp}
    </div>
  );
}
