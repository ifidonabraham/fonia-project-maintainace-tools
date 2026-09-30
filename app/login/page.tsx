import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/AuthForm";
import { BrandSig } from "../../components/BrandSig";
import { Logo } from "../../components/Logo";
import { OCore } from "../../components/OCore";
import { getCurrentUser } from "../../lib/auth/guards";

export const metadata: Metadata = { title: "Sign in" };

const points = [
  "Your boards, tasks and comments — exactly where you left them.",
  "Realtime updates resume the moment you sign in.",
  "Notifications for assignments, mentions and replies."
];

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
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
            Welcome back to <span className="gradient-text">Fonia Projects.</span>
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

        <div className="sidebar-spacer" />
        <BrandSig badge="A Fonia Labs Product" />
      </aside>

      <main className="auth-main">
        <AuthForm mode="login" next={params.next} />
      </main>
    </div>
  );
}