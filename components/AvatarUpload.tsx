"use client";

import { useRef, useState } from "react";
import { api, errorMessage } from "../lib/client/api";
import type { UserDTO } from "../lib/types";
import { useToast } from "./Toast";

type Props = {
  user: UserDTO;
  /** Called after a successful upload with the updated user object. */
  onUpdated: (user: UserDTO) => void;
  size?: number;
};

/**
 * AvatarUpload
 *
 * Renders the user's current avatar (photo if set, coloured initial if not)
 * with an overlaid camera button. Clicking the button opens a file picker.
 * The upload flow:
 *
 *   1. GET signed params from our server  (POST /api/upload/sign)
 *   2. POST file directly to Cloudinary   (no data passes through our server)
 *   3. PATCH /api/auth/profile            (save the returned secure_url)
 *
 * Accepted: JPEG, PNG, WebP, GIF — max 5 MB.
 */
export function AvatarUpload({ user, onUpdated, size = 48 }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(user.avatarUrl ?? null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported (JPEG, PNG, WebP, GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large", "Max file size is 5 MB.");
      return;
    }

    setUploading(true);

    // Show a local preview immediately so the UI feels instant.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      // Step 1 — get signed Cloudinary upload params from our server.
      const signData = await api.post<{
        signature: string;
        timestamp: number;
        apiKey: string;
        cloudName: string;
        folder: string;
        public_id?: string;
        eager?: string;
        uploadUrl: string;
      }>("/api/upload/sign", { type: "avatar" });

      // Step 2 — upload directly to Cloudinary (browser → Cloudinary, never through our server).
      const form = new FormData();
      form.append("file", file);
      form.append("signature", signData.signature);
      form.append("timestamp", String(signData.timestamp));
      form.append("api_key", signData.apiKey);
      form.append("folder", signData.folder);
      if (signData.public_id) form.append("public_id", signData.public_id);
      if (signData.eager) form.append("eager", signData.eager);

      const cloudRes = await fetch(signData.uploadUrl, { method: "POST", body: form });
      if (!cloudRes.ok) {
        const err = (await cloudRes.json()) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? "Cloudinary upload failed.");
      }

      const cloudData = (await cloudRes.json()) as { secure_url: string; eager?: { secure_url: string }[] };

      // Prefer the eager-transformed (cropped 200×200) URL if available.
      const finalUrl =
        cloudData.eager?.[0]?.secure_url ?? cloudData.secure_url;

      // Step 3 — persist the URL in our DB.
      const profileData = await api.patch<{ user: UserDTO }>("/api/auth/profile", {
        avatarUrl: finalUrl
      });

      setPreview(finalUrl);
      onUpdated(profileData.user);
      toast.success("Profile photo updated!");
    } catch (err) {
      setPreview(user.avatarUrl ?? null); // revert preview on failure
      toast.error("Upload failed", errorMessage(err));
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      title="Click to change your profile photo"
    >
      {/* Avatar — photo or coloured initial */}
      {preview ? (
        <img
          src={preview}
          alt={user.name}
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            display: "block",
            opacity: uploading ? 0.5 : 1,
            transition: "opacity 0.2s"
          }}
        />
      ) : (
        <span
          className="avatar"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.38,
            background: user.avatarColor,
            opacity: uploading ? 0.5 : 1,
            transition: "opacity 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            fontWeight: 700,
            color: "#fff",
            userSelect: "none"
          }}
          aria-hidden="true"
        >
          {initials(user.name)}
        </span>
      )}

      {/* Camera overlay button */}
      <button
        type="button"
        aria-label="Upload profile photo"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: uploading
            ? "rgba(0,0,0,0.45)"
            : "rgba(0,0,0,0)",
          border: "none",
          cursor: uploading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s",
          padding: 0
        }}
        onMouseEnter={(e) => {
          if (!uploading) (e.currentTarget.style.background = "rgba(0,0,0,0.45)");
        }}
        onMouseLeave={(e) => {
          if (!uploading) (e.currentTarget.style.background = "rgba(0,0,0,0)");
        }}
      >
        {uploading ? (
          <span style={{ fontSize: size * 0.3, color: "#fff" }}>…</span>
        ) : (
          <svg
            width={size * 0.42}
            height={size * 0.42}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0, transition: "opacity 0.15s" }}
            ref={(el) => {
              if (el) {
                const btn = el.closest("button");
                if (btn) {
                  btn.addEventListener("mouseenter", () => { el.style.opacity = "1"; });
                  btn.addEventListener("mouseleave", () => { el.style.opacity = "0"; });
                }
              }
            }}
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </button>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // Reset so picking the same file again triggers onChange
          e.target.value = "";
        }}
      />
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
