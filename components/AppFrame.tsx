"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { connectionLabel, useRealtime } from "./Realtime";
import { AvatarUpload } from "./AvatarUpload";
import { api } from "../lib/client/api";
import type { ProjectSummaryDTO, UserDTO } from "../lib/types";

/**
 * The signed-in frame: sidebar + topbar around every app page.
 *
 * It is a client component because the live connection pill, the project list
 * (which changes when a teammate adds you to a project) and the notification
 * bell all react to socket events. It renders immediately with the data the
 * server already fetched, so nothing flashes empty.
 */
export function AppFrame({
  user,
  projects: initialProjects,
  initialUnreadCount,
  children
}: {
  user: UserDTO;
  projects: ProjectSummaryDTO[];
  initialUnreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, transport, onAccessChange } = useRealtime();

  const [projects, setProjects] = useState(initialProjects);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  // Being added to (or removed from) a project arrives as a realtime frame.
  useEffect(() => {
    return onAccessChange(() => {
      api
        .get<{ projects: ProjectSummaryDTO[] }>("/api/projects")
        .then((data) => setProjects(data.projects))
        .catch(() => {
          // A stale sidebar is acceptable; a crash is not.
        });
    });
  }, [onAccessChange]);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const activeProjectId = pathname.startsWith("/projects/") ? pathname.split("/")[2] : null;

  /** Sign out server-side, then hard-navigate so no cached board data survives. */
  async function signOut() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Even if the request failed, send the user to the sign-in page.
    }
    router.replace("/login");
    router.refresh();
  }

  const nav = [
    { label: "Dashboard", href: "/dashboard", icon: gridIcon },
    { label: "All projects", href: "/projects", icon: boardIcon },
    { label: "My tasks", href: "/tasks", icon: checkIcon },
    { label: "Notifications", href: "/notifications", icon: bellIcon }
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <Logo word="Fonia" />
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${
                pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                  ? " active"
                  : ""
              }`}
            >
              <span className="sl-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div>
          <div className="sidebar-label">Projects</div>
          <div className="sidebar-projects">
            {projects.length === 0 ? (
              <p className="text-sm" style={{ padding: "0 12px" }}>
                No projects yet.
              </p>
            ) : (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className={`project-link${activeProjectId === project.id ? " active" : ""}`}
                >
                  <span
                    className="project-dot"
                    style={{ background: project.color, color: project.color }}
                  />
                  <span className="pl-name">{project.name}</span>
                </Link>
              ))
            )}
            <Link className="sidebar-link" href="/projects/new">
              <span className="sl-icon">{plusIcon}</span>
              New project
            </Link>
          </div>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-user">
          <AvatarUpload user={currentUser} onUpdated={setCurrentUser} size={36} />
          <span className="sidebar-user-meta">
            <span className="sidebar-user-name">{currentUser.name}</span>
            <span className="sidebar-user-mail">{currentUser.email}</span>
          </span>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <button className="btn block sm" type="submit">
            Sign out
          </button>
        </form>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="topbar-title">
            <h3>Fonia Projects</h3>
            <span className="topbar-crumb">A Fonia Labs Product</span>
          </div>

          <div className="topbar-actions">
            <span className={`conn-pill ${status}`} title={`Transport: ${transport}`}>
              <span className="conn-dot" />
              {connectionLabel(status, transport)}
            </span>
            <NotificationBell />
          </div>
        </header>

        <div className="app-body">{children}</div>
      </div>
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

/* Inline icons — small enough that pulling in an icon package would be waste. */

const iconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

const gridIcon = (
  <svg {...iconProps}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const boardIcon = (
  <svg {...iconProps}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="10" y="4" width="5" height="11" rx="1.5" />
    <rect x="17" y="4" width="4" height="7" rx="1.5" />
  </svg>
);

const checkIcon = (
  <svg {...iconProps}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const bellIcon = (
  <svg {...iconProps}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

const plusIcon = (
  <svg {...iconProps}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);