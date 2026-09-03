import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      className={cn("size-7 shrink-0", className)}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 3 29 27H3L16 3Zm0 6.75L9.45 22.5h13.1L16 9.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BrandLockup({
  href = "/",
  inverse = false,
  className,
  label = "ScopeDelta home",
}: Readonly<{
  href?: string;
  inverse?: boolean;
  className?: string;
  label?: string;
}>) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-3 text-[0.95rem] font-semibold tracking-[-0.03em]",
        inverse ? "text-night-ink" : "text-foreground",
        className,
      )}
      aria-label={label}
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-md",
          inverse
            ? "bg-seal-soft text-seal-ink"
            : "bg-primary text-primary-foreground",
        )}
      >
        <BrandMark className="size-4" />
      </span>
      <span>ScopeDelta</span>
    </Link>
  );
}
