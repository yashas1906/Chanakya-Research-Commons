"use client";

import { Fragment } from "react";
import { cx } from "@/lib/format";
import type { Citation } from "@/types/crc";

/** Inline [n] marker. Known refs are interactive; refs with no matching passage are muted. */
export function CitationPill({
  n,
  citation,
  active,
  onSelect,
}: {
  n: number;
  citation?: Citation;
  active: boolean;
  onSelect: (n: number) => void;
}) {
  if (!citation) {
    return (
      <span
        className="mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-full border border-dashed border-stone-300 px-1 align-middle text-meta font-semibold text-stone-400"
        title="No retrieved passage backs this reference"
      >
        {n}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(n)}
      title={`${citation.title}${citation.year ? ` (${citation.year})` : ""}`}
      aria-label={`Citation ${n}: ${citation.title}`}
      aria-pressed={active}
      className={cx(
        "num mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-full border px-1 align-middle text-meta font-semibold transition-colors duration-150",
        active ? "border-ink bg-ink text-white" : "border-stone-300 bg-paper text-stone-600 hover:border-ink hover:text-ink",
      )}
    >
      {n}
    </button>
  );
}

function renderInline(
  text: string,
  citations: Map<number, Citation>,
  activeRef: number | null,
  onSelect: (n: number) => void,
  keyPrefix: string,
) {
  // Split on **bold** and [n] (also [1, 2] / [1][2] style lists).
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+(?:\s*,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    if (!part) return null;
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const ref = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (ref) {
      return (
        <Fragment key={key}>
          {ref[1].split(/\s*,\s*/).map((s, j) => {
            const n = Number(s);
            return <CitationPill key={`${key}-${j}`} n={n} citation={citations.get(n)} active={activeRef === n} onSelect={onSelect} />;
          })}
        </Fragment>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Renders model output: paragraphs, simple bullet/numbered lists, **bold**, and [n] citation pills. */
export function AnswerText({
  text,
  citations,
  activeRef,
  onSelect,
}: {
  text: string;
  citations: Citation[];
  activeRef: number | null;
  onSelect: (n: number) => void;
}) {
  const map = new Map(citations.map((c) => [c.ref_index, c]));
  const blocks = parseBlocks(text);

  return (
    <div className="space-y-3.5 font-serif text-[17px] leading-[1.75] text-stone-800">
      {blocks.map((b, bi) => {
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={cx("space-y-1.5 pl-5", b.ordered ? "list-decimal" : "list-disc", "marker:text-stone-400")}>
              {b.items.map((l, li) => (
                <li key={li}>{renderInline(l, map, activeRef, onSelect, `b${bi}l${li}`)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={bi}>
            {b.lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l, map, activeRef, onSelect, `b${bi}l${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

type Block = { type: "p"; lines: string[] } | { type: "list"; ordered: boolean; items: string[] };

const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;

/**
 * Splits model output into paragraphs and lists. Lists may directly follow a lead-in line
 * ("The main challenges are:\n- a\n- b") without a blank line between them.
 */
function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const chunk of text.trim().split(/\n{2,}/)) {
    let firstInChunk = true;
    for (const line of chunk.split("\n")) {
      if (line.trim() === "") continue;
      const last = out[out.length - 1];
      if (LIST_ITEM.test(line)) {
        const ordered = /^\s*\d+[.)]/.test(line);
        const body = line.replace(LIST_ITEM, "");
        if (!firstInChunk && last?.type === "list" && last.ordered === ordered) last.items.push(body);
        else out.push({ type: "list", ordered, items: [body] });
      } else if (!firstInChunk && last?.type === "p") {
        last.lines.push(line);
      } else {
        out.push({ type: "p", lines: [line] });
      }
      firstInChunk = false;
    }
  }
  return out;
}

/** Which [n] markers the answer actually uses. */
export function citedRefs(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) m[1].split(/\s*,\s*/).forEach((s) => out.add(Number(s)));
  return out;
}
