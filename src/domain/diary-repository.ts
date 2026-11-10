import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "./daily";

// 新しく作る Daily。タイトルは日付から決まるが、その規則はドメインが持つので、決めた結果を両方渡す。
export interface NewDaily {
  readonly title: string;
  readonly date: Temporal.PlainDate;
}

// 日誌データベースのリポジトリ。アプリケーション層はこのインターフェースだけに依存し、infrastructure/notion が実装する。
// 一覧は Daily だけを取り、行から DailyPage への写像は実装側が行う。
export interface DiaryRepository {
  readonly listDailies: () => Promise<readonly DailyPage[]>;
  // ページはテンプレートから作る。テンプレートの指定は Notion の事情なので実装側が持つ。
  readonly createDaily: (daily: NewDaily) => Promise<string>;
  readonly renamePage: (pageId: string, title: string) => Promise<void>;
  readonly lockPage: (pageId: string) => Promise<void>;
}
