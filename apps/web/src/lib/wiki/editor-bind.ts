/**
 * Tiptap エディタとツールバー DOM のバインディング。
 * /wiki/[slug]/edit と /wiki/new の両方から使う。
 *
 * - data-cmd 属性のボタンは chain コマンドにマップ
 * - data-insert 属性のボタンはノード挿入
 */

import type { Editor } from "@tiptap/core";

export function bindToolbar(root: HTMLElement, editor: Editor): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>(".we-btn[data-cmd]")) {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd!;
      const chain = editor.chain().focus();
      switch (cmd) {
        case "h2":
          chain.toggleHeading({ level: 2 }).run();
          break;
        case "h3":
          chain.toggleHeading({ level: 3 }).run();
          break;
        case "paragraph":
          chain.setParagraph().run();
          break;
        case "bold":
          chain.toggleBold().run();
          break;
        case "italic":
          chain.toggleItalic().run();
          break;
        case "strike":
          chain.toggleStrike().run();
          break;
        case "code":
          chain.toggleCode().run();
          break;
        case "bulletList":
          chain.toggleBulletList().run();
          break;
        case "orderedList":
          chain.toggleOrderedList().run();
          break;
        case "blockquote":
          chain.toggleBlockquote().run();
          break;
        case "codeBlock":
          chain.toggleCodeBlock().run();
          break;
        case "hr":
          chain.setHorizontalRule().run();
          break;
        case "link": {
          const url = window.prompt("リンクURL", "https://");
          if (url) chain.setLink({ href: url }).run();
          else chain.unsetLink().run();
          break;
        }
      }
    });
  }

  for (const btn of root.querySelectorAll<HTMLButtonElement>(".we-btn[data-insert]")) {
    btn.addEventListener("click", () => {
      const ins = btn.dataset.insert!;
      const chain = editor.chain().focus();
      if (ins.startsWith("callout:")) {
        const variant = ins.split(":")[1];
        const title =
          variant === "note"
            ? "覚書"
            : variant === "info"
              ? "情報"
              : variant === "warning"
                ? "注意"
                : variant === "danger"
                  ? "危険"
                  : variant === "success"
                    ? "成功"
                    : null;
        chain
          .insertContent({
            type: "callout",
            attrs: { variant, title },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "本文" }] },
            ],
          })
          .run();
      } else if (ins === "toggle") {
        chain
          .insertContent({
            type: "toggle",
            attrs: { summary: "クリックで開く" },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "中身" }] },
            ],
          })
          .run();
      } else if (ins.startsWith("chip:")) {
        const variant = ins.split(":")[1];
        const label = variant === "ok" ? "○" : variant === "ng" ? "×" : "△";
        chain
          .insertContent({
            type: "statusChip",
            attrs: { variant, label },
          })
          .run();
      }
    });
  }
}

/** ヘルプダイアログの開閉。data-help-open ボタン → data-help-dialog を表示 */
export function bindHelpDialog(root: HTMLElement): void {
  const dialog = root.querySelector<HTMLDialogElement>("[data-help-dialog]");
  const openBtn = root.querySelector<HTMLButtonElement>("[data-help-open]");
  const closeBtn = root.querySelector<HTMLButtonElement>("[data-help-close]");
  if (!dialog || !openBtn) return;

  openBtn.addEventListener("click", () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });
  closeBtn?.addEventListener("click", () => dialog.close());
  // 背景クリックで閉じる
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}
