import Link from "next/link";
import { OCore } from "./OCore";

/**
 * The Fonia lockup. The wordmark word itself changes per product
 * ("Fonia" for the group, "Projects" for this tool) while the LABS rule
 * and the O-core mark stay identical across the ecosystem.
 */
export function Logo({
  size = 38,
  word = "Fonia",
  href = "/"
}: {
  size?: number;
  word?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="logo-lockup" aria-label="Fonia Projects — home">
      <OCore size={size} animation="subtle" uid="logo" />
      <span className="logo-text">
        <span className="logo-word">
          {word.slice(0, word.length - 1)}
          <span className="lw-blue">{word.slice(-1)}</span>
        </span>
        <span className="logo-sub">
          <span className="logo-rule" />
          LABS
          <span className="logo-rule" />
        </span>
      </span>
    </Link>
  );
}