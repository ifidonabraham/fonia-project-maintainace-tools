import { OCore } from "./OCore";

export function BrandBadge({ badge }: { badge: string }) {
  return (
    <div className="brand-badge">
      <OCore size={17} />
      <span>{badge}</span>
    </div>
  );
}