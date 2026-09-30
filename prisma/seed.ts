import "../server/env";

import { db } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { DEFAULT_COLUMNS, pickAvatarColor } from "../lib/constants";

/**
 * Seed data.
 *
 *   npm run db:seed
 *
 * Creates two accounts (one owner, one teammate so realtime and notifications
 * can actually be demonstrated in two browsers), a realistic project board and
 * a populated activity log. Idempotent: re-running replaces the demo project.
 *
 *   ifidon@fonialabs.dev   / FoniaProjects2026
 *   teammate@fonialabs.dev / FoniaProjects2026
 */

const PASSWORD = "FoniaProjects2026";
const DEMO_KEY = "FON";

type SeedTask = {
  column: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "urgent";
  assignee: "owner" | "teammate" | null;
  dueInDays?: number;
  comments?: { author: "owner" | "teammate"; body: string }[];
};

const TASKS: SeedTask[] = [
  {
    column: "Backlog",
    title: "Project brief and success metrics",
    description: "Write the one-page brief: who it is for, what changes, how we know it worked.",
    priority: "high",
    assignee: "owner",
    dueInDays: 9
  },
  {
    column: "Backlog",
    title: "Empty and loading states for every list",
    description: "No screen should look broken while data loads, or when a filter matches nothing.",
    priority: "medium",
    assignee: "teammate"
  },
  {
    column: "Backlog",
    title: "Keyboard access for moving cards",
    description: "Drag and drop is not enough on its own — a card must be movable without a mouse.",
    priority: "low",
    assignee: null
  },
  {
    column: "In Progress",
    title: "Realtime board sync",
    description: "Two people on one board should see each other's changes without refreshing.",
    priority: "urgent",
    assignee: "owner",
    dueInDays: 3,
    comments: [
      {
        author: "teammate",
        body: "Tested with two browsers open — the card moved on both sides in under a second."
      },
      {
        author: "owner",
        body: "Reconnect replay works too: I closed the tab for a minute and the board caught up."
      }
    ]
  },
  {
    column: "In Progress",
    title: "Comment threads with mentions",
    description: "Mentions should notify the person, not just highlight their name.",
    priority: "high",
    assignee: "teammate",
    dueInDays: 5
  },
  {
    column: "In Review",
    title: "Permission checks on every write",
    description: "Membership is verified server-side for reads, writes and socket rooms.",
    priority: "urgent",
    assignee: "owner",
    comments: [
      {
        author: "teammate",
        body: "Checked the API directly with a second account — a non-member is correctly refused."
      }
    ]
  },
  {
    column: "Done",
    title: "Auth: register, sign in, sign out",
    description: "scrypt password hashing and a signed httpOnly session cookie.",
    priority: "high",
    assignee: "owner"
  },
  {
    column: "Done",
    title: "Board layout and task cards",
    description: "Columns, cards, priority pills, assignee avatars, comment counts.",
    priority: "medium",
    assignee: "teammate"
  }
];

async function main() {
  console.log("Seeding Fonia Projects…");

  const passwordHash = await hashPassword(PASSWORD);

  const owner = await db.user.upsert({
    where: { email: "ifidon@fonialabs.dev" },
    update: { name: "Ifidon Abraham", passwordHash },
    create: {
      email: "ifidon@fonialabs.dev",
      name: "Ifidon Abraham",
      passwordHash,
      avatarColor: pickAvatarColor("ifidon@fonialabs.dev")
    }
  });

  const teammate = await db.user.upsert({
    where: { email: "teammate@fonialabs.dev" },
    update: { name: "Demo Teammate", passwordHash },
    create: {
      email: "teammate@fonialabs.dev",
      name: "Demo Teammate",
      passwordHash,
      avatarColor: pickAvatarColor("teammate@fonialabs.dev")
    }
  });

  const people = { owner, teammate };

  // Replace any previous demo project so the seed can be re-run safely.
  await db.project.deleteMany({ where: { key: DEMO_KEY } });

  const project = await db.project.create({
    data: {
      key: DEMO_KEY,
      name: "Fonia Projects Rollout",
      description:
        "Taking the collaborative board from prototype to something a real team can run a sprint on.",
      color: "#38bdf8",
      createdById: owner.id,
      members: {
        create: [
          { userId: owner.id, role: "owner" },
          { userId: teammate.id, role: "member" }
        ]
      },
      columns: {
        create: DEFAULT_COLUMNS.map((column, index) => ({
          name: column.name,
          isDone: column.isDone,
          position: (index + 1) * 1024
        }))
      }
    },
    include: { columns: { orderBy: { position: "asc" } } }
  });

  const columnByName = new Map(project.columns.map((column) => [column.name, column]));
  const perColumnCounter = new Map<string, number>();

  for (const task of TASKS) {
    const column = columnByName.get(task.column);
    if (!column) continue;

    const index = perColumnCounter.get(column.id) ?? 0;
    perColumnCounter.set(column.id, index + 1);

    const created = await db.task.create({
      data: {
        projectId: project.id,
        columnId: column.id,
        title: task.title,
        description: task.description ?? null,
        priority: task.priority,
        position: (index + 1) * 1024,
        assigneeId: task.assignee ? people[task.assignee].id : null,
        createdById: owner.id,
        dueDate: task.dueInDays
          ? new Date(Date.now() + task.dueInDays * 24 * 60 * 60 * 1000)
          : null,
        completedAt: column.isDone ? new Date() : null
      }
    });

    for (const comment of task.comments ?? []) {
      await db.comment.create({
        data: {
          taskId: created.id,
          authorId: people[comment.author].id,
          body: comment.body
        }
      });
    }

    // A believable activity feed, in the same shape the app writes at runtime.
    await db.projectEvent.create({
      data: {
        projectId: project.id,
        actorId: owner.id,
        type: "task.created",
        payload: JSON.stringify({ title: created.title, columnName: column.name })
      }
    });
  }

  await db.notification.create({
    data: {
      userId: owner.id,
      actorId: teammate.id,
      projectId: project.id,
      type: "comment.reply",
      title: "Demo Teammate commented on “Realtime board sync”",
      body: "Tested with two browsers open — the card moved on both sides in under a second."
    }
  });

  console.log(`  ✓ project "${project.name}" (${project.key}) with ${TASKS.length} tasks`);
  console.log("  ✓ accounts:");
  console.log(`      ifidon@fonialabs.dev   / ${PASSWORD}`);
  console.log(`      teammate@fonialabs.dev / ${PASSWORD}`);
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });