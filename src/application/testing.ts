import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { DiaryRepository } from "../domain/diary-repository";
import type { HabitPage } from "../domain/habit";
import type { HabitRepository } from "../domain/habit-repository";

// ユースケースのテスト用。呼び出しを順に記録するインメモリのリポジトリ。
export type RecordedCall =
  | { readonly method: "createDaily"; readonly title: string; readonly date: Temporal.PlainDate }
  | { readonly method: "renamePage"; readonly pageId: string; readonly title: string }
  | { readonly method: "lockPage"; readonly pageId: string };

export interface FakeDiary extends DiaryRepository {
  readonly calls: readonly RecordedCall[];
}

export function createFakeDiary(dailies: readonly DailyPage[] = []): FakeDiary {
  const calls: RecordedCall[] = [];

  return {
    calls,
    async listDailies() {
      return dailies;
    },
    async createDaily({ title, date }) {
      calls.push({ method: "createDaily", title, date });
      return `daily-${title}`;
    },
    async renamePage(pageId, title) {
      calls.push({ method: "renamePage", pageId, title });
    },
    async lockPage(pageId) {
      calls.push({ method: "lockPage", pageId });
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
