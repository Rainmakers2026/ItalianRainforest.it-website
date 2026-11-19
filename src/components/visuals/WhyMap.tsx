import Image from 'next/image';
import map from '../../../public/images/why-map.webp';

// Positions in % of the trimmed artwork (scripts/prepare-why-map.mjs): left, top, delay s.
// The concentric "partner" circles around Italy and the two verified badges send out pings.
const PINGS = [
  [60.5, 9, 0],
  [82.2, 25, 1.2],
  [15.3, 29.5, 2.4],
  [85.3, 46.1, 0.6],
  [15.3, 58.2, 1.8],
  [80.3, 65.9, 3],
  [23, 14.7, 2.1],
  [51.7, 34.2, 0.3],
  [72.9, 42.5, 1.5],
] as const;
// The big hubs (Milan, Rome, Naples, Palermo) and the umbrellas held up by the community sparkle.
const SPARKS = [
  [34.6, 15, 0.4],
  [48.6, 37.5, 1.6],
  [56.6, 44, 2.6],
  [52.5, 60.6, 0.9],
  [31.5, 80.1, 0],
  [45, 79.3, 0.8],
  [58.3, 79.3, 1.6],
  [71.5, 79.9, 2.4],
] as const;

/**
 * "Why" visual: Italy as a living network of the ecosystem's players, held up by
 * the community. The navy blob (transparent WebP) floats over a soft Savoia
 * halo on the white section; partner circles ping and hubs sparkle.
 * Transform and opacity only; motion stops under prefers-reduced-motion.
 */
export function WhyMap({ alt }: { alt: string }) {
  return (
    <div className="relative isolate mx-auto w-full max-w-[340px] sm:max-w-[440px] lg:max-w-[540px]">
      {/* Halo: a soft Savoia → sky glow behind the blob, wider than the artwork. */}
      <span
        aria-hidden="true"
        className="emblem-halo absolute -inset-[10%] -z-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(75_97_209/0.32)_0%,rgb(123_146_232/0.22)_55%,rgb(159_227_245/0.12)_78%,transparent_100%)] blur-xl"
      />
      <div className="emblem-float relative">
        <Image
          src={map}
          alt={alt}
          sizes="(min-width: 1024px) 540px, (min-width: 640px) 440px, 340px"
          className="h-auto w-full drop-shadow-[0_28px_48px_rgb(20_45_74/0.35)]"
          placeholder="empty"
        />
        {PINGS.map(([left, top, delay], i) => (
          <span
            key={`p${i}`}
            aria-hidden="true"
            className="node-ping absolute aspect-square w-[6%] rounded-full border-2 border-sky/80"
            style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
          />
        ))}
        {SPARKS.map(([left, top, delay], i) => (
          <span
            key={`s${i}`}
            aria-hidden="true"
            className="node-spark absolute aspect-square w-[5%] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.95),rgb(159_227_245/0.55)_45%,transparent)] mix-blend-screen"
            style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}
