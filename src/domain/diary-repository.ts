import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "./daily";

// 新しく作る Daily。タイトルは日付から決まるが、その規則はドメインが持つので、決めた結果を両方渡す。
export interface NewDaily {
  readonly title: string;
  readonly date: Temporal.PlainDate;
}

// 日誌データベースのリポジトリ。アプリケーション層はこのインターフェースだけに依存し、infrastructure/notion が実装する。
// 一覧は Daily だけを取り、行から DailyPage への写像は実装側が行う。
// getPageMarkdown が返す本文は、実装側の方言を正規化済みで、ドメインがそのまま読める形にする
// （参照は [text](url)、コピーできない箇所は元ページへの言及に置換済み）。
// getDigestSectionTitles は転記状態の確認用で、本文の正規化をせず、まとめの見出しより後ろの見出し 2 だけを返す。
// まとめの見出しが無ければ null を返す。
export interface DiaryRepository {
  readonly listDailies: () => Promise<readonly DailyPage[]>;
  // ページはテンプレートから作る。テンプレートの指定は Notion の事情なので実装側が持つ。
  // 作ったページは、同じ実行で転記先やロックの対象にするため、エンティティで返す。
  readonly createDaily: (daily: NewDaily) => Promise<DailyPage>;
  readonly renamePage: (pageId: string, title: string) => Promise<void>;
  readonly lockPage: (pageId: string) => Promise<void>;
  readonly getDigestSectionTitles: (pageId: string, label: string) => Promise<readonly string[] | null>;
  readonly getPageMarkdown: (pageId: string) => Promise<string>;
  readonly appendMarkdown: (pageId: string, content: string) => Promise<void>;
  // 本文中でページへ言及する表記。転記を省略した日から元ページへ辿れるようにする。
  readonly mentionOf: (pageId: string) => string;
}

// appendMarkdown が本文（書式や大きさ）を理由に拒否されたときに投げる。転記はこのときだけ案内文へ切り替えて続行する。
export class ContentRejectedError extends Error {
  constructor(pageId: string, cause: unknown) {
    super(`ページ ${pageId} が本文を受け付けませんでした`, { cause });
    this.name = "ContentRejectedError";
  }
}
