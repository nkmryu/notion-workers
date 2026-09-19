# Notion Workers

Notion の日誌データベースを毎日整える GitHub Actions ジョブと、そのローカル CLI。Daily の作成とロック、Weekly / Monthly の作成と転記、Monthly の Refs 生成を 1 回の実行で行う。Notion API へは `@notionhq/client` でアクセスする。

## まず動かす

```sh
npm install                 # Node.js 24（.node-version）
cp .env.example .env        # NOTION_TOKEN と NOTION_DATA_SOURCE_ID を記入する（テンプレート ID は記入済み）
npm run maintain            # 定期処理を手元で 1 回だけ実行する
```

環境変数の詳細は [セットアップ](#セットアップ) にある。

## 1 回の実行で何が起きるか

`npm run maintain`（`src/main.ts`）は Daily → Weekly → Monthly の順に、種別ごとに完結して処理する。Weekly / Monthly の段階は自分の種別のページ一覧と Daily 一覧だけを受け取る。

| 段階 | すること |
|---|---|
| 1. Daily | 今日のページが無ければ作り、タイトルを `26.07.22（水）` に整える。終了した Daily のうち未ロックのものをロックする |
| 2. Weekly | 作成 → 転記 → リネーム → ロック |
| 3. Monthly | 作成 → 転記 → Refs → リネーム → ロック |

「終了した Daily」は今日より前の日付の Daily を指す。今日の分は書きかけとみなし、転記もロックもしない。

Weekly / Monthly の各操作は次のとおり。

| 操作 | すること |
|---|---|
| 作成 | 終了した ISO 週（今週より前）/ 暦月（今月より前）に Daily があり、対応する Weekly / Monthly が無ければ、古い順にすべて作る。進行中の週・月には作らない |
| 転記 | 終了した Daily の本文を、同じ ISO 週の未ロック Weekly と同じ暦月の未ロック Monthly へ `## 26.07.20（月）` の見出し付きで追記する |
| Refs | Monthly だけ。ロック直前に本文中の外部 URL を `## Refs` セクションへ初出順でまとめる。`Refs` が無いままロック済みの過去月も同じ規則で補完する |
| リネーム | テンプレートから作った直後はタイトルが未確定なので、`26.W30` / `26.M07` へ整える |
| ロック | 過去の週・月のページは、その期間の終了した Daily の見出しがすべて揃ったときだけ `is_locked` を立てる |

Weekly / Monthly は週・月が変わった最初の実行で作られる。その実行で前週・前月の全 Daily の転記、Refs 生成、リネーム、ロックまで一度に進む。

### 冪等性

すべての処理は冪等で、途中で失敗しても次回の実行で未完了分のみを処理する。1 実行あたりの件数上限は設けていない。

| 処理 | 冪等キー |
|---|---|
| 今日の Daily 作成 | 日付 |
| Weekly / Monthly 作成 | 週・月 |
| 転記 | 転記先の日付見出し（週次と月次で独立に判定） |
| Refs | `Refs` 見出し |
| ロック | `is_locked` |

## 転記の規則

Notion の Markdown API で行う。

1. Daily を `pages.retrieveMarkdown` で拡張 Markdown として読む
2. `---` と `## 26.07.20（月）` の見出しを付け、`pages.updateMarkdown`（`insert_content`, 末尾）で転記先へ追記する
3. 転記済みかどうかは、転記先 Markdown の `## ` 見出し（子ブロック内のインデントされた見出しは除く）に Daily の期待タイトルがあるかで判定する
4. 日付昇順で、保留分をすべて処理する
5. 同じ日付の Daily が複数ある場合は、1 つの日付見出しの下へ `created_time` 順に全ページの本文を転記する

### Markdown 化で失われるものの扱い

置換は `infrastructure/notion` が `getPageMarkdown` の内側で行い、ドメインは正規化済みの Markdown だけを扱う。

| 対象 | 置換 |
|---|---|
| Notion がホストする画像・ファイル（署名付き URL で失効する） | 「元ページを参照」の案内文と元 Daily への mention |
| プレビュー展開済みの bookmark / link_preview（Markdown では自ブロックへのリンクになり外部 URL を失う） | ブロック API で URL を引き直し `[URL](URL)` |
| embed | `[URL](URL)`（Refs で参照先を拾えるようにする） |
| それ以外の Markdown 化できないブロック | URL があればリンク、無ければ案内文 |
| 転記先が書式検証エラー（`validation_error`）を返した日 | 見出しと「元ページを参照」の注記だけを追記し、次回以降は転記済みとして扱う |

### Refs の規則

- 対象: 本文のリンク、bookmark、embed
- 除外: 画像・動画などのメディア、Notion 内部リンク、mention、コードブロック内の URL
- 箇条書きのテキスト: 本文のアンカーテキスト → リンク先の `og:title` → HTML の `title` → URL の順で最初に取得できたもの
- 対象 URL が無い月にはセクションを作らない

## ページ種別

種別は `type` select で決まる。`📝 Daily` / `Weekly` / `Monthly` を種別ごとに取得し、それ以外の値や未設定のページ（メモ）はどの処理にも含めない。メモは自動でロックしない。

- Daily の日付はタイトル `26.07.22（水）` から決める（曜日文字は使わない）。テンプレート適用中で空タイトルなら作成日（JST）を使う。日付でも空でもないタイトルの Daily は不整合として実行を止める
- Weekly / Monthly の期間はタイトル `26.W30` / `26.M07` から決める。作成直後などで読めなければ作成日の期間とし、リネームで正しいタイトルに整える

## セットアップ

1. Node.js 24（`.node-version`）を用意し `npm install` を実行する
2. Notion Integration を作り、日誌データベースと 3 種類のテンプレートへアクセス権を付与する
3. Notion 側の繰り返しテンプレート設定をオフにする
4. `type` select を日次テンプレートに `📝 Daily`、週次テンプレートに `Weekly`、月次テンプレートに `Monthly` と設定する（種別はテンプレートが付ける）
5. `.env.example` を `.env` へコピーし、次の環境変数を記入する

| 環境変数 | 内容 |
|---|---|
| `NOTION_TOKEN` | Notion Integration のトークン（秘密） |
| `NOTION_DATA_SOURCE_ID` | 日誌データベースの data source ID（秘密）。database ID ではない。データベース URL の ID を `database_id` として `GET /v1/databases/{database_id}` を呼び、`data_sources[0].id` を取得して保存する（Notion の 2025-09-03 移行ガイドが推奨する discovery step） |
| `NOTION_TEMPLATE_ID` | 日次テンプレートのページ ID |
| `NOTION_WEEKLY_TEMPLATE_ID` | 週次テンプレートのページ ID |
| `NOTION_MONTHLY_TEMPLATE_ID` | 月次テンプレートのページ ID |

## 定期実行（GitHub Actions）

`.github/workflows/maintain.yml` が JST 2:00 と 7:00（UTC `0 17 * * *` と `0 22 * * *`）に `npm run maintain` を実行する。2:00 が本番で、7:00 は 2:00 が失敗したときの再試行（冪等なので成功時は何もしない）。`workflow_dispatch` で手動実行もできる。

- リポジトリの Actions secrets に `NOTION_TOKEN` と `NOTION_DATA_SOURCE_ID` を登録する。テンプレート ID は秘密ではないため workflow ファイルに直接定義している
- `concurrency` で同時実行を防ぎ、同じ週・月のページを二重に作らない
- GitHub Actions の schedule トリガーは数分から数十分遅れることがある。処理は実行時刻の JST 日付を基準にするため、遅延しても翌日分を誤って作らない
- 実行結果は各 run のログで確認する。処理の末尾に作成・転記・リネーム・ロックの件数を 1 行で出力する

## 動作確認

```sh
npm run typecheck
npm test
```

- ドメインのテストは不変条件（転記が揃うまでロックしない、Refs は一度だけ、など）を直接検証する
- `application/run-maintenance.test.ts` はインメモリのリポジトリで、月初・週初の実行が「作成 → 転記 → Refs → リネーム → ロック」の順に 1 回の実行で進むこと、Refs の追記に失敗したらロックしないことを呼び出し順で検証する

## コード構成

DDD の層で分けている。依存は `application → domain`、`infrastructure → domain / application(ポート)` の一方向で、`domain/` は外部に依存しない。

```
src/
  main.ts            エントリポイント（npm run maintain）。「今日」を JST で 1 回だけ決める
  config.ts          合成ルート。環境変数を読み、infrastructure の実装を Dependencies（リポジトリ / ポート）へ組み立てる
  domain/            ドメイン層。純粋関数とエンティティだけを置く
    page.ts          種別・アクションの定数
    daily.ts         DailyPage エンティティ（fromRecord で生成。期待タイトル・終了判定・操作の決定）とタイトル規則
    period.ts        PeriodPage（自分の期間規則を持つ）と、転記状態を知った PeriodArchive（転記完了とロックの不変条件を守る）、作成計画
    weekly.ts, monthly.ts   ISO 週 / 暦月の規則（PeriodDefinition）とタイトル
    jst.ts           JST の暦日（Temporal.PlainDate）への変換
    transfer.ts      転記計画（どの Daily をどの期間ページへ）と、見出しからの転記状態の導出
    transfer-markdown.ts    転記セクション（見出し + 本文、省略時の注記）の組み立て
    refs.ts          Refs の収集（本文のリンクのうち内部リンクを除く）・タイトルの優先順位・セクション組み立て・生成判定
    markdown-section.ts     転記と Refs が共有するセクション（divider + 見出し 2）の規則
    diary-repository.ts     DiaryRepository インターフェース（種別ごとの一覧、作成、リネーム、ロック、本文の読み書き）と ContentRejectedError
    testing.ts              ドメインのテスト用。エンティティの生成規則を通すファクトリ関数
  application/       アプリケーション層。ユースケースの流れと IO の順序だけを持つ
    run-maintenance.ts      1 実行の流れ（Daily → Weekly → Monthly）
    maintain-dailies.ts     Daily を最新状態にする（今日を作成 → 過去日をロック）
    maintain-period.ts      期間ページの準備（作成 → 転記状態の読み取り → 転記）と確定（リネーム・ロック）
    transfer-dailies.ts     終了した Daily の転記
    generate-refs.ts        Monthly の Refs 生成。run-maintenance が準備と確定の間に挟む
    page-actions.ts         リネーム / ロックの計画（データ）と適用、件数の導出
    testing.ts              ユースケースのテスト用。呼び出しを記録するインメモリのリポジトリ
    web-page-title-lookup.ts   WebPageTitleLookup ポート（URL → リンク先ページのタイトル | null）
  infrastructure/    外部システムの実装
    notion/
      diary-repository.ts   DiaryRepository の Notion SDK 実装。種別ごとの取得、テンプレートからの作成、レート制限の待機、bookmark の外部 URL 復元、書式拒否の変換をここで吸収
      page-mapping.ts       行 → DailyPage / WeeklyPage / MonthlyPage の写像（type select の選択肢名もここ）
      markdown-normalization.ts   Markdown API の方言（<unknown/>・<embed>・署名付き URL・自ブロックへのリンク）をドメインが読める Markdown へ正規化
      pacing.ts, error.ts
    web/
      page-title.ts         HTML からのタイトル抽出（og:title → <title>）
      page-title-lookup.ts  WebPageTitleLookup の fetch 実装。タイムアウト・64KB 制限・失敗は null
  shared/            層に属さない小さな部品
    sequence.ts      mapSequentially（順序依存の IO を可変変数なしに直列適用）と countBy
    lazy.ts          初回だけ計算するメモ化。本番コードで唯一の可変変数をここに閉じる
```

リポジトリは 1 つ（`DiaryRepository`）で、Daily / Weekly / Monthly の一覧をそれぞれ返す。3 種は同じ Notion データベースの行で、リネーム・ロック・本文の読み書きも共通なので、集約ごとに分けていない。

## 日付の扱い

- 日付は `Temporal.PlainDate`（暦日）で扱い、実行開始時に「今日」を JST で 1 回だけ決めて全処理へ渡す
- Notion の `created_time` は UTC の瞬間なので、JST の暦日へ落としてから使う
- ISO 週は `PlainDate.weekOfYear` / `yearOfWeek`、月は `PlainYearMonth`
- Node 24 には Temporal が無いため `temporal-polyfill` を使う。Node 26（Temporal 標準搭載）が 2026 年 10 月に LTS になったら、`.node-version` と workflow を 26 に上げ、`temporal-polyfill` の import と依存を外す

## レート制限

Notion API の平均 3 req/s 制限に合わせ、書き込みは 350ms、読み取りは 150ms の間隔を空ける（`infrastructure/notion/pacing.ts`）。429 と 5xx は `@notionhq/client` が自動で再試行する。
