/**
 * 役割 alias に基づく権限ヘルパ。
 * role_aliases テーブルの alias 列と一致する文字列を「特殊権限の鍵」として扱う。
 */

export const ADMIN_ALIAS = "admin";
export const WIKI_EDITOR_ALIAS = "wiki_editor";

/** すべての特殊権限の親。admin は他すべての権限を内包する。 */
export function isAdmin(aliases: string[]): boolean {
  return aliases.includes(ADMIN_ALIAS);
}

/** Wiki ページの編集 / 新規作成 / 削除ができるか。admin も常に true。 */
export function canEditWiki(aliases: string[]): boolean {
  return aliases.includes(WIKI_EDITOR_ALIAS) || isAdmin(aliases);
}
