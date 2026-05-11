/**
 * Tiptap JSON → HTML レンダラ（サーバーサイド）
 *
 * Cloudflare Workers では DOM が無いため Tiptap 公式の generateHTML（DOMSerializer 依存）
 * は使えない。自前で再帰的に JSON ツリーを HTML 文字列にする。
 *
 * 対応ノード:
 *   - 標準: doc, paragraph, heading(1-6), blockquote, bulletList, orderedList,
 *           listItem, codeBlock, horizontalRule, hardBreak
 *   - カスタム: callout, toggle, statusChip
 *   - マーク: bold, italic, strike, code, link, underline
 *
 * heading は <h2 id="h-N"> 形式の anchor を自動付与し、TOC でジャンプ可能にする。
 * renderWikiContent は本文 HTML と TOC エントリ一覧を返す。
 */

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
}

export interface TiptapDoc {
  type: "doc";
  content?: TiptapNode[];
}

export interface TocEntry {
  id: string;
  level: number; // 2 or 3
  text: string;
}

export interface RenderedWiki {
  html: string;
  toc: TocEntry[];
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]!);
}

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  return escapeHTML(trimmed);
}

/** ノード内のすべての text を平文として取り出す（TOC ラベル用） */
function plainText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(plainText).join("");
}

/** レンダリングコンテキスト。heading の id 連番と TOC を蓄積する */
interface RenderCtx {
  headingCounter: number;
  toc: TocEntry[];
}

function renderText(node: TiptapNode): string {
  if (typeof node.text !== "string") return "";
  let out = escapeHTML(node.text);
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (href) {
          out = `<a href="${href}" rel="noopener noreferrer" target="_blank">${out}</a>`;
        }
        break;
      }
    }
  }
  return out;
}

function renderChildren(nodes: TiptapNode[] | undefined, ctx: RenderCtx): string {
  if (!nodes) return "";
  return nodes.map((n) => renderNode(n, ctx)).join("");
}

const CALLOUT_VARIANTS = new Set(["note", "info", "warning", "danger", "success"]);
const CHIP_VARIANTS = new Set(["ok", "ng", "warn", "neutral"]);

function renderNode(node: TiptapNode, ctx: RenderCtx): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderChildren(node.content, ctx)}</p>`;

    case "heading": {
      const lvl = Number(node.attrs?.level);
      const level = lvl >= 1 && lvl <= 6 ? lvl : 2;
      ctx.headingCounter += 1;
      const id = `h-${ctx.headingCounter}`;
      const inner = renderChildren(node.content, ctx);
      if (level === 2 || level === 3) {
        ctx.toc.push({
          id,
          level,
          text: plainText(node),
        });
      }
      return `<h${level} id="${id}">${inner}<a class="heading-anchor" href="#${id}" aria-label="このセクションへのリンク">¶</a></h${level}>`;
    }

    case "blockquote":
      return `<blockquote>${renderChildren(node.content, ctx)}</blockquote>`;

    case "bulletList":
      return `<ul>${renderChildren(node.content, ctx)}</ul>`;

    case "orderedList":
      return `<ol>${renderChildren(node.content, ctx)}</ol>`;

    case "listItem":
      return `<li>${renderChildren(node.content, ctx)}</li>`;

    case "codeBlock": {
      const lang =
        typeof node.attrs?.language === "string"
          ? escapeHTML(node.attrs.language)
          : "";
      const raw =
        node.content
          ?.map((c) => (c.type === "text" ? c.text ?? "" : ""))
          .join("") ?? "";
      return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHTML(raw)}</code></pre>`;
    }

    case "horizontalRule":
      return `<hr />`;

    case "hardBreak":
      return `<br />`;

    case "text":
      return renderText(node);

    /* ── カスタムノード ───────────────────────── */

    case "callout": {
      const rawVariant = String(node.attrs?.variant ?? "note");
      const variant = CALLOUT_VARIANTS.has(rawVariant) ? rawVariant : "note";
      const title =
        typeof node.attrs?.title === "string" && node.attrs.title.length > 0
          ? escapeHTML(node.attrs.title)
          : null;
      return `<aside class="cl cl-${variant}">${
        title ? `<div class="cl-title">${title}</div>` : ""
      }<div class="cl-body">${renderChildren(node.content, ctx)}</div></aside>`;
    }

    case "toggle": {
      const summary =
        typeof node.attrs?.summary === "string"
          ? escapeHTML(node.attrs.summary)
          : "詳細を表示";
      const open = node.attrs?.open === true ? " open" : "";
      return `<details class="tg"${open}><summary>${summary}</summary><div class="tg-body">${renderChildren(node.content, ctx)}</div></details>`;
    }

    case "statusChip": {
      const rawVariant = String(node.attrs?.variant ?? "neutral");
      const variant = CHIP_VARIANTS.has(rawVariant) ? rawVariant : "neutral";
      const label =
        typeof node.attrs?.label === "string"
          ? escapeHTML(node.attrs.label)
          : variant === "ok"
            ? "○"
            : variant === "ng"
              ? "×"
              : variant === "warn"
                ? "△"
                : "—";
      return `<span class="chip chip-${variant}">${label}</span>`;
    }

    default:
      return "";
  }
}

/**
 * 保存された content 文字列を HTML + TOC に変換する。
 *
 * - Tiptap JSON ならパースして再帰描画
 * - 旧プレーンテキストの場合は単一段落でフォールバック
 */
export function renderWikiContent(content: string): RenderedWiki {
  if (!content || content.trim().length === 0) {
    return { html: "", toc: [] };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    const escaped = escapeHTML(content);
    return {
      html: `<p>${escaped.replace(/\n/g, "<br />")}</p>`,
      toc: [],
    };
  }

  if (
    !doc ||
    typeof doc !== "object" ||
    (doc as TiptapDoc).type !== "doc"
  ) {
    return {
      html: `<p>${escapeHTML(JSON.stringify(doc))}</p>`,
      toc: [],
    };
  }

  const ctx: RenderCtx = { headingCounter: 0, toc: [] };
  const html = renderChildren((doc as TiptapDoc).content, ctx);
  return { html, toc: ctx.toc };
}
