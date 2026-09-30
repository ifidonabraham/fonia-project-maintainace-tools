"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "../lib/client/api";
import type {
  ActivityDTO,
  ColumnDTO,
  CommentDTO,
  MemberDTO,
  Priority,
  ProjectSummaryDTO,
  TaskDTO,
  UserDTO
} from "../lib/types";
import { PRIORITIES, PRIORITY_LABEL } from "../lib/constants";
import { useRealtime } from "./Realtime";
import { useToast } from "./Toast";
import { timeAgo } from "../lib/time";

type Props = {
  task: TaskDTO;
  columns: ColumnDTO[];
  members: MemberDTO[];
  project: ProjectSummaryDTO;
  currentUser: UserDTO;
  activity: ActivityDTO[];
  onClose: () => void;
  onTask: (task: TaskDTO) => void;
  onMoveToColumn: (columnId: string) => void;
  onDeleted: (taskId: string) => void;
  onCommentCount: (taskId: string, count: number) => void;
};

export function TaskDrawer({
  task,
  columns,
  members,
  project,
  currentUser,
  activity,
  onClose,
  onTask,
  onMoveToColumn,
  onDeleted,
  onCommentCount
}: Props) {
  const toast = useToast();
  const { typingFor, sendTyping } = useRealtime();

  // Form states
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [columnId, setColumnId] = useState(task.columnId);
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.split("T")[0] : "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Comments state
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state when task prop changes (e.g. from realtime board update)
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setColumnId(task.columnId);
    setAssigneeId(task.assignee?.id ?? "");
    setDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
  }, [task]);

  // Load comments
  const loadComments = useCallback(async () => {
    try {
      setLoadingComments(true);
      const res = await api.get<{ comments: CommentDTO[] }>(`/api/tasks/${task.id}/comments`);
      setComments(res.comments);
      onCommentCount(task.id, res.comments.length);
    } catch (err) {
      toast.error("Could not load comments", errorMessage(err));
    } finally {
      setLoadingComments(false);
    }
  }, [task.id, toast, onCommentCount]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  // Keyboard close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const currentColumn = useMemo(
    () => columns.find((c) => c.id === columnId) ?? columns.find((c) => c.id === task.columnId),
    [columns, columnId, task.columnId]
  );

  const isDirty =
    title.trim() !== task.title ||
    (description.trim() || null) !== (task.description ?? null) ||
    priority !== task.priority ||
    columnId !== task.columnId ||
    (assigneeId || null) !== (task.assignee?.id ?? null) ||
    (dueDate || null) !== (task.dueDate ? task.dueDate.split("T")[0] : null);

  // Active typers for this task
  const typers = typingFor(project.id, task.id);
  const typersText = typers.map((t) => t.name).join(", ");

  const handleCommentChange = (text: string) => {
    setCommentText(text);
    sendTyping(project.id, task.id, "start");

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(project.id, task.id, "stop");
    }, 2500);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Task title cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<{ task: TaskDTO }>(`/api/tasks/${task.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        version: task.version
      });

      onTask(res.task);

      if (columnId !== task.columnId) {
        onMoveToColumn(columnId);
      }

      toast.success("Task updated");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.current) {
        toast.error("Conflict", "This task was updated by another user. Reloading latest changes.");
        const currentTask = err.current as TaskDTO;
        onTask(currentTask);
      } else {
        toast.error("Failed to save changes", errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/tasks/${task.id}`);
      toast.info("Task deleted");
      onDeleted(task.id);
    } catch (err) {
      toast.error("Failed to delete task", errorMessage(err));
      setDeleting(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || postingComment) return;
    setPostingComment(true);
    sendTyping(project.id, task.id, "stop");

    try {
      const res = await api.post<{ comment: CommentDTO }>(`/api/tasks/${task.id}/comments`, {
        body: commentText.trim()
      });
      const nextComments = [...comments, res.comment];
      setComments(nextComments);
      onCommentCount(task.id, nextComments.length);
      setCommentText("");
    } catch (err) {
      toast.error("Could not post comment", errorMessage(err));
    } finally {
      setPostingComment(false);
    }
  };

  // Filter task-relevant activity
  const taskActivity = useMemo(() => {
    return activity.filter((act) => {
      const sum = act.summary.toLowerCase();
      const taskTitle = task.title.toLowerCase();
      return sum.includes(taskTitle) || (act.type.startsWith("task.") && sum.includes(task.id));
    });
  }, [activity, task.title, task.id]);

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Task ${task.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="drawer-crumb">
              {project.name} / {currentColumn?.name ?? "Board"}
            </p>
            <input
              className="panel-input"
              style={{
                fontSize: 18,
                fontWeight: 700,
                border: "1px solid transparent",
                background: "transparent",
                padding: "4px 0",
                boxShadow: "none"
              }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>
          <button className="icon-btn drawer-close" onClick={onClose} aria-label="Close task details">
            ×
          </button>
        </header>

        <div className="drawer-body">
          {/* Metadata Section */}
          <section className="drawer-section">
            <h4>Properties</h4>
            <div className="meta-grid">
              <div className="meta-field">
                <span>Column</span>
                <select
                  className="panel-select"
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.isDone ? "✓" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="meta-field">
                <span>Priority</span>
                <select
                  className="panel-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="meta-field">
                <span>Assignee</span>
                <select
                  className="panel-select"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="meta-field">
                <span>Due date</span>
                <input
                  type="date"
                  className="panel-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Description Section */}
          <section className="drawer-section">
            <h4>Description</h4>
            <textarea
              className="panel-textarea"
              placeholder="Add details, checklists, or context for this task…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </section>

          {/* Action buttons */}
          <div className="drawer-actions">
            <button
              className="btn primary"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {isDirty ? (
              <button
                className="btn ghost"
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description ?? "");
                  setPriority(task.priority);
                  setColumnId(task.columnId);
                  setAssigneeId(task.assignee?.id ?? "");
                  setDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
                }}
              >
                Reset
              </button>
            ) : null}
            <span className="spacer" />
            {confirmDelete ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--red)" }}>Delete task?</span>
                <button
                  className="btn sm danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
                <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn sm danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete task
              </button>
            )}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--line)" }} />

          {/* Comments Discussion */}
          <section className="drawer-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4>Discussion ({comments.length})</h4>
              {typers.length > 0 ? (
                <span style={{ fontSize: 11.5, color: "var(--cyan)", fontStyle: "italic" }}>
                  {typersText} {typers.length === 1 ? "is" : "are"} typing…
                </span>
              ) : null}
            </div>

            <div className="comment-list">
              {loadingComments ? (
                <p style={{ color: "var(--muted-soft)", fontSize: 13 }}>Loading discussion…</p>
              ) : comments.length === 0 ? (
                <p style={{ color: "var(--muted-soft)", fontSize: 13 }}>
                  No comments yet. Start the conversation below.
                </p>
              ) : (
                comments.map((comment) => (
                  <article key={comment.id} className="comment">
                    <span
                      className="avatar sm"
                      style={{ background: comment.author.avatarColor }}
                      title={comment.author.name}
                    >
                      {initials(comment.author.name)}
                    </span>
                    <div className="comment-body">
                      <div className="comment-head">
                        <span className="comment-author">{comment.author.name}</span>
                        <span className="comment-time">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="comment-text">{renderCommentBody(comment.body)}</p>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="comment-form" style={{ marginTop: 10 }}>
              <textarea
                className="panel-textarea"
                style={{ minHeight: 76 }}
                placeholder="Write a comment… Type @name to mention a teammate"
                value={commentText}
                onChange={(e) => handleCommentChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handlePostComment();
                  }
                }}
              />
              <div className="comment-form-foot">
                <span style={{ fontSize: 11.5, color: "var(--muted-soft)" }}>
                  Press <kbd style={{ padding: "1px 4px", borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>Ctrl+Enter</kbd> to submit
                </span>
                <span className="spacer" />
                <button
                  className="btn sm primary"
                  onClick={handlePostComment}
                  disabled={!commentText.trim() || postingComment}
                >
                  {postingComment ? "Posting…" : "Comment"}
                </button>
              </div>
            </div>
          </section>

          {/* Activity Section */}
          {taskActivity.length > 0 ? (
            <section className="drawer-section" style={{ marginTop: 10 }}>
              <h4>Task History</h4>
              <div className="activity-list">
                {taskActivity.slice(0, 5).map((act) => (
                  <div key={act.seq} className="activity-item">
                    <span className="ai-text">
                      <b>{act.actor ? act.actor.name : "System"}</b> {act.summary}
                    </span>
                    <span className="ai-time">{timeAgo(act.createdAt)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
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

function renderCommentBody(text: string) {
  const parts = text.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="mention">
          {part}
        </span>
      );
    }
    return part;
  });
}
