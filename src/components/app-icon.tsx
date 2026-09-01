export type AppIconName =
  | "adoption"
  | "billing"
  | "chevron"
  | "clients"
  | "getting-started"
  | "home"
  | "inbox"
  | "members"
  | "my-work"
  | "operations"
  | "plus"
  | "projects"
  | "settings";

const paths: Record<AppIconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M5.5 10v9.5h13V10M9.5 19.5v-6h5v6" />
    </>
  ),
  clients: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.5-3.6 2.3-5.4 5.5-5.4s5 1.8 5.5 5.4" />
      <path d="M15 5.5a3 3 0 0 1 0 5.7M16 14c2.6.3 4.1 2 4.5 5" />
    </>
  ),
  projects: (
    <>
      <path d="M3.5 6.5h6l1.5 2h9.5v10h-17z" />
      <path d="M3.5 6.5v-2h6l1.5 2" />
    </>
  ),
  "my-work": (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="m8 9 1.5 1.5L12 8M14 9h3M8 15l1.5 1.5L12 14M14 15h3" />
    </>
  ),
  operations: (
    <>
      <path d="M4 18.5V12h4v6.5M10 18.5V5.5h4v13M16 18.5V9h4v9.5" />
      <path d="M3 20h18" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M4 13h4l1.5 2h5l1.5-2h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" />
    </>
  ),
  members: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2.8 19c.4-3.7 2.1-5.5 5.2-5.5s4.8 1.8 5.2 5.5M14 14.2c3.8-.8 6.1.8 6.5 4.8" />
    </>
  ),
  "getting-started": (
    <>
      <path d="M5 4.5h14v15H5z" />
      <path d="m8.5 10 2 2 5-5M8.5 16h7" />
    </>
  ),
  adoption: (
    <>
      <path d="M12 20V9" />
      <path d="M12 13C7 13 4 10.5 4 6c5 0 8 2.5 8 7ZM12 10c4.5 0 7-2.2 7-6-4.5 0-7 2.2-7 6Z" />
    </>
  ),
  billing: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 9h17M7 14h4" />
    </>
  ),
  chevron: <path d="m8.5 10 3.5 3.5 3.5-3.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function AppIcon({
  name,
  className,
}: Readonly<{ name: AppIconName; className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {paths[name]}
    </svg>
  );
}
