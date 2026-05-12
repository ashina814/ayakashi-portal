/**
 * Wiki Repository
 *
 * wiki_pages / wiki_revisions / wiki_visibility テーブルの読み取りをカプセル化。
 * 編集系（書き込み・楽観ロック・サニタイズ）は M3c で追加予定。
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { wikiPages, wikiRevisions, wikiVisibility } from "@ayakashi/db";
import { renderWikiContent, type TocEntry } from "../wiki/render";

export interface WikiPageListItem {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  updatedAt: Date;
}

export interface WikiPageDetail extends WikiPageListItem {
  /** 保存されている生の content（Tiptap JSON 文字列 or レガシープレーンテキスト） */
  content: string;
  /** サーバーサイドでレンダリング済みの HTML（描画用） */
  contentHtml: string;
  /** H2/H3 から抽出した目次 */
  toc: TocEntry[];
  /** ルート→現在ページのパンくず（自身を末尾に含む） */
  breadcrumbs: WikiCrumb[];
  revisionCreatedAt: Date | null;
}

export interface WikiCrumb {
  id: string;
  slug: string;
  title: string;
}

export interface WikiTreeNode extends WikiPageListItem {
  children: WikiTreeNode[];
}

/**
 * 閲覧可否の SQL 条件: visibility 行が無い（public）か、
 * いずれかの required_role_alias がユーザーの alias 集合に含まれる。
 *
 * drizzle-orm の exists/notExists ヘルパは subquery を () で包まないため
 * 生 SQL で組み立てる。
 */
function buildVisibilityFilter(aliases: string[]) {
  if (aliases.length === 0) {
    return sql`NOT EXISTS (
      SELECT 1 FROM ${wikiVisibility}
      WHERE ${wikiVisibility.pageId} = ${wikiPages.id}
    )`;
  }
  return sql`(
    NOT EXISTS (
      SELECT 1 FROM ${wikiVisibility}
      WHERE ${wikiVisibility.pageId} = ${wikiPages.id}
    )
    OR EXISTS (
      SELECT 1 FROM ${wikiVisibility}
      WHERE ${wikiVisibility.pageId} = ${wikiPages.id}
        AND ${inArray(wikiVisibility.requiredRoleAlias, aliases)}
    )
  )`;
}

/**
 * 閲覧可能なページの一覧（更新日時降順、フラット）。
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
      parentId: wikiPages.parentId,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(buildVisibilityFilter(aliases))
    .orderBy(desc(wikiPages.updatedAt));
}

/**
 * 閲覧可能なページを階層ツリーで返す。同階層内はタイトル昇順。
 * 親が閲覧不可で子が閲覧可の「迷子」はルート扱いに浮上させる。
 */
export async function getWikiTree(
  db: NeonHttpDatabase<any>,
  aliases: string[],
): Promise<WikiTreeNode[]> {
  const flat = await db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      parentId: wikiPages.parentId,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(buildVisibilityFilter(aliases))
    .orderBy(asc(wikiPages.title));

  const byId = new Map<string, WikiTreeNode>(
    flat.map((p) => [p.id, { ...p, children: [] }]),
  );

  const roots: WikiTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * ルートから対象ページまでのパンくずを返す。深さ制限あり（無限ループ防止）。
 */
async function getBreadcrumbs(
  db: NeonHttpDatabase<any>,
  pageId: string,
): Promise<WikiCrumb[]> {
  const crumbs: WikiCrumb[] = [];
  let currentId: string | null = pageId;
  for (let depth = 0; depth < 10 && currentId; depth += 1) {
    const [row] = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        parentId: wikiPages.parentId,
      })
      .from(wikiPages)
      .where(eq(wikiPages.id, currentId))
      .limit(1);
    if (!row) break;
    crumbs.unshift({ id: row.id, slug: row.slug, title: row.title });
    currentId = row.parentId;
  }
  return crumbs;
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

  const rendered = renderWikiContent(content);
  const breadcrumbs = await getBreadcrumbs(db, page.id);

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parentId,
    updatedAt: page.updatedAt,
    content,
    contentHtml: rendered.html,
    toc: rendered.toc,
    breadcrumbs,
    revisionCreatedAt,
  };
}
