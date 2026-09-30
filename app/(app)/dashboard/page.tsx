import Link from "next/link";
import { db } from "../../../lib/db";
import { requireUser } from "../../../lib/auth/guards";
import { timeAgo } from "../../../lib/time";
import { summarizeEvent } from "../../../lib/serialize";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard.
 *
 * A server component: every number here is computed in SQL and sent as finished
 * HTML, so the first paint is already correct. The realtime layer keeps the
 * board pages live; this page is the "state of play" overview.
 */
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  const memberships = await db.projectMember.findMany({
    where: { userId: user.id, project: { archivedAt: null } },
    select: {
      projectId: true,
      role: true,
      project: { select: { name: true, color: true, key: true } }
    }
  });

  const projectIds = memberships.map((row) => row.projectId);

  const doneColumnIds = projectIds.length
    ? (
        await db.column.findMany({
          where: { projectId: { in: projectIds }, isDone: true },
          select: { id: true }
        })
      ).map((column) => column.id)
    : [];

  const [totalTasks, doneTasks, myOpen, myOverdue, recent] = await Promise.all([
    projectIds.length
      ? db.task.count({ where: { projectId: { in: projectIds } } })
      : Promise.resolve(0),
    doneColumnIds.length
      ? db.task.count({ where: { columnId: { in: doneColumnIds } } })
      : Promise.resolve(0),
    db.task.count({
      where: { assigneeId: user.id, projectId: { in: projectIds }, completedAt: null }
    }),
    db.task.count({
      where: { assigneeId: user.id, completedAt: null, dueDate: { lt: new Date() } }
    }),
    projectIds.length
      ? db.projectEvent.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: { seq: "desc" },
          take: 8,
          include: {
            actor: { select: { id: true, name: true, email: true, avatarColor: true } },
            project: { select: { id: true, name: true, color: true } }
          }
        })
      : Promise.resolve([])
  ]);

  const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h2>Welcome back, {user.name.split(" ")[0]}.</h2>
          <p>Here is where everything stands across your boards.</p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn primary" href="/projects/new">
            New project <span className="btn-arrow">→</span>
          </Link>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <p className="st-label">Projects</p>
          <p className="st-value">{projectIds.length}</p>
          <p className="st-sub">You are a member of</p>
        </div>
        <div className="stat-tile">
          <p className="st-label">Tasks</p>
          <p className="st-value">{totalTasks}</p>
          <p className="st-sub">
            {doneTasks} finished · {percent}%
          </p>
        </div>
        <div className="stat-tile">
          <p className="st-label">Assigned to me</p>
          <p className="st-value">{myOpen}</p>
          <p className="st-sub">Still open</p>
        </div>
        <div className="stat-tile">
          <p className="st-label">Overdue</p>
          <p className="st-value" style={myOverdue > 0 ? { color: "#fecaca" } : undefined}>
            {myOverdue}
          </p>
          <p className="st-sub">{myOverdue > 0 ? "Needs attention" : "Nothing late"}</p>
        </div>
      </div>

      <div className="grid cols-2">
        <section>
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div className="sh-copy">
              <h3>Your boards</h3>
            </div>
          </div>

          {memberships.length === 0 ? (
            <div className="empty-state">
              You are not on any projects yet.{" "}
              <Link href="/projects/new" style={{ color: "var(--cyan)" }}>
                Create your first one
              </Link>
              .
            </div>
          ) : (
            <div className="grid" style={{ gap: 12 }}>
              {memberships.map((membership) => (
                <Link
                  key={membership.projectId}
                  className="direct-link-card"
                  href={`/projects/${membership.projectId}`}
                >
                  <span
                    className="project-dot"
                    style={{
                      background: membership.project.color,
                      color: membership.project.color,
                      width: 10,
                      height: 10
                    }}
                  />
                  <span>
                    <p className="dlc-label">{membership.project.key}</p>
                    <p className="dlc-handle">{membership.project.name}</p>
                  </span>
                  <span className="badge" style={{ marginLeft: "auto" }}>
                    {membership.role}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div className="sh-copy">
              <h3>Recent activity</h3>
            </div>
          </div>

          {recent.length === 0 ? (
            <div className="empty-state">Nothing has happened yet.</div>
          ) : (
            <div className="card card-static">
              <div className="activity-list">
                {recent.map((event) => (
                  <div className="activity-item" key={event.seq}>
                    <span
                      className="avatar sm"
                      style={{ background: event.actor?.avatarColor ?? "#38bdf8" }}
                      aria-hidden="true"
                    >
                      {event.actor
                        ? event.actor.name
                            .split(" ")
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join("")
                        : "•"}
                    </span>
                    <span className="ai-text">
                      <b>{event.actor?.name ?? "Someone"}</b>{" "}
                      {summarizeEvent(event.type, event.payload)}{" "}
                      <span style={{ color: "var(--muted-soft)" }}>in {event.project.name}</span>
                      <br />
                      <span className="ai-time">{timeAgo(event.createdAt.toISOString())}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}