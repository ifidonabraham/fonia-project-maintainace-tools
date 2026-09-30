"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, errorMessage } from "../lib/client/api";
import { useToast } from "./Toast";
import { LIMITS, PROJECT_COLORS } from "../lib/constants";
import type { ProjectSummaryDTO } from "../lib/types";

/**
 * Create-project form.
 *
 * The key is derived from the name as you type (until you edit it yourself) and
 * the invite field accepts existing accounts by email — the API reports back any
 * address that has no account, so the user is told rather than left guessing.
 */
export function NewProjectForm() {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [invites, setInvites] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleNameChange(value: string) {
    setName(value);
    if (!keyTouched) {
      setKey(
        value
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, LIMITS.projectKey)
          .toUpperCase()
      );
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const memberEmails = invites
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const data = await api.post<{
        project: ProjectSummaryDTO;
        invited: number;
        unknownEmails: string[];
      }>("/api/projects", { name, key, description, color, memberEmails });

      if (data.unknownEmails.length > 0) {
        toast.info(
          "Some invites were skipped",
          `No account exists for: ${data.unknownEmails.join(", ")}`
        );
      }

      toast.success(
        "Project created",
        data.invited > 0 ? `${data.invited} teammate(s) invited.` : "Board ready."
      );
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.fields) setFieldErrors(error.fields);
      } else {
        setFormError(errorMessage(error));
      }
      setPending(false);
    }
  }

  return (
    <form className="form-card" onSubmit={submit} noValidate>
      {formError ? <p className="form-error mb-md">{formError}</p> : null}

      <div className="form-grid">
        <div className="field full">
          <label htmlFor="np-name">
            Project name <span className="req">*</span>
          </label>
          <input
            id="np-name"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="e.g. Website redesign"
            required
          />
          {fieldErrors.name ? <p className="field-hint">{fieldErrors.name}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="np-key">
            Short key <span className="req">*</span>
          </label>
          <input
            id="np-key"
            value={key}
            onChange={(event) => {
              setKeyTouched(true);
              setKey(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, LIMITS.projectKey)
              );
            }}
            placeholder="WEB"
            required
          />
          <p className="field-hint">Used as the card prefix. Letters and numbers.</p>
          {fieldErrors.key ? <p className="field-hint">{fieldErrors.key}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="np-color">Accent colour</label>
          <div className="chips" id="np-color">
            {PROJECT_COLORS.map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setColor(option)}
                aria-label={`Use ${option}`}
                aria-pressed={color === option}
                className={`chip${color === option ? " chip-active" : ""}`}
                style={{ padding: 8 }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    background: option,
                    display: "block"
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="field full">
          <label htmlFor="np-desc">Description</label>
          <textarea
            id="np-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this project for, and what does done look like?"
            maxLength={LIMITS.description}
          />
        </div>

        <div className="field full">
          <label htmlFor="np-invites">Invite teammates</label>
          <input
            id="np-invites"
            value={invites}
            onChange={(event) => setInvites(event.target.value)}
            placeholder="teammate@company.com, another@company.com"
          />
          <p className="field-hint">
            Separate addresses with commas. Only people who already have a Fonia Projects
            account can be added.
          </p>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
          {!pending ? <span className="btn-arrow">→</span> : null}
        </button>
        <button className="btn" type="button" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}