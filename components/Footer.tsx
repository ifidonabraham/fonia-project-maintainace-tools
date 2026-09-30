import Link from "next/link";
import { Logo } from "./Logo";
import { OCore } from "./OCore";

const product = [
  ["Dashboard", "/dashboard"],
  ["Projects", "/projects"],
  ["My Tasks", "/tasks"],
  ["Notifications", "/notifications"],
  ["New Project", "/projects/new"]
];

const deliver = [
  ["Create group projects", "/projects"],
  ["Assign tasks", "/projects"],
  ["Comment on tasks", "/projects"],
  ["Real-time board", "/projects"],
  ["Presence & activity", "/notifications"]
];

const ecosystem = [
  ["FonTech", "/about"],
  ["The Fonia stack", "/about"],
  ["How it works", "/about"],
  ["Sign in", "/login"],
  ["Create account", "/register"]
];

/**
 * Site footer.
 *
 * The official "A Fonia Labs Product" endorsement badge (public/badges)
 * belongs here — every product in the ecosystem is badged the same way,
 * alongside the "Proudly built by FonTech" lockup.
 */
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid footer-grid-wide">
          <div>
            <Logo word="Fonia" />
            <p className="mt-md">
              Fonia Projects is the collaborative project management tool in the Fonia Labs
              ecosystem — group projects, task assignment, task-level discussion, and a
              board that updates in real time.
            </p>
            <p className="footer-brandline">Where Ideas Become Companies.</p>

            <div className="footer-built">
              <OCore size={22} />
              <span>
                <span className="footer-built-by">Proudly built by</span>
                <span className="footer-built-name">FonTech — A Fonia Labs Company</span>
              </span>
            </div>

            {/* Official endorsement badge — "A Fonia Labs Product" */}
            <img
              className="footer-product-badge"
              src="/badges/a-fonia-labs-product.svg"
              alt="A Fonia Labs Product"
              width={262}
              height={48}
              loading="lazy"
            />
          </div>

          <div>
            <h4>Product</h4>
            <ul className="list compact">
              {product.map(([label, href]) => (
                <li key={href + label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>What it does</h4>
            <ul className="list compact">
              {deliver.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Ecosystem</h4>
            <ul className="list compact">
              {ecosystem.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Connect</h4>
            <ul className="list compact">
              <li>
                <a
                  href="https://github.com/ifidonabraham"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a href="mailto:ifidonabraham249@gmail.com">Email Fonia Labs</a>
              </li>
              <li>
                <a
                  href="https://fonia-labs.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  fonia-labs.vercel.app
                </a>
              </li>
            </ul>

            <div className="footer-badge">
              <OCore size={16} />
              <span>Part of the Fonia Labs Ecosystem</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Fonia Projects. All rights reserved.</p>
          <p>A Fonia Labs Product · Founded and built by Ifidon Abraham.</p>
        </div>
      </div>
    </footer>
  );
}