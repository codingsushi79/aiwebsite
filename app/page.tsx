"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/ChatMarkdown";

type Role = "user" | "assistant";

type ChatMessage = { id: string; role: Role; content: string };

type SavedListItem = { id: string; title: string; updatedAt: string };

function parseNdjsonStream(
  buffer: string,
  onDelta: (text: string) => void,
): string {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const data = JSON.parse(trimmed) as {
        message?: { content?: string };
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      const piece = data.message?.content;
      if (piece) onDelta(piece);
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  return rest;
}

export default function Home() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [savedOpen, setSavedOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedListItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { name?: string | null }) => {
        setDisplayName(typeof d.name === "string" ? d.name : null);
      })
      .catch(() => setDisplayName(null));
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const refreshSavedList = async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/saved-chats");
      if (!res.ok) throw new Error("Could not load saved chats");
      const data = (await res.json()) as { chats: SavedListItem[] };
      setSavedList(data.chats ?? []);
    } finally {
      setSavedLoading(false);
    }
  };

  const openSavedPanel = async () => {
    setSavedOpen(true);
    await refreshSavedList();
  };

  const loadSaved = async (id: string) => {
    const res = await fetch(`/api/saved-chats/${id}`);
    if (!res.ok) throw new Error("Could not load chat");
    const data = (await res.json()) as {
      chat: { id: string; messages: ChatMessage[] };
    };
    setMessages(data.chat.messages);
    setCurrentSavedId(data.chat.id);
    setSavedOpen(false);
    queueMicrotask(scrollToBottom);
  };

  const deleteSaved = async (id: string) => {
    if (!confirm("Delete this saved chat?")) return;
    const res = await fetch(`/api/saved-chats/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    if (currentSavedId === id) setCurrentSavedId(null);
    await refreshSavedList();
  };

  const saveChat = async () => {
    if (messages.length === 0) {
      setError("Nothing to save.");
      return;
    }

    setSaveBusy(true);
    setError(null);
    try {
      const payload = {
        title: saveTitle.trim() || undefined,
        messages: messages.map(({ id, role, content }) => ({ id, role, content })),
      };

      if (currentSavedId) {
        const res = await fetch(`/api/saved-chats/${currentSavedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === "string" ? j.error : "Save failed");
        }
      } else {
        const res = await fetch("/api/saved-chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.error === "string" ? j.error : "Save failed");
        }
        const data = (await res.json()) as { chat: { id: string } };
        setCurrentSavedId(data.chat.id);
      }
      setSaveTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setCurrentSavedId(null);
    setError(null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantId = crypto.randomUUID();
    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, { id: assistantId, role: "assistant", content: "" }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          status?: number;
        };
        let msg =
          typeof errBody.error === "string"
            ? errBody.error
            : `Request failed (${res.status})`;
        if (typeof errBody.detail === "string" && errBody.detail.trim()) {
          const d = errBody.detail.trim();
          msg += `: ${d.length > 400 ? `${d.slice(0, 400)}…` : d}`;
        }
        throw new Error(msg);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseNdjsonStream(buffer, (piece) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + piece } : m,
            ),
          );
          queueMicrotask(scrollToBottom);
        });
      }

      if (buffer.trim()) {
        parseNdjsonStream(buffer + "\n", (piece) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + piece } : m,
            ),
          );
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-8 pt-6 sm:px-5 sm:pt-8">
      <header className="sticky top-0 z-10 -mx-4 mb-5 border-b border-[var(--border-subtle)] bg-[var(--background)]/85 px-4 pb-5 backdrop-blur-md sm:-mx-5 sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
              Local · Ollama
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Llama 3.1
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--foreground-subtle)]">
              Saved threads in{" "}
              <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--code-inline)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[var(--foreground-subtle)]">
                data/chats.db
              </code>
              , tied to your sign-in name.
            </p>
            {displayName ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Signed in as{" "}
                <span className="font-medium text-[var(--foreground-subtle)]">{displayName}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button type="button" onClick={() => void signOut()} className="ui-btn-toolbar">
              Sign out
            </button>
            <button type="button" onClick={() => void openSavedPanel()} className="ui-btn-toolbar">
              Saved
            </button>
            <button
              type="button"
              onClick={saveChat}
              disabled={saveBusy || messages.length === 0}
              className="ui-btn-toolbar border-[var(--accent)]/25 bg-[var(--accent-muted)] text-[var(--accent)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-muted)]"
            >
              {saveBusy ? "Saving…" : currentSavedId ? "Update" : "Save"}
            </button>
            <button type="button" onClick={newChat} className="ui-btn-toolbar">
              New chat
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="save-title">
            Save title
          </label>
          <input
            id="save-title"
            type="text"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Optional title when saving…"
            className="ui-input min-w-[180px] flex-1 py-2 text-sm"
          />
          {currentSavedId ? (
            <span className="whitespace-nowrap text-xs text-[var(--muted)]">Editing saved</span>
          ) : null}
        </div>
      </header>

      <div className="ui-panel flex min-h-[min(420px,55vh)] flex-1 flex-col gap-3 overflow-y-auto bg-[var(--surface-raised)]/80 p-4 sm:p-5">
        {messages.length === 0 && (
          <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-lg text-[var(--muted)]">
              ◇
            </div>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Start a conversation. Markdown, code blocks, and tables render cleanly below.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 ${
                m.role === "user"
                  ? "border border-emerald-500/20 bg-gradient-to-br from-emerald-950/50 to-[var(--surface)] text-[var(--foreground)] shadow-sm shadow-black/20"
                  : "border border-[var(--border-subtle)] bg-[var(--surface)]/90 text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              }`}
            >
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                {m.role === "user" ? "You" : "Llama 3.1"}
              </span>
              {m.role === "assistant" ? (
                m.content ? (
                  <ChatMarkdown content={m.content} />
                ) : loading ? (
                  <span className="inline-flex gap-1 text-[var(--muted)]">
                    <span className="animate-pulse">Thinking</span>
                    <span className="opacity-60">…</span>
                  </span>
                ) : null
              ) : (
                <ChatMarkdown content={m.content} compact />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p
          className="mt-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]"
          role="alert"
        >
          {error}
        </p>
      )}

      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="msg" className="sr-only">
          Message
        </label>
        <textarea
          id="msg"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a message… (Shift+Enter for newline)"
          disabled={loading}
          className="ui-input min-h-[56px] flex-1 resize-y py-3.5"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="ui-btn-primary h-[52px] shrink-0 px-8 sm:h-[56px]"
        >
          {loading ? "…" : "Send"}
        </button>
      </form>

      {savedOpen && (
        <div
          className="ui-modal-backdrop fixed inset-0 z-40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-title"
        >
          <div className="ui-panel flex max-h-[min(80vh,560px)] w-full max-w-lg flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <h2 id="saved-title" className="text-base font-semibold text-[var(--foreground)]">
                Saved chats
              </h2>
              <button
                type="button"
                onClick={() => setSavedOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {savedLoading ? (
                <p className="text-sm text-[var(--muted)]">Loading…</p>
              ) : savedList.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nothing saved yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {savedList.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-stretch gap-2 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] transition-colors hover:border-[var(--border)]"
                    >
                      <button
                        type="button"
                        onClick={() => void loadSaved(s.id)}
                        className="min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
                      >
                        <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                          {s.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {new Date(s.updatedAt).toLocaleString()}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSaved(s.id)}
                        className="shrink-0 border-l border-[var(--border-subtle)] px-3 text-xs text-red-300/90 transition-colors hover:bg-red-950/40 hover:text-red-200"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
