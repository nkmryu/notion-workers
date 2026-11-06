import type { HabitPage } from "./habit";

// 習慣データベースのリポジトリ。日誌とは別のデータベースなので DiaryRepository と分ける。
// 習慣ページは作るだけで、リネームもロックもしない（就寝時刻などを翌日以降に記入するため）。
export interface HabitRepository {
  readonly listHabits: () => Promise<readonly HabitPage[]>;
  readonly createHabit: (title: string) => Promise<string>;
}
