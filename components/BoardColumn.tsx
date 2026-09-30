"use client";

import type { ColumnDTO, TaskDTO } from "../lib/types";
import { PRIORITY_LABEL } from "../lib/constants";

/**
 * One board column.
 *
 * Native HTML5 drag events are used deliberately: no drag library ships to the
 * client and the payload we need (a task id) is tiny. The keyboard path for
 * moving a card lives in the task drawer's column selector, so dragging is never
 * the only way to do it.
 */
export function BoardColumn({
  column,
  tasks,
  canManage,
  dropActive,
  flashIds,
  adding,
  draftTitle,
  busy,
  onDraftTitle,
  onStartAdd,
  onCancelAdd,
  onSubmitAdd,
  onRename,
  onDelete,
  onOpenTask,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onDropOnColumn,
  onDropOnCard
}: {
  column: ColumnDTO;
  tasks: TaskDTO[];
  canManage: boolean;
  dropActive: boolean;
  flashIds: string[];
  adding: boolean;
  draftTitle: string;
  busy: boolean;
  onDraftTitle: (value: string) => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onSubmitAdd: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOpenTask: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnId: string) => void;
  onDropOnColumn: (columnId: string) => void;
  onDropOnCard: (taskId: string) => void;
}) {
  return (
    <section
      className={`board-col${dropActive ? " drop-active" : ""}`}
      aria-label={`${column.name} column`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverColumn(column.id);
      }}
      onDragLeave={(event) => {
        // Only clear when truly leaving the column, not an inner element.
        if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragOverColumn("");
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnColumn(column.id);
      }}
    >
      <header className="col-head">
        <span className="col-title">{column.name}</span>
        <span className="col-count">{tasks.length}</span>
        {column.isDone ? <span className="col-done-tag">Done</span> : null}

        {canManage ? (
          <span className="col-head-actions">
            <button className="icon-btn" onClick={onRename} aria-label={`Rename ${column.name}`}>
              ✎
            </button>
            <button
              className="icon-btn danger"
              onClick={onDelete}
              aria-label={`Delete ${column.name}`}
            >
              ×
            </button>
          </span>
        ) : null}
      </header>

      <div className="col-body">
        {tasks.length === 0 && !adding ? (
          <p className="col-empty">Drop a card here, or add one.</p>
        ) : null}

        {tasks.map((task) => (
          <article
            key={task.id}
            className={`task-card${flashIds.includes(task.id) ? " flash" : ""}`}
            draggable
            role="button"
            tabIndex={0}
            aria-label={`Open task ${task.title}`}
            onClick={() => onOpenTask(task.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenTask(task.id);
              }
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", task.id);
              event.dataTransfer.effectAllowed = "move";
              onDragStart(task.id);
            }}
            onDragEnd={onDragEnd}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDropOnCard(task.id);
            }}
          >
            <div className="tc-top">
              <p className="tc-title">{task.title}</p>
            </div>

            {task.description ? <p className="tc-desc">{task.description}</p> : null}

            <div className="tc-foot">
              <span className={`prio prio-${task.priority}`}>
                {PRIORITY_LABEL[task.priority]}
              </span>

              {task.dueDate ? (
                <span className={`tc-due ${dueClass(task.dueDate)}`}>
                  {formatDue(task.dueDate)}
                </span>
              ) : null}

              <span className="tc-spacer" />

              {task.commentCount > 0 ? (
                <span className="tc-count" title={`${task.commentCount} comment(s)`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 12a8 8 0 0 1-8 8H8l-5 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
                  </svg>
                  {task.commentCount}
                </span>
              ) : null}

              {task.assignee ? (
                <span
                  className="avatar sm"
                  style={{ background: task.assignee.avatarColor }}
                  title={`Assigned to ${task.assignee.name}`}
                >
                  {initials(task.assignee.name)}
                </span>
              ) : (
                <span className="tc-count" title="Unassigned">
                  —
                </span>
              )}
            </div>
          </article>
        ))}

        {adding ? (
          <div className="task-card" style={{ cursor: "default" }}>
            <textarea
              className="panel-textarea"
              style={{ minHeight: 68 }}
              value={draftTitle}
              onChange={(event) => onDraftTitle(event.target.value)}
              placeholder="What needs doing?"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmitAdd();
                }
                if (event.key === "Escape") onCancelAdd();
              }}
            />
            <div className="tc-foot">
              <button className="btn sm primary" onClick={onSubmitAdd} disabled={busy}>
                {busy ? "Adding…" : "Add card"}
              </button>
              <button className="btn sm ghost" onClick={onCancelAdd}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn sm block" onClick={onStartAdd}>
            + Add card
          </button>
        )}
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Compact due-date label for a card. */
function formatDue(iso: string): string {
  const date = new Date(iso);
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d`;
}

function dueClass(iso: string): string {
  const days = (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (days < 0) return "overdue";
  if (days <= 2) return "soon";
  return "";
}