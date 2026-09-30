import { Logo } from "./Logo";

export function BrandSig({ badge }: { badge: string }) {
  return (
    <div className="brand-sig">
      <Logo size={30} />
      <div className="brand-sig-divider" />
      <span className="brand-sig-label">{badge}</span>
    </div>
  );
}