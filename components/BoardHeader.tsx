"use client";

import Link from "next/link";
import type { MemberDTO, PresenceUser, ProjectSummaryDTO } from "../lib/types";

/**
 * The board toolbar.
 *
 * Shows what the board is (project, key, progress), who is watching it live,
 * and the two filters. The presence row is fed by socket frames, so it changes
 * as teammates open and close the board.
 */
export function BoardHeader({
  project,
  members,
  presence,
  query,
  onQuery,
  onlyMine,
  onToggleMine,
  canManage,
  onOpenMembers,
  onAddColumn,
  visibleCount,
  totalCount,
  doneCount
}: {
  project: ProjectSummaryDTO;
  members: MemberDTO[];
  presence: PresenceUser[];
  query: string;
  onQuery: (value: string) => void;
  onlyMine: boolean;
  onToggleMine: () => void;
  canManage: boolean;
  onOpenMembers: () => void;
  onAddColumn: () => void;
  visibleCount: number;
  totalCount: number;
  doneCount: number;
}) {
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const filtered = visibleCount !== totalCount;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{project.key}</div>
          <h2>{project.name}</h2>
          <p>{project.description || "No description yet."}</p>
        </div>

        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn" href="/projects">
            All projects
          </Link>
          <button className="btn" onClick={onOpenMembers}>
            Members <span className="badge">{members.length}</span>
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search cards…"
          aria-label="Search cards"
        />

        <button
          className={`chip${onlyMine ? " chip-active" : ""}`}
          onClick={onToggleMine}
          aria-pressed={onlyMine}
        >
          My tasks
        </button>

        {filtered ? (
          <span className="text-sm text-muted">
            {visibleCount} of {totalCount} shown
          </span>
        ) : null}

        <span className="spacer" />

        {presence.length > 0 ? (
          <span className="live-hint" title="People viewing this board right now">
            <span className="avatar-stack">
              {presence.slice(0, 5).map((watcher) => (
                <span
                  key={watcher.id}
                  className="avatar sm"
                  style={{ background: watcher.avatarColor }}
                  title={`${watcher.name} is here`}
                >
                  {initials(watcher.name)}
                </span>
              ))}
            </span>
            {presence.length === 1 ? "1 here now" : `${presence.length} here now`}
          </span>
        ) : null}

        <span className="text-sm text-muted nowrap">
          {doneCount}/{totalCount} done · {percent}%
        </span>

        {canManage ? (
          <button className="btn sm" onClick={onAddColumn}>
            + Column
          </button>
        ) : null}
      </div>
    </>
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