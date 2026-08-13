"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function NewShowForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (adminPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create show.");
        return;
      }
      router.push(`/s/${data.show.shareToken}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="new-show-form">
      <label className="field">
        <span>Show name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ballroom Saturday"
          required
          maxLength={120}
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span>Admin password</span>
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="For import & allow/block edits"
          required
          minLength={4}
          autoComplete="new-password"
        />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={4}
          autoComplete="new-password"
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create show"}
      </button>
      <p className="form-hint">
        You’ll get a share link. Crews open it for the mark view — no login.
        Save the link; shows are not listed on the home page.
      </p>
    </form>
  );
}
