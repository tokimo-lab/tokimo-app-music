import { useEffect, useLayoutEffect, useRef, useState } from "react";

let bodyLocks = 0;
let bodyOverflow = "";

/** Keep playback overlays outside the mini player's fixed/sticky containing block. */
export function usePlaybackOverlay(open: boolean) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const windowSurface =
      anchorRef.current?.closest<HTMLElement>("[data-window-id]");
    const standalone = windowSurface?.hasAttribute("data-standalone-layout");
    setContainer(standalone ? document.body : (windowSurface ?? document.body));
  }, [open]);

  useEffect(() => {
    if (!open || container !== document.body) return;
    if (bodyLocks++ === 0) {
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--bodyLocks === 0) document.body.style.overflow = bodyOverflow;
    };
  }, [open, container]);

  return { anchorRef, container, viewport: container === document.body };
}

export function usePlaybackFocus(open: boolean, container: HTMLElement | null) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !container) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [open, container]);
  return dialogRef;
}

export function trapPlaybackFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const elements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0 &&
      !element.closest("[inert]"),
  );
  const first = elements[0];
  const last = elements.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === event.currentTarget)
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      document.activeElement === event.currentTarget)
  ) {
    event.preventDefault();
    first.focus();
  }
}
