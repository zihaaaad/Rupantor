import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Wires up the accessibility behaviour a modal dialog is expected to have.
 *
 * Returns a ref to attach to the dialog container. Pass `isOpen` when the
 * dialog is rendered conditionally from a parent that stays mounted, so the
 * hook re-arms as it opens rather than on the parent's mount. When it opens it
 * moves focus inside, keeps Tab cycling within the dialog while it is open, and
 * restores focus to whatever opened it on close — so a keyboard or screen-reader
 * user is not left tabbing through the page behind an open modal, and does not
 * lose their place when it closes.
 *
 * Pair it with role="dialog", aria-modal="true", and aria-labelledby on the
 * same element.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(isOpen: boolean = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isOpen) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Prefer the first real control; fall back to the container itself, which
    // needs tabIndex={-1} to be focusable at all.
    const firstFocusable = node.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? node).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      // Re-queried on each Tab rather than cached: dialog contents change
      // (buttons disable, fields appear) while the dialog is open.
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', handleKeyDown);
    return () => {
      node.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  return ref;
}
