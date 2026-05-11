/**
 * Tiptap JSON → HTML レンダラ（サーバーサイド）
 *
 * Cloudflare Workers では DOM が無いため Tiptap 公式の generateHTML（DOMSerializer 依存）
 * は使えない。自前で再帰的に JSON ツリーを HTML 文字列にする。
 *
 * 対応ノード（Tiptap StarterKit 互換）:
 *   - doc, paragraph, heading(level 1-6), blockquote
 *   - bulletList, orderedList, listItem
 *   - codeBlock, horizontalRule, hardBreak
 *   - text + marks (bold, italic, strike, code, link, underline)
 *
 * 拡張ノードは PR 2 で追加予定: callout, toggle, status-chip 等。
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

/**
 * 属性値のエスケープ + 危険なスキームの遮断。
 * javascript: / data: / vbscript: で始まるリンクを無効化する。
 */
function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  return escapeHTML(trimmed);
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

function renderChildren(nodes?: TiptapNode[]): string {
  if (!nodes) return "";
  return nodes.map(renderNode).join("");
}

function renderNode(node: TiptapNode): string {
  switch (node.type) {
    case "paragraph": {
      const inner = renderChildren(node.content);
      return `<p>${inner}</p>`;
    }
    case "heading": {
      const lvl = Number(node.attrs?.level);
      const level = lvl >= 1 && lvl <= 6 ? lvl : 2;
      return `<h${level}>${renderChildren(node.content)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${renderChildren(node.content)}</blockquote>`;
    case "bulletList":
      return `<ul>${renderChildren(node.content)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node.content)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node.content)}</li>`;
    case "codeBlock": {
      const lang =
        typeof node.attrs?.language === "string"
          ? escapeHTML(node.attrs.language)
          : "";
      // codeBlock の child は通常 text ノードのみ。エスケープして出す。
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
    default:
      // 未知ノードはサイレント無視（PR 2 で拡張ノードを追加）
      return "";
  }
}

/**
 * 保存された content 文字列を HTML に変換する。
 *
 * - Tiptap JSON 文字列であればパースしてレンダリング
 * - 旧プレーンテキストの場合は段落としてフォールバック表示
 */
export function renderWikiContent(content: string): string {
  if (!content || content.trim().length === 0) return "";

  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    // 旧データ: 改行保持の単一段落でラップ
    const escaped = escapeHTML(content);
    return `<p>${escaped.replace(/\n/g, "<br />")}</p>`;
  }

  if (
    !doc ||
    typeof doc !== "object" ||
    (doc as TiptapDoc).type !== "doc"
  ) {
    return `<p>${escapeHTML(JSON.stringify(doc))}</p>`;
  }

  return renderChildren((doc as TiptapDoc).content);
}
