import { z } from "zod";
import { LIMITS, PRIORITIES, ROLES } from "./constants";

/**
 * Request validation.
 *
 * Every route handler parses its body through one of these before touching the
 * database, and a failure comes back as per-field messages the form can render
 * inline — the client never has to re-implement the rules, and the server never
 * trusts the client's version of them.
 */

/** `YYYY-MM-DD`, an ISO timestamp, or an empty string for "no date". */
export const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? ("invalid" as const) : parsed;
  })
  .refine((value) => value !== "invalid", { message: "Enter a valid date." });

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(LIMITS.name, `Name must be ${LIMITS.name} characters or fewer.`),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(LIMITS.email, "That email is too long.")
    .email("Enter a valid email address."),
  password: z
    .string()
    .min(LIMITS.password, `Password must be at least ${LIMITS.password} characters.`)
    .max(200, "That password is too long.")
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.")
});

export const projectCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the project a name.")
    .max(LIMITS.projectName, `Keep the name under ${LIMITS.projectName} characters.`),
  key: z
    .string()
    .trim()
    .min(2, "A short key is required (e.g. FON).")
    .max(LIMITS.projectKey, `Use ${LIMITS.projectKey} characters or fewer.`)
    .regex(/^[A-Za-z][A-Za-z0-9]*$/, "Letters and numbers only, starting with a letter."),
  description: z
    .string()
    .trim()
    .max(LIMITS.description, "That description is too long.")
    .optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid colour.").optional(),
  memberEmails: z.array(z.string().trim().email("Enter a valid email address.")).max(20).optional()
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(2).max(LIMITS.projectName).optional(),
  description: z.string().trim().max(LIMITS.description).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  archived: z.boolean().optional()
});

export const columnCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the column.").max(LIMITS.columnName)
});

export const columnUpdateSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.columnName).optional(),
  position: z.number().finite().optional(),
  isDone: z.boolean().optional()
});

export const taskCreateSchema = z.object({
  columnId: z.string().trim().min(1, "Choose a column."),
  title: z
    .string()
    .trim()
    .min(2, "Give the task a title.")
    .max(LIMITS.taskTitle, `Keep the title under ${LIMITS.taskTitle} characters.`),
  description: z.string().trim().max(LIMITS.taskDescription).nullable().optional(),
  priority: z.enum(PRIORITIES as [string, ...string[]]).optional(),
  assigneeId: z.string().trim().nullable().optional(),
  dueDate: optionalDate
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(LIMITS.taskTitle).optional(),
  description: z.string().trim().max(LIMITS.taskDescription).nullable().optional(),
  priority: z.enum(PRIORITIES as [string, ...string[]]).optional(),
  assigneeId: z.string().trim().nullable().optional(),
  dueDate: optionalDate,
  /** Optimistic concurrency: the version the editor last saw. */
  version: z.number().int().nonnegative().optional()
});

/**
 * Moving a card. The client sends the neighbours it dropped between, and the
 * server converts them into a fractional position — that is what keeps ordering
 * stable without renumbering an entire column on every drag.
 */
export const taskMoveSchema = z.object({
  columnId: z.string().trim().min(1),
  beforeTaskId: z.string().trim().nullable().optional(),
  afterTaskId: z.string().trim().nullable().optional(),
  version: z.number().int().nonnegative().optional()
});

export const commentCreateSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(LIMITS.comment, `Comments are limited to ${LIMITS.comment} characters.`)
});

export const memberAddSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  role: z.enum(ROLES as [string, ...string[]]).optional()
});

export const notificationReadSchema = z.object({
  seqs: z.array(z.number().int().positive()).max(200).optional()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type TaskMoveInput = z.infer<typeof taskMoveSchema>;
export type MemberAddInput = z.infer<typeof memberAddSchema>;