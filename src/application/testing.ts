import type { Temporal } from "temporal-polyfill";

import type { DiaryRepository } from "../domain/diary-repository";
import type { HabitPage } from "../domain/habit";
import type { HabitRepository } from "../domain/habit-repository";
import type { WebPageTitleLookup } from "./web-page-title-lookup";

import { DailyPage } from "../domain/daily";
import { extractDigestSectionTitles } from "../domain/markdown-section";

// ユースケースのテスト用。呼び出しを順に記録し、追記した本文を次の読み取りへ反映するインメモリのリポジトリ。
export type RecordedCall =
  | { readonly method: "createDaily"; readonly title: string; readonly date: Temporal.PlainDate }
  | { readonly method: "renamePage"; readonly pageId: string; readonly title: string }
  | { readonly method: "lockPage"; readonly pageId: string }
  | { readonly method: "appendMarkdown"; readonly pageId: string; readonly content: string };

export interface FakeDiaryOptions {
  readonly dailies?: readonly DailyPage[];
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
    async createDaily({ title, date }) {
      calls.push({ method: "createDaily", title, date });
      return DailyPage.fromRecord({
        id: `daily-${date.toString()}`,
        createdTime: "2026-12-31T00:00:00.000Z",
        title,
        isLocked: false,
      });
    },
    async renamePage(pageId, title) {
      calls.push({ method: "renamePage", pageId, title });
    },
    async lockPage(pageId) {
      calls.push({ method: "lockPage", pageId });
    },
    async getDigestSectionTitles(pageId, label) {
      return extractDigestSectionTitles(markdown.get(pageId) ?? "", label);
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

// 習慣のリポジトリ。作成したタイトルを順に記録する。
export interface FakeHabits extends HabitRepository {
  readonly createdTitles: readonly string[];
}

export function createFakeHabits(pages: readonly HabitPage[] = []): FakeHabits {
  const createdTitles: string[] = [];

  return {
    createdTitles,
    async listHabits() {
      return pages;
    },
    async createHabit(title) {
      createdTitles.push(title);
      return `habit-${title}`;
    },
  };
}

export const noPageTitles: WebPageTitleLookup = {
  async lookupTitle() {
    return null;
  },
};
