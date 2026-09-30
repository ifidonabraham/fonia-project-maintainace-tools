import { notFound } from "next/navigation";
import { Board } from "../../../../components/Board";
import { requireUser } from "../../../../lib/auth/guards";
import { loadBoard } from "../../../../lib/server/board";

export const dynamic = "force-dynamic";

/**
 * The project board.
 *
 * The server renders the whole board — columns, cards, members, activity — then
 * hands the payload to the client component, which subscribes to the realtime
 * room using the `seq` from this same payload. First paint is complete, and the
 * socket only ever has to deliver *changes*.
 */
export default async function ProjectBoardPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { task } = await searchParams;

  const board = await loadBoard(user.id, id);
  if (!board) notFound();

  return (
    <Board
      project={board.project}
      columns={board.columns}
      tasks={board.tasks}
      members={board.members}
      activity={board.activity}
      initialSeq={board.seq}
      currentUser={user}
      initialTaskId={task}
    />
  );
}