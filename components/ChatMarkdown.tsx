"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { chatPrismTheme } from "@/lib/prism-chat-theme";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), ["className"]],
    input: [...(defaultSchema.attributes?.input ?? []), "type", "checked", "disabled"],
  },
};

type ChatMarkdownProps = {
  content: string;
  className?: string;
  compact?: boolean;
};

export function ChatMarkdown({ content, className, compact }: ChatMarkdownProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className={`markdown-prose text-[0.9375rem] leading-relaxed text-[var(--foreground)] [word-break:break-word] ${className ?? ""}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className ?? "");
            const codeText = String(children).replace(/\n$/, "");
            if (match && mounted) {
              return (
                <div className="my-3 first:mt-0 last:mb-0">
                  <SyntaxHighlighter
                    style={chatPrismTheme}
                    language={match[1]}
                    PreTag="div"
                    showLineNumbers={false}
                    codeTagProps={{
                      style: {
                        backgroundColor: "transparent",
                        fontFamily: "inherit",
                      },
                    }}
                    customStyle={{
                      margin: 0,
                      padding: "0.875rem 1rem",
                      borderRadius: "0.625rem",
                      background: "var(--code-block)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                  >
                    {codeText}
                  </SyntaxHighlighter>
                </div>
              );
            }
            if (match && !mounted) {
              return (
                <pre className="my-3 overflow-x-auto rounded-[0.625rem] border border-[var(--border-subtle)] bg-[var(--code-block)] p-3.5 text-[0.8125rem] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] first:mt-0 last:mb-0">
                  <code className={`${className ?? ""} font-mono text-[var(--foreground-subtle)]`}>
                    {codeText}
                  </code>
                </pre>
              );
            }
            return (
              <code className="rounded-md border border-white/[0.08] bg-[var(--code-inline)] px-1.5 py-0.5 font-mono text-[0.8125em] text-[var(--foreground-subtle)]">
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--accent)] underline decoration-[var(--accent)]/35 underline-offset-[3px] transition-colors hover:text-emerald-300 hover:decoration-emerald-400/50"
                {...props}
              >
                {children}
              </a>
            );
          },
          strong({ children, ...props }) {
            return (
              <strong className="font-semibold text-[var(--foreground)]" {...props}>
                {children}
              </strong>
            );
          },
          em({ children, ...props }) {
            return (
              <em className="italic text-[var(--foreground-subtle)]" {...props}>
                {children}
              </em>
            );
          },
          input(props) {
            const { type, checked, disabled, ...rest } = props;
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  disabled={disabled ?? true}
                  readOnly
                  className="mr-2 mt-0.5 h-3.5 w-3.5 shrink-0 cursor-default rounded border border-[var(--border)] bg-[var(--surface)] accent-[var(--accent)]"
                  {...rest}
                />
              );
            }
            return <input type={type} {...props} />;
          },
          ul({ children, className, ...props }) {
            const isTask = className?.includes("contains-task-list");
            return (
              <ul
                className={`my-2.5 space-y-1.5 pl-5 [overflow-wrap:anywhere] first:mt-0 last:mb-0 ${
                  isTask ? "list-none pl-1" : "list-disc marker:text-[var(--muted)]"
                }`}
                {...props}
              >
                {children}
              </ul>
            );
          },
          ol({ children, ...props }) {
            return (
              <ol
                className="my-2.5 list-decimal space-y-1.5 pl-5 marker:text-[var(--muted)] [overflow-wrap:anywhere] first:mt-0 last:mb-0"
                {...props}
              >
                {children}
              </ol>
            );
          },
          li({ children, className, ...props }) {
            const isTask = className?.includes("task-list-item");
            return (
              <li
                {...props}
                className={`${isTask ? "flex items-start gap-0" : "pl-0.5"} ${className ?? ""}`}
              >
                {children}
              </li>
            );
          },
          blockquote({ children, ...props }) {
            return (
              <blockquote
                className="my-3 border-l-[3px] border-[var(--accent)]/35 bg-[var(--accent-muted)] py-2 pl-4 pr-3 text-[var(--foreground-subtle)] first:mt-0 last:mb-0 [&_p]:my-1"
                {...props}
              >
                {children}
              </blockquote>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] first:mt-0 last:mb-0">
                <table className="w-full border-collapse text-left text-[0.8125rem]" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="border-b border-[var(--border)] bg-[var(--surface-raised)]">
                {children}
              </thead>
            );
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-[var(--border-subtle)]">{children}</tbody>;
          },
          tr({ children }) {
            return (
              <tr className="transition-colors hover:bg-[var(--surface-hover)]/50">{children}</tr>
            );
          },
          th({ children, ...props }) {
            return (
              <th
                className="px-3 py-2.5 font-semibold text-[var(--foreground)] first:rounded-tl-lg last:rounded-tr-lg"
                {...props}
              >
                {children}
              </th>
            );
          },
          td({ children, ...props }) {
            return (
              <td className="border-0 px-3 py-2.5 align-top text-[var(--foreground-subtle)]" {...props}>
                {children}
              </td>
            );
          },
          hr() {
            return <hr className="my-5 border-0 border-t border-[var(--border)]" />;
          },
          h1({ children, ...props }) {
            return (
              <h1
                className="mb-2 mt-5 border-b border-[var(--border-subtle)] pb-2 text-lg font-semibold tracking-tight text-[var(--foreground)] first:mt-0"
                {...props}
              >
                {children}
              </h1>
            );
          },
          h2({ children, ...props }) {
            return (
              <h2
                className="mb-2 mt-4 text-base font-semibold tracking-tight text-[var(--foreground)] first:mt-0"
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3({ children, ...props }) {
            return (
              <h3
                className="mb-1.5 mt-3 text-sm font-semibold text-[var(--foreground)] first:mt-0"
                {...props}
              >
                {children}
              </h3>
            );
          },
          p({ children, ...props }) {
            return (
              <p
                className={`[overflow-wrap:anywhere] first:mt-0 last:mb-0 ${compact ? "my-0" : "my-2.5"}`}
                {...props}
              >
                {children}
              </p>
            );
          },
          img({ src, alt, ...props }) {
            return (
              // eslint-disable-next-line @next/next/no-img-element -- external markdown URLs
              <img
                src={src}
                alt={alt ?? ""}
                className="my-3 max-h-72 max-w-full rounded-lg border border-[var(--border-subtle)] object-contain"
                loading="lazy"
                decoding="async"
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
