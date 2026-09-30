import { AppFrame } from "../../components/AppFrame";
import { RealtimeProvider } from "../../components/Realtime";
import { ToastProvider } from "../../components/Toast";
import { REALTIME_PATH } from "../../lib/constants";
import { db } from "../../lib/db";
import { requireUser } from "../../lib/auth/guards";
import { toProjectSummaryDTO } from "../../lib/serialize";
import { unreadCount } from "../../lib/realtime/notify";

export const dynamic = "force-dynamic";

/**
 * The signed-in layout.
 *
 * Runs on the server: it resolves the session, gathers the sidebar data and the
 * unread count, then hands them to the client frame so the shell renders fully
 * formed — no empty sidebar, no badge popping in a moment later.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const memberships = await db.projectMember.findMany({
    where: { userId: user.id, project: { archivedAt: null } },
    orderBy: { joinedAt: "desc" },
    include: {
      project: { include: { _count: { select: { members: true, tasks: true } } } }
    }
  });

  const doneColumns = memberships.length
    ? await db.column.findMany({
        where: { projectId: { in: memberships.map((row) => row.projectId) }, isDone: true },
        select: { id: true }
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

  const unread = await unreadCount(user.id);

  return (
    <ToastProvider>
      <RealtimeProvider realtimePath={REALTIME_PATH} initialUnreadCount={unread}>
        <AppFrame user={user} projects={projects} initialUnreadCount={unread}>
          {children}
        </AppFrame>
      </RealtimeProvider>
    </ToastProvider>
  );
}