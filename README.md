# Notion Workers

Notion の日誌データベース（「ナレッジ」）と習慣データベース（「習慣」）を毎日整える GitHub Actions ジョブと、そのローカル CLI。Daily の作成とロック、習慣ページの作成を 1 回の実行で行う。Notion API へは `@notionhq/client` でアクセスする。

## まず動かす

```sh
npm install                 # Node.js 24（.node-version）
cp .env.example .env        # NOTION_TOKEN・NOTION_DATA_SOURCE_ID・NOTION_HABIT_DATA_SOURCE_ID を記入する（テンプレート ID は記入済み）
npm run maintain            # 定期処理を手元で 1 回だけ実行する
```

環境変数の詳細は [セットアップ](#セットアップ) にある。

## 1 回の実行で何が起きるか

`npm run maintain`（`src/main.ts`）は Daily → 習慣の順に、種別ごとに完結して処理する。習慣は別のデータベースで、Daily とページを共有しない。

| 段階 | すること |
|---|---|
| 1. Daily | 今日のページが無ければ作り、タイトルを `26.07.22（水）` に整える。終了した Daily のうち未ロックのものをロックする |
| 2. 習慣 | 今日のページが無ければ、タイトル `26.07.22（水）` だけの空のページを作る。過去日のページには触れない |

「終了した Daily」は今日より前の日付の Daily を指す。今日の分は書きかけとみなし、ロックしない。

### 冪等性

すべての処理は冪等で、途中で失敗しても次回の実行で未完了分のみを処理する。1 実行あたりの件数上限は設けていない。

| 処理 | 冪等キー |
|---|---|
| 今日の Daily 作成 | 日付 |
| 今日の習慣ページ作成 | 日付 |
| ロック | `is_locked` |

## 週・月の見方

週・月は Daily をまとめるページを作らず、日誌データベースのカレンダービュー（`date` プロパティ、月表示）で見る。

日付は 1 日ごとに決まる絶対的な値で、「週末」「月末」は周りの日との関係で決まる相対的な値である。以前は Weekly / Monthly のページを作り、Daily の本文を転記していた。週と月が同時に変わる日の実行では Daily・Weekly・Monthly の 3 ページが一度に増え、週・月のページはまとめ用にしか使われなかった。2026-11-10 に Weekly / Monthly の作成・転記・Refs 生成をやめ、コードを消した（消す前のコードは `8dd7654` にある）。

- カレンダーは `date` で日を決める。コードは `date` を書かない。Daily の作成時に Notion 側で入る（2026-11-10 時点で Daily 791 件すべて、タイトルの日付と一致）
- コードはタイトルで日を決める。日次テンプレートを変えるときは、作成した Daily に今日の `date` が入ることを確かめる

## ページ種別

種別は `type` select で決まる。`📝 Daily` だけを取得し、それ以外の値や未設定のページ（メモ）はどの処理にも含めない。メモは自動でロックしない。

- Daily の日付はタイトル `26.07.22（水）` から決める（曜日文字は使わない）。テンプレート適用中で空タイトルなら作成日（JST）を使う。日付でも空でもないタイトルの Daily は不整合として実行を止める

## 習慣ページ

習慣データベースは日誌とは別のデータベースで、1 日 1 ページに起床時刻・就寝時刻・運動・体重を記録する。

- 作るのは今日の 1 ページだけ。ページが無い過去日をさかのぼって作らない
- テンプレートは使わない。プロパティは空のまま作り、人が記入する
- ロックもリネームもしない。就寝時刻は翌日以降に記入するため
- 日付はタイトル `26.07.22（水）` から決める（曜日文字は使わない）。習慣データベースには `type` が無いので、全ページを対象にする。日付として読めないタイトルのページは、どの日の分でもないページとして読み飛ばす。存在しない日付（`26.02.30（月）` など）のタイトルは不整合として実行を止める

## セットアップ

1. Node.js 24（`.node-version`）を用意し `npm install` を実行する
2. Notion Integration を作り、日誌データベース・習慣データベースと日次テンプレートへアクセス権を付与する
3. Notion 側の繰り返しテンプレート設定をオフにする
4. 日次テンプレートの `type` select を `📝 Daily` にし、`date` に作成日が入るようにする（種別と日付はテンプレートが付ける）
5. `.env.example` を `.env` へコピーし、次の環境変数を記入する

| 環境変数 | 内容 |
|---|---|
| `NOTION_TOKEN` | Notion Integration のトークン（秘密） |
| `NOTION_DATA_SOURCE_ID` | 日誌データベースの data source ID（秘密）。database ID ではない。データベース URL の ID を `database_id` として `GET /v1/databases/{database_id}` を呼び、`data_sources[0].id` を取得して保存する（Notion の 2025-09-03 移行ガイドが推奨する discovery step） |
| `NOTION_HABIT_DATA_SOURCE_ID` | 習慣データベースの data source ID（秘密）。取得方法は `NOTION_DATA_SOURCE_ID` と同じ |
| `NOTION_TEMPLATE_ID` | 日次テンプレートのページ ID |

## 定期実行（GitHub Actions）

`.github/workflows/maintain.yml` が JST 2:23 と 7:23（UTC `23 17 * * *` と `23 22 * * *`）に `npm run maintain` を実行する。2:23 が本番で、7:23 は 2:23 が失敗したときの再試行（冪等なので成功時は何もしない）。毎時 0 分は schedule が混むため避けている。`workflow_dispatch` で手動実行もできる。

- リポジトリの Actions secrets に `NOTION_TOKEN`・`NOTION_DATA_SOURCE_ID`・`NOTION_HABIT_DATA_SOURCE_ID` を登録する。テンプレート ID は秘密ではないため workflow ファイルに直接定義している
- `concurrency` で同時実行を防ぎ、同じ日の Daily・習慣ページを二重に作らない
- GitHub Actions の schedule トリガーは数時間遅れることがあり、取りこぼされることもある（2026-09-21〜11-10 の実績で 1.7〜6.8 時間）。処理は実行時刻の JST 日付を基準にするため、遅延しても翌日分を誤って作らない
- 実行結果は各 run のログで確認する。処理の末尾に Daily と習慣の作成・リネーム・ロックの件数を出力する

## 動作確認

```sh
npm run typecheck
npm test
```

- ドメインのテストは規則（今日の分はロックしない、日付はタイトルから決める、など）を直接検証する
- `application/run-maintenance.test.ts` はインメモリのリポジトリで、1 回の実行で今日の Daily と習慣ページを作り、過去日の Daily をロックすること、再実行で作成もロックも重ねないことを検証する

## コード構成

DDD の層で分けている。依存は `application → domain`、`infrastructure → domain / application(ポート)` の一方向で、`domain/` は外部に依存しない。

```
src/
  main.ts            エントリポイント（npm run maintain）。「今日」を JST で 1 回だけ決める
  config.ts          合成ルート。環境変数を読み、infrastructure の実装を Dependencies（リポジトリ）へ組み立てる
  domain/            ドメイン層。純粋関数とエンティティだけを置く
    page.ts          ページへの操作（リネーム・ロック）の定数
    daily.ts         DailyPage エンティティ（fromRecord で生成。期待タイトル・終了判定・操作の決定）とタイトル規則
    habit.ts         HabitPage エンティティ（タイトルから日付を決める）と、今日の分を作るかの判定
    jst.ts           JST の暦日（Temporal.PlainDate）への変換
    diary-repository.ts     DiaryRepository インターフェース（Daily の一覧、作成、リネーム、ロック）
    habit-repository.ts     HabitRepository インターフェース（一覧と作成だけ）
    testing.ts              ドメインのテスト用。エンティティの生成規則を通すファクトリ関数
  application/       アプリケーション層。ユースケースの流れと IO の順序だけを持つ
    run-maintenance.ts      1 実行の流れ（Daily → 習慣）
    maintain-dailies.ts     Daily を最新状態にする（今日を作成 → 過去日をロック）
    maintain-habits.ts      習慣を最新状態にする（今日を作成）
    page-actions.ts         リネーム / ロックの計画（データ）と適用、件数の導出
    testing.ts              ユースケースのテスト用。呼び出しを記録するインメモリのリポジトリ
  infrastructure/    外部システムの実装
    notion/
      diary-repository.ts   DiaryRepository の Notion SDK 実装。Daily の取得、テンプレートからの作成、レート制限の待機をここで吸収
      habit-repository.ts   HabitRepository の Notion SDK 実装。全行の取得と、テンプレートなしの作成
      page-mapping.ts       行 → DailyPage / HabitPage の写像（type select の選択肢名もここ）
      pacing.ts
  shared/            層に属さない小さな部品
    sequence.ts      mapSequentially（順序依存の IO を可変変数なしに直列適用）と countBy
    lazy.ts          初回だけ計算するメモ化。本番コードで唯一の可変変数をここに閉じる
```

日誌のリポジトリ（`DiaryRepository`）と習慣のリポジトリ（`HabitRepository`）は、別のデータベースなので分けている。

## 日付の扱い

- 日付は `Temporal.PlainDate`（暦日）で扱い、実行開始時に「今日」を JST で 1 回だけ決めて全処理へ渡す
- Notion の `created_time` は UTC の瞬間なので、JST の暦日へ落としてから使う
- Node 24 には Temporal が無いため `temporal-polyfill` を使う。Node 26（Temporal 標準搭載）が 2026 年 10 月に LTS になったら、`.node-version` と workflow を 26 に上げ、`temporal-polyfill` の import と依存を外す

## レート制限

Notion API の平均 3 req/s 制限に合わせ、書き込みの後に 350ms の間隔を空ける（`infrastructure/notion/pacing.ts`）。429 と 5xx は `@notionhq/client` が自動で再試行する。
