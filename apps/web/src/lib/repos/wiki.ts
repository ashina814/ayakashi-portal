/**
 * Wiki Repository
 *
 * wiki_pages / wiki_revisions / wiki_visibility テーブルの読み取りをカプセル化。
 * 編集系（書き込み・楽観ロック・サニタイズ）は M3c で追加予定。
 */

import { and, desc, eq, exists, inArray, notExists, or, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { wikiPages, wikiRevisions, wikiVisibility } from "@ayakashi/db";

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
 * 閲覧可否の SQL 条件: visibility 行が無い（public）か、
 * いずれかの required_role_alias がユーザーの alias 集合に含まれる。
 */
function buildVisibilityFilter(aliases: string[]) {
  const noVisibility = notExists(
    sql`select 1 from ${wikiVisibility}
        where ${wikiVisibility.pageId} = ${wikiPages.id}`,
  );

  if (aliases.length === 0) {
    // alias を1つも持たないユーザーは public ページのみ
    return noVisibility;
  }

  const hasMatchingAlias = exists(
    sql`select 1 from ${wikiVisibility}
        where ${wikiVisibility.pageId} = ${wikiPages.id}
          and ${inArray(wikiVisibility.requiredRoleAlias, aliases)}`,
  );

  return or(noVisibility, hasMatchingAlias);
}

/**
 * 閲覧可能なページの一覧（更新日時降順）。
 */
export async function listPages(
  db: NeonHttpDatabase<any>,
  aliases: string[],
): Promise<WikiPageListItem[]> {
  return await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(buildVisibilityFilter(aliases))
    .orderBy(desc(wikiPages.updatedAt));
}

/**
 * slug からページを取得。閲覧権限が無ければ null を返す（404 と同等）。
 */
export async function getPageBySlug(
  db: NeonHttpDatabase<any>,
  slug: string,
  aliases: string[],
): Promise<WikiPageDetail | null> {
  const [page] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.slug, slug), buildVisibilityFilter(aliases)))
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
