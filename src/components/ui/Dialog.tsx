'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Accessible modal built on the native <dialog>: inert background, focus
 * containment, Escape to close and focus restoration on close.
 * `variant` controls placement: centred modal, right drawer (desktop) that
 * becomes a bottom sheet on mobile.
 */
export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  children,
  variant = 'modal',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  closeLabel: string;
  children: ReactNode;
  variant?: 'modal' | 'drawer';
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnFocus.current = document.activeElement;
      el.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => {
      document.documentElement.style.overflow = '';
      (returnFocus.current as HTMLElement | null)?.focus?.();
      onClose();
    };
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [onClose]);

  const placement =
    variant === 'drawer'
      ? 'm-0 mt-auto h-[92dvh] max-h-[92dvh] w-full max-w-none rounded-t-2xl md:ml-auto md:mt-0 md:h-dvh md:max-h-dvh md:w-[min(460px,100vw)] md:rounded-none md:rounded-l-2xl'
      : 'm-auto w-[min(520px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] rounded-2xl';

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : title}
      className={`${placement} overflow-hidden border-0 bg-white p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-deep/55 backdrop:backdrop-blur-[2px] open:flex open:flex-col`}
      onClick={(e) => {
        // Click on the backdrop closes the dialog.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        {title ? (
          <h2 id={labelledBy} className="text-lg leading-snug font-extrabold text-navy">
            {title}
          </h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="-mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
          aria-label={closeLabel}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
    </dialog>
  );
}
