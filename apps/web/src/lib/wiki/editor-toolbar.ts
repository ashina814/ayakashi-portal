/**
 * Wiki エディタ共通ツールバー設定。
 * /wiki/[slug]/edit と /wiki/new で同じ並び・同じ動作にするため、データ駆動で定義。
 */

export interface ToolbarItem {
  /** Tiptap chain コマンド or ノード挿入のキー。bindToolbar が dispatch する */
  cmd?:
    | "h2"
    | "h3"
    | "paragraph"
    | "bold"
    | "italic"
    | "strike"
    | "code"
    | "bulletList"
    | "orderedList"
    | "blockquote"
    | "codeBlock"
    | "hr"
    | "link";
  insert?:
    | "callout:note"
    | "callout:warning"
    | "callout:danger"
    | "callout:success"
    | "callout:info"
    | "toggle"
    | "chip:ok"
    | "chip:ng"
    | "chip:warn";
  /** ボタンに表示する文字 */
  label: string;
  /** hover で出す説明（ショートカット込み） */
  title: string;
  /** 色見本ドットを描く際の色（callout / chip 系のみ） */
  color?: string;
}

export interface ToolbarGroup {
  /** グループのラベル（モバイルでも省略しない） */
  name: string;
  items: ToolbarItem[];
}

export const TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    name: "段落",
    items: [
      { cmd: "h2", label: "大見出し", title: "大見出し (Ctrl+Alt+2)" },
      { cmd: "h3", label: "中見出し", title: "中見出し (Ctrl+Alt+3)" },
      { cmd: "paragraph", label: "段落", title: "ふつうの段落に戻す (Ctrl+Alt+0)" },
    ],
  },
  {
    name: "装飾",
    items: [
      { cmd: "bold", label: "太字", title: "太字 (Ctrl+B)" },
      { cmd: "italic", label: "斜体", title: "斜体 (Ctrl+I)" },
      { cmd: "strike", label: "取消", title: "取消線 (Ctrl+Shift+S)" },
      { cmd: "code", label: "コード", title: "インラインコード (Ctrl+E)" },
    ],
  },
  {
    name: "ブロック",
    items: [
      { cmd: "bulletList", label: "・箇条書き", title: "箇条書きリスト (Ctrl+Shift+8)" },
      { cmd: "orderedList", label: "1. 番号付き", title: "番号付きリスト (Ctrl+Shift+7)" },
      { cmd: "blockquote", label: "引用", title: "引用ブロック (Ctrl+Shift+B)" },
      { cmd: "codeBlock", label: "コード塊", title: "コードブロック" },
      { cmd: "hr", label: "区切り線", title: "区切り線（横罫）" },
      { cmd: "link", label: "リンク", title: "選択範囲にリンクを付ける (Ctrl+K)" },
    ],
  },
  {
    name: "注意札",
    items: [
      { insert: "callout:note", label: "📓 覚書", title: "覚書（落ち着いた色味、補足情報）", color: "#5c5340" },
      { insert: "callout:info", label: "ℹ 情報", title: "情報（青白い炎の色）", color: "#3d5566" },
      { insert: "callout:warning", label: "⚠ 注意", title: "注意（金色、気を付けてほしいこと）", color: "#b89540" },
      { insert: "callout:danger", label: "🚫 危険", title: "危険（紅色、強い警告）", color: "#c1283a" },
      { insert: "callout:success", label: "✓ 成功", title: "成功（苔色、良い知らせ）", color: "#6b8a4e" },
      { insert: "toggle", label: "▶ 折りたたみ", title: "クリックで開閉する折りたたみブロック" },
    ],
  },
  {
    name: "印章",
    items: [
      { insert: "chip:ok", label: "○ 許可", title: "○ 許可・可", color: "#6b8a4e" },
      { insert: "chip:ng", label: "× 禁止", title: "× 禁止・不可", color: "#c1283a" },
      { insert: "chip:warn", label: "△ 条件", title: "△ 条件付き", color: "#b89540" },
    ],
  },
];

/** ヘルプダイアログに載せるショートカット一覧 */
export const SHORTCUT_HINTS: { keys: string; meaning: string }[] = [
  { keys: "Ctrl+B", meaning: "太字" },
  { keys: "Ctrl+I", meaning: "斜体" },
  { keys: "Ctrl+E", meaning: "インラインコード" },
  { keys: "Ctrl+K", meaning: "リンクを付ける" },
  { keys: "Ctrl+Alt+1〜6", meaning: "見出しレベル" },
  { keys: "Ctrl+Alt+0", meaning: "段落に戻す" },
  { keys: "Ctrl+Shift+7", meaning: "番号付きリスト" },
  { keys: "Ctrl+Shift+8", meaning: "箇条書き" },
  { keys: "Ctrl+Shift+B", meaning: "引用" },
  { keys: "Ctrl+Z / Ctrl+Shift+Z", meaning: "取り消し / やり直し" },
];
