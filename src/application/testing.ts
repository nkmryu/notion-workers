import type { DailyPage } from "../domain/daily";
import type { DiaryRepository } from "../domain/diary-repository";
import type { MonthlyPage } from "../domain/monthly";
import type { PeriodType } from "../domain/page";
import type { WeeklyPage } from "../domain/weekly";
import type { WebPageTitleLookup } from "./web-page-title-lookup";

import { extractSectionTitles } from "../domain/markdown-section";

// ユースケースのテスト用。呼び出しを順に記録し、追記した本文を次の読み取りへ反映するインメモリのリポジトリ。
export type RecordedCall =
  | { readonly method: "createDaily"; readonly title: string }
  | { readonly method: "createPeriodPage"; readonly type: PeriodType; readonly title: string }
  | { readonly method: "renamePage"; readonly pageId: string; readonly title: string }
  | { readonly method: "lockPage"; readonly pageId: string }
  | { readonly method: "appendMarkdown"; readonly pageId: string; readonly content: string };

export interface FakeDiaryOptions {
  readonly dailies?: readonly DailyPage[];
  readonly weeklies?: readonly WeeklyPage[];
  readonly monthlies?: readonly MonthlyPage[];
  readonly markdown?: Readonly<Record<string, string>>;
  // appendMarkdown を失敗させたい内容を判定する
  readonly rejectAppend?: (pageId: string, content: string) => Error | null;
}

export interface FakeDiary extends DiaryRepository {
  readonly calls: readonly RecordedCall[];
  readonly markdownOf: (pageId: string) => string;
}

export function createFakeDiary(options: FakeDiaryOptions = {}): FakeDiary {
  const calls: RecordedCall[] = [];
  const markdown = new Map(Object.entries(options.markdown ?? {}));

  return {
    calls,
    markdownOf(pageId) {
      return markdown.get(pageId) ?? "";
    },
    async listDailies() {
      return options.dailies ?? [];
    },
    async listWeeklies() {
      return options.weeklies ?? [];
    },
    async listMonthlies() {
      return options.monthlies ?? [];
    },
    async createDaily(title) {
      calls.push({ method: "createDaily", title });
      return `daily-${title}`;
    },
    async createPeriodPage(type, title) {
      calls.push({ method: "createPeriodPage", type, title });
      return `${type}-${title}`;
    },
    async renamePage(pageId, title) {
      calls.push({ method: "renamePage", pageId, title });
    },
    async lockPage(pageId) {
      calls.push({ method: "lockPage", pageId });
    },
    async getSectionTitles(pageId) {
      return extractSectionTitles(markdown.get(pageId) ?? "");
    },
    async getPageMarkdown(pageId) {
      return markdown.get(pageId) ?? "";
    },
    async appendMarkdown(pageId, content) {
      const rejection = options.rejectAppend?.(pageId, content) ?? null;

      if (rejection !== null) {
        throw rejection;
      }

      calls.push({ method: "appendMarkdown", pageId, content });
      markdown.set(pageId, `${markdown.get(pageId) ?? ""}${content}`);
    },
    mentionOf(pageId) {
      return `@${pageId}`;
    },
  };
}

export const noPageTitles: WebPageTitleLookup = {
  async lookupTitle() {
    return null;
  },
};
