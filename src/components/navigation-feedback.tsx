"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const timeout = useRef<number | null>(null);
  const pending = pendingFrom === routeKey;

  useEffect(() => {
    function acknowledgeNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;

      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const sameDocument =
        destination.pathname === current.pathname &&
        destination.search === current.search;
      if (destination.origin !== current.origin || sameDocument) return;

      setPendingFrom(`${current.pathname}?${current.searchParams.toString()}`);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => setPendingFrom(null), 8_000);
    }

    document.addEventListener("click", acknowledgeNavigation, true);
    return () => {
      document.removeEventListener("click", acknowledgeNavigation, true);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    };
  }, []);

  return (
    <div className="navigation-feedback" data-active={pending || undefined}>
      <span aria-hidden="true" />
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? "Loading the next view…" : ""}
      </span>
    </div>
  );
}
