import Link from "next/link";
import { Footer } from "../components/Footer";
import { SiteHeader } from "../components/SiteHeader";
import { OCore } from "../components/OCore";
import { getCurrentUser } from "../lib/auth/guards";

/**
 * Product landing page.
 *
 * Written in the Fonia Labs house style — dark navy, Poppins, pill buttons,
 * cyan accents — and it ends in the footer carrying the official
 * "A Fonia Labs Product" badge. Everything it claims is verifiable inside the
 * app: projects, assignment, comments, notifications and the realtime board.
 */

const features = [
  {
    n: "01",
    title: "Group projects",
    text: "Spin up a project with its own key, colour and members. Every project starts with a sensible pipeline you can reshape."
  },
  {
    n: "02",
    title: "Assign tasks",
    text: "Cards carry an owner, a priority and a due date. Drag them between columns; the person you assigned sees it instantly."
  },
  {
    n: "03",
    title: "Discuss inside the task",
    text: "Comment threads live on the card, not in a chat app. Mention a teammate with @name and they get notified."
  },
  {
    n: "04",
    title: "Realtime board",
    text: "Two people, one board, no refreshing. Moves, edits and new comments appear as they happen over WebSockets."
  },
  {
    n: "05",
    title: "Notifications",
    text: "Assignment, mentions, replies and completed work — a bell, a live count, and a deep link to the exact card."
  },
  {
    n: "06",
    title: "Real permissions",
    text: "Membership is checked on the server for every read, every write and every socket room. The UI hides what you cannot do; the API enforces it."
  }
];

const steps = [
  {
    title: "Create a project",
    text: "Name it, give it a short key, pick an accent colour, invite teammates by email."
  },
  {
    title: "Plan the work",
    text: "Backlog, in progress, in review, done — rename or extend the columns to match how your team actually operates."
  },
  {
    title: "Work it live",
    text: "Assign, move, comment. Everyone on the board sees the same state within a moment, and nothing is lost if a tab was closed."
  }
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user} />

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <div className="eyebrow">A Fonia Labs Product</div>
              <h1>
                Plan, assign, and ship — <span className="gradient-text">together.</span>
              </h1>
              <p className="wide-text">
                Fonia Projects is a collaborative project management tool for teams
                that outgrew lists and group chats.
              </p>
              <p className="muted-line">
                Group projects with real membership, tasks you can assign, comment
                threads on every card, and a board that updates in real time — no
                refresh button, no stale screens, no “can you re-send that?”.
              </p>

              <div className="actions">
                {user ? (
                  <Link className="btn primary" href="/dashboard">
                    Open your dashboard <span className="btn-arrow">→</span>
                  </Link>
                ) : (
                  <Link className="btn primary" href="/register">
                    Create your first board <span className="btn-arrow">→</span>
                  </Link>
                )}
                <Link className="btn" href="/login">
                  Sign in
                </Link>
              </div>

              <div className="hero-strip">
                <span>Group projects</span>
                <span>Task assignment</span>
                <span>Task discussion</span>
                <span>Realtime board</span>
                <span>Notifications</span>
              </div>
            </div>

            <div className="orbit" aria-hidden="true">
              <div className="orbit-ring" />
              <div className="orbit-ring r2" />
              <div className="orbit-ring r3" />
              <span className="orbit-dot d1" />
              <span className="orbit-dot d2" />
              <span className="orbit-dot d3" />
              <span className="orbit-dot d4" />
              <span className="orbit-dot d5" />
              <span className="orbit-dot d6" />
              <div className="orbit-core">
                <OCore size={150} animation="full" uid="hero" />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="section tight" id="features">
          <div className="container">
            <div className="section-head">
              <div className="sh-copy">
                <div className="eyebrow">What you get</div>
                <h2>Everything a working team needs — and nothing it does not.</h2>
              </div>
              <p className="muted-note">
                Six pieces, all built on one data model: projects, members, columns,
                tasks, comments and notifications.
              </p>
            </div>

            <div className="grid cols-3">
              {features.map((feature) => (
                <article className="card" key={feature.n}>
                  <span className="pill-num">{feature.n}</span>
                  <h3 className="mt-sm">{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Realtime explanation */}
        <section className="section" id="realtime">
          <div className="container split">
            <div>
              <div className="eyebrow">Under the hood</div>
              <h2>Realtime that survives a closed tab.</h2>
            </div>
            <div>
              <p className="lead">
                The board is driven by a WebSocket gateway written for this project —
                authentication, rooms, presence and replay are part of the app rather
                than a black box.
              </p>
              <p className="mt-sm">
                Every write is committed to the database first, then published. That
                ordering means a client is never told about a change the database does
                not have, which is what makes reconnection safe: a socket that drops
                asks for everything after its last event number and replays exactly
                what it missed. If a network blocks WebSockets entirely, the app falls
                back to a server-sent event stream so the board keeps working.
              </p>

              <div className="grid cols-2 mt-md">
                <div className="info-card">
                  <div className="ic-icon">⌁</div>
                  <h3 className="ic-title">Live presence</h3>
                  <p className="ic-text">
                    See who has the board open right now, and a typing indicator when
                    someone is writing a comment on a card.
                  </p>
                </div>
                <div className="info-card">
                  <div className="ic-icon">↺</div>
                  <h3 className="ic-title">Reconnect replay</h3>
                  <p className="ic-text">
                    Close the laptop, come back, and the board catches up from the
                    event log instead of a full reload.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="section tight" id="how">
          <div className="container">
            <div className="section-head">
              <div className="sh-copy">
                <div className="eyebrow">How it works</div>
                <h2>From empty board to moving work in three steps.</h2>
              </div>
            </div>

            <div className="grid cols-3">
              {steps.map((step, index) => (
                <article className="card" key={step.title}>
                  <span className="pill-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-sm">{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section tight">
          <div className="container">
            <div className="cta-block">
              <h2>Open a board and put your team on it.</h2>
              <p>
                Fonia Projects runs locally with its own database, its own auth and its
                own realtime gateway — a complete full-stack product, part of the Fonia
                Labs ecosystem.
              </p>
              <div className="actions">
                {user ? (
                  <Link className="btn primary" href="/dashboard">
                    Go to dashboard <span className="btn-arrow">→</span>
                  </Link>
                ) : (
                  <Link className="btn primary" href="/register">
                    Create your account <span className="btn-arrow">→</span>
                  </Link>
                )}
                <Link className="btn" href="/login">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}