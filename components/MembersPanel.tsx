"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "../lib/client/api";
import type { MemberDTO, ProjectSummaryDTO, Role, UserDTO } from "../lib/types";
import { useToast } from "./Toast";

type Props = {
  project: ProjectSummaryDTO;
  members: MemberDTO[];
  currentUser: UserDTO;
  canManage: boolean;
  onClose: () => void;
  onChanged: (members: MemberDTO[]) => void;
};

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member"
};

export function MembersPanel({
  project,
  members: initialMembers,
  currentUser,
  canManage,
  onClose,
  onChanged
}: Props) {
  const toast = useToast();

  const [members, setMembers] = useState<MemberDTO[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [adding, setAdding] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Sync members outward whenever local state changes.
  useEffect(() => {
    onChanged(members);
  }, [members, onChanged]);

  // Keyboard close.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Reload from server to pick up any changes made by other tabs.
  const reload = useCallback(async () => {
    try {
      const data = await api.get<{ members: MemberDTO[] }>(
        `/api/projects/${project.id}/members`
      );
      setMembers(data.members);
    } catch {
      // Non-fatal — the panel still shows the last known list.
    }
  }, [project.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Enter an email address.");
      return;
    }
    setEmailError(null);
    setAdding(true);
    try {
      const data = await api.post<{
        added: boolean;
        isNewUser: boolean;
        message: string;
        member?: MemberDTO;
      }>("/api/auth/invite", { email: trimmed, projectId: project.id, role });

      if (data.added && data.member) {
        // Existing user added directly — update list immediately.
        setMembers([...members, data.member]);
      } else if (data.isNewUser) {
        // Invite sent to new user — reload to get fresh state.
        await reload();
      }

      setEmail("");
      toast.success(data.message);
    } catch (err) {
      if (err instanceof ApiError && err.fields?.email) {
        setEmailError(err.fields.email);
      } else {
        toast.error("Could not add member", errorMessage(err));
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (member: MemberDTO) => {
    if (member.role === "owner") return;
    const isSelf = member.id === currentUser.id;
    const message = isSelf
      ? `Leave "${project.name}"? You will lose access.`
      : `Remove ${member.name} from this project?`;
    if (!window.confirm(message)) return;

    setRemovingId(member.id);
    try {
      await api.del(
        `/api/projects/${project.id}/members?userId=${encodeURIComponent(member.id)}`
      );
      const next = members.filter((m) => m.id !== member.id);
      setMembers(next);
      if (isSelf) {
        // Leaving closes the panel — parent will refresh.
        onClose();
        toast.info(`You left "${project.name}".`);
      } else {
        toast.info(`${member.name} removed.`);
      }
    } catch (err) {
      toast.error("Could not remove member", errorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  const myRole = members.find((m) => m.id === currentUser.id)?.role ?? "member";
  const canRemoveOthers = myRole === "owner" || myRole === "admin";

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Project members"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        {/* Header */}
        <header className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="drawer-crumb">{project.name}</p>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Members ({members.length})
            </h2>
          </div>
          <button
            className="icon-btn drawer-close"
            onClick={onClose}
            aria-label="Close members panel"
          >
            ×
          </button>
        </header>

        <div className="drawer-body">
          {/* Member list */}
          <section className="drawer-section">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {members.map((member) => {
                const isSelf = member.id === currentUser.id;
                const canRemove =
                  member.role !== "owner" &&
                  (isSelf || canRemoveOthers);
                const isRemoving = removingId === member.id;

                return (
                  <li
                    key={member.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--line)"
                    }}
                  >
                    {/* Avatar */}
                    <span
                      className="avatar sm"
                      style={{ background: member.avatarColor, flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      {initials(member.name)}
                    </span>

                    {/* Name + email */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                        {member.name}
                        {isSelf ? (
                          <span style={{ fontSize: 11, color: "var(--muted-soft)", fontWeight: 400 }}>
                            (you)
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {member.email}
                      </div>
                    </div>

                    {/* Role badge */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 7px",
                        borderRadius: 99,
                        background: member.role === "owner"
                          ? "rgba(var(--accent-rgb, 99,102,241), 0.15)"
                          : "rgba(255,255,255,0.06)",
                        color: member.role === "owner" ? "var(--accent)" : "var(--muted-soft)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        flexShrink: 0
                      }}
                    >
                      {ROLE_LABEL[member.role]}
                    </span>

                    {/* Remove button */}
                    {canRemove ? (
                      <button
                        className="btn sm ghost"
                        onClick={() => void handleRemove(member)}
                        disabled={isRemoving}
                        aria-label={isSelf ? "Leave project" : `Remove ${member.name}`}
                        style={{ flexShrink: 0 }}
                      >
                        {isRemoving ? "…" : isSelf ? "Leave" : "Remove"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Add member form — visible only to owners/admins */}
          {canManage ? (
            <section className="drawer-section" style={{ marginTop: 16 }}>
              <h4 style={{ marginBottom: 10 }}>Add a member</h4>
              <form onSubmit={(e) => void handleAdd(e)} noValidate>
                <div style={{ display: "flex", gap: 8, marginBottom: emailError ? 4 : 8 }}>
                  <input
                    className="panel-input"
                    type="email"
                    placeholder="teammate@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    aria-label="Email address"
                    aria-invalid={emailError ? "true" : undefined}
                    style={{ flex: 1 }}
                    autoComplete="off"
                  />
                  <select
                    className="panel-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    aria-label="Role"
                    style={{ flexShrink: 0 }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {emailError ? (
                  <p style={{ fontSize: 12, color: "var(--red)", margin: "0 0 8px" }} role="alert">
                    {emailError}
                  </p>
                ) : null}

                <button
                  className="btn primary"
                  type="submit"
                  disabled={adding}
                >
                  {adding ? "Sending…" : "Add / Invite"}
                </button>
              </form>

              <p style={{ fontSize: 12, color: "var(--muted-soft)", marginTop: 10 }}>
                Enter any email. Existing accounts are added instantly — new emails receive an invitation link by email.
              </p>
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
