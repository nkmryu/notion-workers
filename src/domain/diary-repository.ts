import type { DailyPage } from "./daily";
import type { MonthlyPage } from "./monthly";
import type { WeeklyPage } from "./weekly";

// 日誌データベースのリポジトリ。アプリケーション層はこのインターフェースだけに依存し、infrastructure/notion が実装する。
// 一覧は種別ごとに取り、行から DailyPage / WeeklyPage / MonthlyPage への写像は実装側が行う。
// getPageMarkdown が返す本文は、bookmark 等の外部 URL が復元済みで、ドメインがそのまま読める形にする。
// getSectionTitles は転記状態の確認用で、本文の復元をせず最上位の見出しだけを返す。
export interface DiaryRepository {
  readonly listDailies: () => Promise<readonly DailyPage[]>;
  readonly listWeeklies: () => Promise<readonly WeeklyPage[]>;
  readonly listMonthlies: () => Promise<readonly MonthlyPage[]>;
  readonly createPageFromTemplate: (input: {
    readonly templateId: string;
    readonly title: string;
  }) => Promise<string>;
  readonly renamePage: (pageId: string, title: string) => Promise<void>;
  readonly lockPage: (pageId: string) => Promise<void>;
  readonly getSectionTitles: (pageId: string) => Promise<readonly string[]>;
  readonly getPageMarkdown: (pageId: string) => Promise<string>;
  readonly appendMarkdown: (pageId: string, content: string) => Promise<void>;
}

// appendMarkdown が本文の書式を理由に拒否されたときに投げる。転記はこのときだけ案内文へ切り替えて続行する。
export class ContentRejectedError extends Error {
  constructor(pageId: string, cause: unknown) {
    super(`ページ ${pageId} が本文を受け付けませんでした`, { cause });
    this.name = "ContentRejectedError";
  }
}
