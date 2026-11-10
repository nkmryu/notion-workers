import type { DailyPage } from "./daily";

// 日誌データベースのリポジトリ。アプリケーション層はこのインターフェースだけに依存し、infrastructure/notion が実装する。
// 一覧は Daily だけを取り、行から DailyPage への写像は実装側が行う。
export interface DiaryRepository {
  readonly listDailies: () => Promise<readonly DailyPage[]>;
  // ページはテンプレートから作る。テンプレートの指定は Notion の事情なので実装側が持つ。
  readonly createDaily: (title: string) => Promise<string>;
  readonly renamePage: (pageId: string, title: string) => Promise<void>;
  readonly lockPage: (pageId: string) => Promise<void>;
}
