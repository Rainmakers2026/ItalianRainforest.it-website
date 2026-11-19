import type { ReactNode } from 'react';

/**
 * One section for the whole Rainforest (map + database behind a switch), shared
 * by the lazy placeholder and the loaded explorer so the swap is seamless.
 * `#database` stays a valid anchor: it opens the same section on the database view.
 */
export function ExplorerShell({ header, body }: { header: ReactNode; body: ReactNode }) {
  return (
    <section id="map" aria-labelledby="map-title" className="on-dark section relative isolate overflow-hidden text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_88%_0%,rgb(159_227_245/0.28)_0%,transparent_60%),radial-gradient(60%_50%_at_0%_30%,rgb(123_146_232/0.4)_0%,transparent_60%),radial-gradient(70%_50%_at_50%_100%,rgb(37_150_190/0.22)_0%,transparent_65%),linear-gradient(180deg,#1b3a5c_0%,#24497a_40%,#1b3a5c_100%)]"
      />
      {/* Faint dotted "network" texture behind the explorer. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.16] [background-image:radial-gradient(rgb(201_215_255)_1px,transparent_1.2px)] [background-size:26px_26px] [mask-image:linear-gradient(180deg,#000_0%,transparent_70%)]"
      />
      <span id="database" className="absolute top-0" aria-hidden="true" />
      <div className="container-irf">
        {header}
        {body}
      </div>
    </section>
  );
}

/** Server-rendered section heading (crawlable without JavaScript). */
export function ExplorerHeader({
  id,
  eyebrow,
  title,
  accent,
  lead,
  stamp,
}: {
  id: string;
  eyebrow: string;
  title: string;
  accent: string;
  lead: string;
  stamp: ReactNode;
}) {
  return (
    <div className="reveal flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="max-w-3xl">
        <p className="eyebrow text-sky">{eyebrow}</p>
        <h2 id={id} className="h2 mt-3 text-white">
          {title}{' '}
          <span className="bg-[linear-gradient(120deg,#c9d7ff_0%,#9fe3f5_100%)] bg-clip-text text-transparent">{accent}</span>
        </h2>
        <p className="lead mt-4 text-white/85">{lead}</p>
      </div>
      {stamp}
    </div>
  );
}
