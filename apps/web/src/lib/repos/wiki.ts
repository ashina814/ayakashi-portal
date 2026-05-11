/**
 * Wiki Repository
 *
 * wiki_pages / wiki_revisions テーブルの読み取りをカプセル化。
 * 編集系（書き込み・楽観ロック・サニタイズ）は M3c で追加予定。
 */

import { desc, eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { wikiPages, wikiRevisions } from "@ayakashi/db";

export interface WikiPageListItem {
  id: string;
  slug: string;
  title: string;
  updatedAt: Date;
}

export interface WikiPageDetail extends WikiPageListItem {
  content: string;
  revisionCreatedAt: Date | null;
}

/**
 * 全ページの一覧（更新日時降順）。
 * 公開範囲フィルタは M3b で追加する。
 */
export async function listPages(
  db: NeonHttpDatabase<any>,
): Promise<WikiPageListItem[]> {
  return await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .orderBy(desc(wikiPages.updatedAt));
}

/**
 * slug からページを取得し、現在の revision の本文も付ける。
 * page は存在するが current_revision_id が null（書きかけ）の場合は
 * content を空文字で返す。
 */
export async function getPageBySlug(
  db: NeonHttpDatabase<any>,
  slug: string,
): Promise<WikiPageDetail | null> {
  const [page] = await db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .limit(1);

  if (!page) return null;

  let content = "";
  let revisionCreatedAt: Date | null = null;
  if (page.currentRevisionId) {
    const [rev] = await db
      .select({
        content: wikiRevisions.content,
        createdAt: wikiRevisions.createdAt,
      })
      .from(wikiRevisions)
      .where(eq(wikiRevisions.id, page.currentRevisionId))
      .limit(1);
    if (rev) {
      content = rev.content;
      revisionCreatedAt = rev.createdAt;
    }
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    updatedAt: page.updatedAt,
    content,
    revisionCreatedAt,
  };
}
