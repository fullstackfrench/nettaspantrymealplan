'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function Dialog({ titleId, onClose, children }: {
  titleId: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      const target = previousFocus?.isConnected ? previousFocus : document.querySelector<HTMLElement>('[data-orders-list]');
      target?.focus({ preventScroll: true });
    };
  }, [mounted]);

  if (!mounted) return null;
  // Keep list spacing rules from offsetting the full-screen mobile dialog.
  return createPortal(
    <dialog ref={ref} aria-labelledby={titleId} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 bg-white p-0 text-ink shadow-lift backdrop:bg-brand-plum/70 backdrop:backdrop-blur-sm sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-[960px] sm:rounded-[1.5rem]">
      <div className="flex h-full max-h-[100dvh] flex-col sm:max-h-[90dvh]">{children}</div>
    </dialog>, document.body,
  );
}
