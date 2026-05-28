import { User } from "lucide-react";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">
      {children}
    </h2>
  );
}

export function PersonCard({
  name,
  sub,
  profilePath,
}: {
  name: string;
  sub?: string;
  profilePath?: string | null;
}) {
  return (
    <div className="w-28 shrink-0 text-center">
      <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
        {profilePath ? (
          <img
            src={profilePath}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="h-8 w-8 text-[var(--text-muted)]" />
        )}
      </div>
      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
        {name}
      </p>
      {sub && (
        <p className="truncate text-xs text-[var(--text-muted)]">{sub}</p>
      )}
    </div>
  );
}
