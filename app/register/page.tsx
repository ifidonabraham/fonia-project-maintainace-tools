import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/AuthForm";
import { BrandSig } from "../../components/BrandSig";
import { Logo } from "../../components/Logo";
import { OCore } from "../../components/OCore";
import { getCurrentUser } from "../../lib/auth/guards";

export const metadata: Metadata = { title: "Create your account" };

const points = [
  "Create group projects with their own board and members.",
  "Assign tasks, set priorities and due dates.",
  "Comment on any task — @mention a teammate to notify them.",
  "Everything updates live for everyone on the board."
];

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; invite?: string; email?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <Logo />
        <div>
          <div className="eyebrow">A Fonia Labs Product</div>
          <h1>
            {params.invite
              ? <>You've been <span className="gradient-text">invited.</span></>
              : <>Start building <span className="gradient-text">in minutes.</span></>
            }
          </h1>
        </div>

        <div className="auth-points">
          {points.map((point) => (
            <div className="auth-point" key={point}>
              <OCore size={18} />
              <span>{point}</span>
            </div>
          ))}
        </div>

        {!params.invite ? (
          <div className="demo-note">
            <strong>Just exploring?</strong> The seeded demo accounts are{" "}
            <code>ifidon@fonialabs.dev</code> and <code>teammate@fonialabs.dev</code> —
            sign in to both (in two browsers) to watch the board update in real time.
          </div>
        ) : null}

        <div className="sidebar-spacer" />
        <BrandSig badge="A Fonia Labs Product" />
      </aside>

      <main className="auth-main">
        <AuthForm
          mode="register"
          next={params.next}
          inviteToken={params.invite}
          prefillEmail={params.email}
        />
      </main>
    </div>
  );
}