"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ from }: { from: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedHandling, setAcceptedHandling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n || !password) {
      setError("Enter your name and the site password.");
      return;
    }
    if (!acceptedHandling) {
      setError("Confirm the data handling notice below to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          password,
          acceptedLocalDataHandling: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : res.status === 503
              ? "Server is not configured (missing SITE_PASSWORD)."
              : "Could not sign in.",
        );
      }
      const safeFrom =
        from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
      router.push(safeFrom);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = acceptedHandling && name.trim() && password && !busy;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16 sm:py-12">
      <div className="ui-panel p-8 sm:p-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
          Ollama chat
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-subtle)]">
          Your name identifies your saved threads. Use the{" "}
          <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--code-inline)] px-1.5 py-0.5 font-mono text-[0.75rem]">
            SITE_PASSWORD
          </code>{" "}
          from{" "}
          <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--code-inline)] px-1.5 py-0.5 font-mono text-[0.75rem]">
            .env.local
          </code>{" "}
          to unlock the app.
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <div>
            <label htmlFor="login-name" className="text-xs font-medium text-[var(--muted)]">
              Your name
            </label>
            <input
              id="login-name"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="ui-input mt-1.5"
              placeholder="How you’ll appear on saves"
            />
          </div>
          <div>
            <label htmlFor="login-pass" className="text-xs font-medium text-[var(--muted)]">
              Site password
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) void submit();
              }}
              className="ui-input mt-1.5"
              placeholder="From .env.local"
            />
          </div>
        </div>

        <section
          className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
          aria-labelledby="data-handling-heading"
        >
          <h2
            id="data-handling-heading"
            className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
          >
            Local data handling
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-subtle)]">
            This app is built for <span className="text-[var(--foreground)]">on-device use</span>:
            your prompts, replies, and saved chats are handled by{" "}
            <strong className="font-medium text-[var(--foreground)]">Ollama on this machine</strong>{" "}
            and stored in a{" "}
            <strong className="font-medium text-[var(--foreground)]">local SQLite file</strong> on
            this computer. Through this application, that content is{" "}
            <strong className="font-medium text-[var(--foreground)]">not sent to Meta</strong>{" "}
            (Facebook/Instagram), is{" "}
            <strong className="font-medium text-[var(--foreground)]">not used for ads</strong>, and
            does <strong className="font-medium text-[var(--foreground)]">not leave this machine</strong>{" "}
            as part of this app’s chat or save features.
          </p>

          <details className="mt-3 text-sm text-[var(--muted)]">
            <summary className="cursor-pointer select-none text-[var(--foreground-subtle)] underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--foreground)]">
              More detail
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>
                Ollama runs locally; the model provider you configure with Ollama is separate from
                this website’s code path for chat.
              </li>
              <li>
                Saved conversations live under <code className="font-mono text-xs">data/chats.db</code>{" "}
                in this project folder unless you move the app.
              </li>
              <li>
                This codebase does not include Meta Pixel, Facebook SDK, or similar analytics for
                your messages.
              </li>
              <li>
                Your browser, operating system, or other software may still connect to the internet
                for unrelated reasons—that traffic is outside what this app controls.
              </li>
            </ul>
          </details>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-1 transition-colors hover:border-[var(--border-subtle)] has-[:focus-visible]:border-[var(--accent)]/40">
            <input
              type="checkbox"
              checked={acceptedHandling}
              onChange={(e) => setAcceptedHandling(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--border)] bg-[var(--surface-raised)] accent-[var(--accent)]"
            />
            <span className="text-sm leading-snug text-[var(--foreground-subtle)]">
              I have read the notice above and agree that I understand how my data is handled:{" "}
              <span className="text-[var(--foreground)]">
                local processing only for this app’s chat and saves, nothing sent to Meta through
                this app, and no export of my chat content by this app off this machine.
              </span>
            </span>
          </label>
        </section>

        {error && (
          <p
            className="mt-5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5 text-sm text-[var(--danger-text)]"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="ui-btn-primary mt-8 w-full py-3.5"
        >
          {busy ? "…" : "Agree and continue"}
        </button>
      </div>
    </div>
  );
}
