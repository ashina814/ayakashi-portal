/**
 * Tiptap エディタ用カスタムノード定義
 *
 * サーバーサイドレンダラ（render.ts）と JSON 形状を揃えるため、
 * 同じノード名・属性で Tiptap Node 拡張を作る。これにより
 * 「エディタで挿入したノード」が「サーバー描画」でそのまま絵になる。
 *
 * client side でしか import しないでください
 * （prosemirror が DOM を触るためサーバー側 import は意味がない）。
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "note",
        parseHTML: (el) => el.getAttribute("data-variant") ?? "note",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-title"),
        renderHTML: (attrs) =>
          attrs.title ? { "data-title": attrs.title } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside.cl" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const variant = String(node.attrs.variant ?? "note");
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { class: `cl cl-${variant}` }),
      0,
    ];
  },
});

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      summary: {
        default: "詳細を表示",
        parseHTML: (el) => el.getAttribute("data-summary") ?? "詳細を表示",
        renderHTML: (attrs) => ({ "data-summary": attrs.summary }),
      },
      open: {
        default: false,
        parseHTML: (el) => el.hasAttribute("open"),
        renderHTML: (attrs) => (attrs.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "details.tg" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { class: "tg" }), 0];
  },
});

export const StatusChip = Node.create({
  name: "statusChip",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      variant: {
        default: "neutral",
        parseHTML: (el) => el.getAttribute("data-variant") ?? "neutral",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span.chip" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const variant = String(node.attrs.variant ?? "neutral");
    const label = String(
      node.attrs.label ||
        (variant === "ok"
          ? "○"
          : variant === "ng"
            ? "×"
            : variant === "warn"
              ? "△"
              : "—"),
    );
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: `chip chip-${variant}` }),
      label,
    ];
  },
});
