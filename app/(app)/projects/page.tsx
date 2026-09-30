import Link from "next/link";
import { db } from "../../../lib/db";
import { requireUser } from "../../../lib/auth/guards";
import { toProjectSummaryDTO } from "../../../lib/serialize";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

/** The project directory — every board the signed-in user can open. */
export default async function ProjectsPage() {
  const user = await requireUser("/projects");

  const memberships = await db.projectMember.findMany({
    where: { userId: user.id },
    orderBy: { joinedAt: "desc" },
    include: {
      project: { include: { _count: { select: { members: true, tasks: true } } } }
    }
  });

  const projectIds = memberships.map((row) => row.projectId);
  const doneColumns = projectIds.length
    ? await db.column.findMany({
        where: { projectId: { in: projectIds }, isDone: true },
        select: { id: true, projectId: true }
      })
    : [];

  const doneCounts = new Map<string, number>();
  if (doneColumns.length > 0) {
    const grouped = await db.task.groupBy({
      by: ["projectId"],
      where: { columnId: { in: doneColumns.map((column) => column.id) } },
      _count: { _all: true }
    });
    for (const row of grouped) doneCounts.set(row.projectId, row._count._all);
  }

  const projects = memberships.map((row) =>
    toProjectSummaryDTO({
      id: row.project.id,
      key: row.project.key,
      name: row.project.name,
      description: row.project.description,
      color: row.project.color,
      createdAt: row.project.createdAt,
      role: row.role,
      memberCount: row.project._count.members,
      taskCount: row.project._count.tasks,
      doneCount: doneCounts.get(row.projectId) ?? 0
    })
  );

  const active = projects.filter((project) => project.taskCount !== project.doneCount);
  const complete = projects.filter(
    (project) => project.taskCount > 0 && project.taskCount === project.doneCount
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Projects</div>
          <h2>Every board you belong to.</h2>
          <p>Group projects with their own members, columns and work in flight.</p>
        </div>
        <Link className="btn primary" href="/projects/new">
          New project <span className="btn-arrow">→</span>
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          No projects yet.{" "}
          <Link href="/projects/new" style={{ color: "var(--cyan)" }}>
            Create one
          </Link>{" "}
          and invite a teammate.
        </div>
      ) : (
        <>
          <div className="grid cols-3">
            {active.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>

          {complete.length > 0 ? (
            <>
              <div className="section-head" style={{ margin: "40px 0 18px" }}>
                <div className="sh-copy">
                  <h3>Nothing outstanding</h3>
                  <p>Boards where every card is done.</p>
                </div>
              </div>
              <div className="grid cols-3">
                {complete.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function ProjectCard({ project }: { project: ReturnType<typeof toProjectSummaryDTO> }) {
  const percent =
    project.taskCount === 0 ? 0 : Math.round((project.doneCount / project.taskCount) * 100);

  return (
    <article className="card company-card">
      <div className="cc-top">
        <div>
          <span className="meta">{project.key}</span>
          <h3>{project.name}</h3>
        </div>
        <span className="badge">{project.role}</span>
      </div>

      <p className="cc-desc">
        {project.description || "No description yet."}
      </p>

      <div className="mt-md">
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${project.color}, var(--cyan))`
            }}
          />
        </div>
        <p className="text-sm mt-sm" style={{ margin: 0 }}>
          {project.doneCount} of {project.taskCount} tasks done · {project.memberCount}{" "}
          {project.memberCount === 1 ? "member" : "members"}
        </p>
      </div>

      <div className="link-row">
        <Link className="btn primary" href={`/projects/${project.id}`}>
          Open board
        </Link>
      </div>
    </article>
  );
}