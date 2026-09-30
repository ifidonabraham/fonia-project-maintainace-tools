"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "../lib/client/api";
import type {
  ActivityDTO,
  ColumnDTO,
  MemberDTO,
  ProjectSummaryDTO,
  TaskDTO,
  UserDTO
} from "../lib/types";
import { useRealtime } from "./Realtime";
import { useToast } from "./Toast";
import { TaskDrawer } from "./TaskDrawer";
import { MembersPanel } from "./MembersPanel";
import { BoardHeader } from "./BoardHeader";
import { BoardColumn } from "./BoardColumn";

type Props = {
  project: ProjectSummaryDTO;
  columns: ColumnDTO[];
  tasks: TaskDTO[];
  members: MemberDTO[];
  activity: ActivityDTO[];
  initialSeq: number;
  currentUser: UserDTO;
  initialTaskId?: string;
};

/**
 * The kanban board.
 *
 * Data flow, deliberately one-directional:
 *
 *   server render → props → local state → optimistic update → API → realtime frame
 *
 * A drop moves the card in local state immediately and then tells the server. If
 * the server disagrees (someone else moved it first) the change is rolled back
 * and the board refreshed, so the user never keeps looking at a lie.
 */
export function Board({
  project,
  columns: initialColumns,
  tasks: initialTasks,
  members: initialMembers,
  activity: initialActivity,
  initialSeq,
  currentUser,
  initialTaskId
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const { registerProject, presenceFor } = useRealtime();

  const [columns, setColumns] = useState(initialColumns);
  const [tasks, setTasks] = useState(initialTasks);
  const [members, setMembers] = useState(initialMembers);
  const [activity, setActivity] = useState(initialActivity);

  const [openTaskId, setOpenTaskId] = useState<string | null>(initialTaskId ?? null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const canManage = project.role === "owner" || project.role === "admin";
  const presence = presenceFor(project.id);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );

  const flash = useCallback((taskId: string) => {
    setFlashIds((current) => [...current, taskId]);
    setTimeout(() => setFlashIds((current) => current.filter((id) => id !== taskId)), 1000);
  }, []);

  const upsertTask = useCallback(
    (incoming: TaskDTO, highlight = false) => {
      setTasks((current) => {
        const index = current.findIndex((task) => task.id === incoming.id);
        if (index === -1) return [...current, incoming];
        const next = [...current];
        next[index] = incoming;
        return next;
      });
      if (highlight) flash(incoming.id);
    },
    [flash]
  );

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{
        columns: ColumnDTO[];
        tasks: TaskDTO[];
        members: MemberDTO[];
        activity: ActivityDTO[];
      }>(`/api/projects/${project.id}/board`);
      setColumns(data.columns);
      setTasks(data.tasks);
      setMembers(data.members);
      setActivity(data.activity);
    } catch {
      toast.error("Could not refresh the board", "Reload the page to see the latest.");
    }
  }, [project.id, toast]);

  /* -------------------------------------------------------------- realtime */

  useEffect(() => {
    return registerProject(project.id, initialSeq, (frame) => {
      const { type, payload } = frame.event;
      const actor = memberById.get(frame.event.actorId) ?? null;

      if (type !== "comment.created" || actor?.id !== currentUser.id) {
        setActivity((current) =>
          [
            {
              seq: frame.seq,
              type,
              createdAt: frame.event.createdAt,
              actor: actor ? { ...actor } : null,
              summary: ""
            },
            ...current
          ].slice(0, 40)
        );
      }

      switch (type) {
        case "task.created":
        case "task.updated":
        case "task.moved":
          if (payload.task) upsertTask(payload.task as TaskDTO, true);
          break;
        case "task.deleted":
          setTasks((current) => current.filter((task) => task.id !== payload.taskId));
          break;
        case "comment.created":
          setTasks((current) =>
            current.map((task) =>
              task.id === payload.taskId
                ? {
                    ...task,
                    commentCount: (payload.commentCount as number) ?? task.commentCount + 1
                  }
                : task
            )
          );
          break;
        case "column.created":
          setColumns((current) => {
            if (current.some((column) => column.id === payload.columnId)) return current;
            return [
              ...current,
              {
                id: String(payload.columnId),
                name: String(payload.columnName ?? "New column"),
                position: Number(payload.position ?? 0),
                isDone: false
              }
            ].sort((a, b) => a.position - b.position);
          });
          break;
        case "column.updated":
          setColumns((current) =>
            current.map((column) =>
              column.id === payload.columnId
                ? {
                    ...column,
                    name: String(payload.columnName ?? column.name),
                    isDone: Boolean(payload.isDone ?? column.isDone)
                  }
                : column
            )
          );
          break;
        case "column.deleted":
          setColumns((current) => current.filter((column) => column.id !== payload.columnId));
          setTasks((current) => current.filter((task) => task.columnId !== payload.columnId));
          break;
        case "member.added":
        case "member.removed":
          void refresh();
          break;
        case "project.updated":
          router.refresh();
          break;
        default:
          break;
      }
    });
  }, [
    project.id,
    initialSeq,
    registerProject,
    memberById,
    upsertTask,
    refresh,
    router,
    currentUser.id
  ]);

  /* ------------------------------------------------------------ derived data */

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return tasks.filter((task) => {
      if (onlyMine && task.assignee?.id !== currentUser.id) return false;
      if (!needle) return true;
      return (
        task.title.toLowerCase().includes(needle) ||
        (task.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [tasks, query, onlyMine, currentUser.id]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, TaskDTO[]>();
    for (const column of columns) map.set(column.id, []);
    for (const task of visibleTasks) {
      const bucket = map.get(task.columnId);
      if (bucket) bucket.push(task);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.position - b.position);
    return map;
  }, [columns, visibleTasks]);

  const openTask = openTaskId ? tasks.find((task) => task.id === openTaskId) ?? null : null;

  /* ---------------------------------------------------------------- actions */

  /**
   * Move a card.
   *
   * The position is computed locally first (so the card lands exactly where it
   * was dropped) and the server echoes back its own value, which replaces the
   * optimistic one. A rejection rolls the card back and refreshes the board.
   */
  const moveTask = useCallback(
    async (
      taskId: string,
      toColumnId: string,
      beforeTaskId: string | null,
      afterTaskId: string | null
    ) => {
      const original = tasks.find((task) => task.id === taskId);
      if (!original) return;

      const siblings = (tasksByColumn.get(toColumnId) ?? []).filter((task) => task.id !== taskId);
      const insertAt = afterTaskId
        ? siblings.findIndex((task) => task.id === afterTaskId) + 1
        : siblings.length;

      const optimisticPosition =
        siblings.length === 0
          ? 1024
          : insertAt <= 0
            ? siblings[0].position / 2
            : insertAt >= siblings.length
              ? siblings[siblings.length - 1].position + 1024
              : (siblings[insertAt - 1].position + siblings[insertAt].position) / 2;

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? { ...task, columnId: toColumnId, position: optimisticPosition }
            : task
        )
      );

      try {
        const data = await api.post<{ task: TaskDTO }>(`/api/tasks/${taskId}/move`, {
          columnId: toColumnId,
          beforeTaskId,
          afterTaskId,
          version: original.version
        });
        upsertTask(data.task);
      } catch {
        setTasks((current) => current.map((task) => (task.id === taskId ? original : task)));
        toast.error("Move rejected", "This card changed elsewhere — the board was refreshed.");
        void refresh();
      }
    },
    [tasks, tasksByColumn, upsertTask, toast, refresh]
  );

  /** Drop on a card: place the dragged card immediately before it. */
  function handleDropOnCard(targetTaskId: string) {
    const draggedId = draggingId;
    setDraggingId(null);
    setDropColumnId(null);
    if (!draggedId || draggedId === targetTaskId) return;

    const target = tasks.find((task) => task.id === targetTaskId);
    if (!target) return;

    const siblings = (tasksByColumn.get(target.columnId) ?? []).filter(
      (task) => task.id !== draggedId
    );
    const index = siblings.findIndex((task) => task.id === targetTaskId);
    const before = index > 0 ? siblings[index - 1] : null;

    void moveTask(draggedId, target.columnId, before ? before.id : null, targetTaskId);
  }

  /** Drop on column background: append to the end of that column. */
  function handleDropOnColumn(columnId: string) {
    const draggedId = draggingId;
    setDraggingId(null);
    setDropColumnId(null);
    if (!draggedId) return;

    const siblings = (tasksByColumn.get(columnId) ?? []).filter((task) => task.id !== draggedId);
    const last = siblings.length > 0 ? siblings[siblings.length - 1] : null;
    void moveTask(draggedId, columnId, last ? last.id : null, null);
  }

  /** Keyboard/assistive path for moving a card, used by the drawer's dropdown. */
  const moveTaskToColumn = useCallback(
    (taskId: string, columnId: string) => {
      const siblings = (tasksByColumn.get(columnId) ?? []).filter((task) => task.id !== taskId);
      const last = siblings.length > 0 ? siblings[siblings.length - 1] : null;
      void moveTask(taskId, columnId, last ? last.id : null, null);
    },
    [tasksByColumn, moveTask]
  );

  /* ------------------------------------------------------------------- create */

  async function addTask(columnId: string) {
    const title = draftTitle.trim();
    if (title.length < 2) return;

    setBusy(true);
    try {
      const data = await api.post<{ task: TaskDTO }>(`/api/projects/${project.id}/tasks`, {
        columnId,
        title
      });
      upsertTask(data.task);
      setDraftTitle("");
      setAddingTo(null);
    } catch (error) {
      toast.error("Could not add the task", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function addColumn() {
    const name = window.prompt("New column name");
    if (!name || name.trim().length === 0) return;

    try {
      const data = await api.post<{ column: ColumnDTO }>(
        `/api/projects/${project.id}/columns`,
        { name: name.trim() }
      );
      setColumns((current) =>
        [...current, { ...data.column, taskCount: 0 }].sort((a, b) => a.position - b.position)
      );
    } catch (error) {
      toast.error("Could not add the column", errorMessage(error));
    }
  }

  async function renameColumn(column: ColumnDTO) {
    const name = window.prompt("Rename column", column.name);
    if (!name || name.trim() === column.name) return;

    try {
      const data = await api.patch<{ column: ColumnDTO }>(
        `/api/projects/${project.id}/columns/${column.id}`,
        { name: name.trim() }
      );
      setColumns((current) =>
        current.map((item) => (item.id === column.id ? { ...item, ...data.column } : item))
      );
    } catch (error) {
      toast.error("Could not rename the column", errorMessage(error));
    }
  }

  async function removeColumn(column: ColumnDTO) {
    const count = (tasksByColumn.get(column.id) ?? []).length;
    const warning =
      count > 0
        ? `Delete “${column.name}” and its ${count} task(s)? This cannot be undone.`
        : `Delete the column “${column.name}”?`;
    if (!window.confirm(warning)) return;

    try {
      await api.del(`/api/projects/${project.id}/columns/${column.id}`);
      setColumns((current) => current.filter((item) => item.id !== column.id));
      setTasks((current) => current.filter((task) => task.columnId !== column.id));
    } catch (error) {
      toast.error("Could not delete the column", errorMessage(error));
    }
  }

  /** Close the drawer and drop the deep link from the URL. */
  const closeDrawer = useCallback(() => {
    setOpenTaskId(null);
    if (typeof window !== "undefined" && window.location.search.includes("task=")) {
      window.history.replaceState(null, "", `/projects/${project.id}`);
    }
  }, [project.id]);

  return (
    <>
      <BoardHeader
        project={project}
        members={members}
        presence={presence}
        query={query}
        onQuery={setQuery}
        onlyMine={onlyMine}
        onToggleMine={() => setOnlyMine((value) => !value)}
        canManage={canManage}
        onOpenMembers={() => setMembersOpen(true)}
        onAddColumn={() => void addColumn()}
        visibleCount={visibleTasks.length}
        totalCount={tasks.length}
        doneCount={
          tasks.filter((task) => columns.find((column) => column.id === task.columnId)?.isDone)
            .length
        }
      />

      {columns.length === 0 ? (
        <div className="empty-state">
          This board has no columns yet.
          {canManage ? " Add one to get started." : " Ask a project admin to add one."}
        </div>
      ) : (
        <div className="board-wrap">
          <div className="board">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn.get(column.id) ?? []}
                canManage={canManage}
                dropActive={dropColumnId === column.id}
                flashIds={flashIds}
                adding={addingTo === column.id}
                draftTitle={draftTitle}
                busy={busy}
                onDraftTitle={setDraftTitle}
                onStartAdd={() => {
                  setAddingTo(column.id);
                  setDraftTitle("");
                }}
                onCancelAdd={() => {
                  setAddingTo(null);
                  setDraftTitle("");
                }}
                onSubmitAdd={() => void addTask(column.id)}
                onRename={() => void renameColumn(column)}
                onDelete={() => void removeColumn(column)}
                onOpenTask={setOpenTaskId}
                onDragStart={setDraggingId}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropColumnId(null);
                }}
                onDragOverColumn={setDropColumnId}
                onDropOnColumn={handleDropOnColumn}
                onDropOnCard={handleDropOnCard}
              />
            ))}
          </div>
        </div>
      )}

      {openTask ? (
        <TaskDrawer
          task={openTask}
          columns={columns}
          members={members}
          project={project}
          currentUser={currentUser}
          activity={activity}
          onClose={closeDrawer}
          onTask={upsertTask}
          onMoveToColumn={(columnId: string) => moveTaskToColumn(openTask.id, columnId)}
          onDeleted={(taskId: string) => {
            setTasks((current) => current.filter((task) => task.id !== taskId));
            closeDrawer();
          }}
          onCommentCount={(taskId: string, count: number) =>
            setTasks((current) =>
              current.map((task) => (task.id === taskId ? { ...task, commentCount: count } : task))
            )
          }
        />
      ) : null}

      {membersOpen ? (
        <MembersPanel
          project={project}
          members={members}
          currentUser={currentUser}
          canManage={canManage}
          onClose={() => setMembersOpen(false)}
          onChanged={setMembers}
        />
      ) : null}
    </>
  );
}