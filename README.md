# Notion Workers

Notion の日誌データベース（「ナレッジ」）と習慣データベース（「習慣」）を毎日整える GitHub Actions ジョブと、そのローカル CLI。Daily の作成とロック、習慣ページの作成、週・月のまとめ（転記と Refs）を 1 回の実行で行う。Notion API へは `@notionhq/client` でアクセスする。

## まず動かす

```sh
npm install                 # Node.js 24（.node-version）
cp .env.example .env        # NOTION_TOKEN・NOTION_DATA_SOURCE_ID・NOTION_HABIT_DATA_SOURCE_ID を記入する（テンプレート ID は記入済み）
npm run maintain            # 定期処理を手元で 1 回だけ実行する
```

環境変数の詳細は [セットアップ](#セットアップ) にある。

## 1 回の実行で何が起きるか

`npm run maintain`（`src/main.ts`）は Daily → 習慣 → まとめの順に処理する。習慣は別のデータベースで、Daily とページを共有しない。

| 段階 | すること |
|---|---|
| 1. Daily | 今日のページと、終わった週・月の締めの日のページが無ければ、タイトル `26.07.22（水）` と `date` を入れて作る。今日のページのタイトルを整える。終了した Daily のうち未ロックのものをロックする。ただし、まとめを書き終えていない締めの日の Daily はロックしない |
| 2. 習慣 | 今日のページが無ければ、タイトル `26.07.22（水）` だけの空のページを作る。過去日のページには触れない |
| 3. まとめ | 終わった週・月のうち、締めの日の Daily が未ロックのものへ、まとめ（転記と、月は Refs）を書く。期間の全日を転記し終えたら、締めの日の Daily をロックする |

「終了した Daily」は今日より前の日付の Daily を指す。今日の分は書きかけとみなし、転記もロックもしない。

習慣はまとめより前に処理する。まとめの段階が失敗した実行でも、今日の習慣ページは作られている。

### 冪等性

すべての処理は冪等で、途中で失敗しても次回の実行で未完了分のみを処理する。1 実行あたりの件数上限は設けていない。

| 処理 | 冪等キー |
|---|---|
| 今日の Daily・締めの日の Daily の作成 | 日付 |
| 今日の習慣ページ作成 | 日付 |
| まとめの見出し | 締めの日の Daily にある `# 26.W46` / `# 26.M11` |
| 転記 | まとめの見出しより後ろの日付見出し |
| Refs | まとめの見出しより後ろの `Refs` 見出し |
| ロック | `is_locked`。締めの日の Daily のロックは「まとめを書き終えた」印も兼ねる |

## 週・月のまとめ

週・月を見るページは作らない。全体は日誌データベースのカレンダービュー（`date` プロパティ、月表示）で見る。週・月の本文をまとめて読むためのまとめは、その期間の最後の日（締めの日）の Daily の末尾に書く。

| 期間 | 締めの日 | まとめの見出し | 中身 |
|---|---|---|---|
| 週（ISO 週、月〜日） | 日曜 | `# 26.W46` | 月〜土の Daily の転記 |
| 月（暦月） | 月末 | `# 26.M11` | 1 日〜前日の Daily の転記と Refs |

- まとめは締めの日が終わった翌日の実行で、その日の本文の後ろに `---` とまとめの見出しを置き、その下へ書く。締めの日の Daily 自身の本文は写さない
- 日曜が月末と重なる日は、月のまとめだけを書く。その週の月〜土は必ず同じ月に入るので、月のまとめに含まれる
- 締めの日に Daily が無い期間は、締めの日の Daily をその日付で作ってから書く。作るのは、締めの日でない日の Daily がある期間だけにする。作る Daily は日曜か月末なので、作った月末の Daily が週を、作った日曜の Daily が月を生んで、締めの日を作り続ける連鎖を起こさない
- まとめの見出しは旧 Weekly / Monthly のページタイトルと同じ形なので、Notion で `26.W46` を検索すると置き場の Daily に辿れる
- 締めの日の Daily はまとめを書き終えてからロックする。ロック済みの締めの日は書き終えたものとみなし、毎回の実行で読み直さない。締めの日が終わる前に手でロックすると、まとめは書かれない

経緯: 日付は 1 日ごとに決まる絶対的な値で、「週末」「月末」は周りの日との関係で決まる相対的な値である。以前は Weekly / Monthly のページを作って Daily の本文を転記しており、週と月が同時に変わる日の実行では Daily・Weekly・Monthly の 3 ページが一度に増えた。2026-11-10 に Weekly / Monthly のページをやめ、同じ役割（転記と Refs）を締めの日の Daily へ移した。同じ日に、Daily のある 2024-01 以降の 154 期間（週 123・月 31）へさかのぼってまとめを書いた。締めの日の Daily が無かった 29 期間は、その日付の Daily を作った。

### date の扱い

- カレンダーは `date` で日を決め、コードはタイトルで日を決める。両者がずれないよう、コードは Daily を作るときにタイトルと同じ日付を `date` に書く（2026-11-10 時点で既存の Daily 791 件はすべて一致）
- `date` はテンプレートの「今日」に任せない。テンプレートの設定は API から読めないため。作成のリクエストで渡した `date` は、テンプレートの適用後も上書きされない（2026-11-10 に実測）
- コードが書くのは作成するときだけ。Notion で手で作った Daily の `date` は、テンプレートと手入力のとおりになる

## 転記の規則

Notion の Markdown API で行う。

1. 転記元の Daily を `pages.retrieveMarkdown` で拡張 Markdown として読む
2. `---` と `## 26.07.20（月）` の見出しを付け、`pages.updateMarkdown`（`insert_content`, 末尾）で締めの日の Daily へ追記する
3. 転記済みかどうかは、締めの日の Daily のまとめの見出しより後ろにある `## ` 見出し（子ブロック内のインデントされた見出しは除く）に、Daily の期待タイトルがあるかで判定する。その日自身の本文の見出しは判定に使わない
4. 日付昇順で、保留分をすべて処理する
5. 同じ日付の Daily が複数ある場合は、1 つの日付見出しの下へ `created_time` 順に全ページの本文を転記する。締めの日に複数ある場合は、最初に作られたページを置き場にし、残りを転記する
6. 転記元が締めの日の Daily（週の途中の月末、月の途中の日曜）なら、そのページのまとめの見出しより前だけを写す。まとめごと写すと、過去のまとめが入れ子で重なる

### Markdown 化で失われるものの扱い

置換は `infrastructure/notion` が `getPageMarkdown` の内側で行い、ドメインは正規化済みの Markdown だけを扱う。

| 対象 | 置換 |
|---|---|
| Notion がホストする画像・ファイル（署名付き URL で失効する） | 「元ページを参照」の案内文と元 Daily への mention |
| プレビュー展開済みの bookmark / link_preview（Markdown では自ブロックへのリンクになり外部 URL を失う） | ブロック API で URL を引き直し `[URL](URL)` |
| embed | `[URL](URL)`（Refs で参照先を拾えるようにする） |
| それ以外の Markdown 化できないブロック | URL があればリンク、無ければ案内文 |
| 転記先が書式検証エラー（`validation_error`）か、本文が大きすぎる（413）を返した日 | 見出しと「元ページを参照」の注記だけを追記し、次回以降は転記済みとして扱う |

### Refs の規則

- 月のまとめだけに、転記の後で一度だけ書く。月末の Daily 全体（その日の本文と転記した本文）から集める
- 対象: 本文のリンク、bookmark、embed
- 除外: 画像・動画などのメディア、Notion 内部リンク、mention、コードブロック内の URL
- 並び: 初出順。同じ URL は 1 つにまとめる
- 箇条書きのテキスト: 本文のアンカーテキスト → リンク先の `og:title` → HTML の `title` → URL の順で最初に取得できたもの
- 対象 URL が無い月にはセクションを作らない

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
4. 日次テンプレートの `type` select を `📝 Daily` にする（種別はテンプレートが付け、`date` はコードが書く）
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
- `concurrency` で同時実行を防ぎ、同じ日の Daily・習慣ページを二重に作らず、同じまとめを二重に書かない。手元の `npm run maintain` はこの制御の外にあるので、定期実行の時刻と重ねない
- GitHub Actions の schedule トリガーは数時間遅れることがあり、取りこぼされることもある（2026-09-21〜11-10 の実績で 1.7〜6.8 時間）。処理は実行時刻の JST 日付を基準にするため、遅延しても翌日分を誤って作らない
- 実行結果は各 run のログで確認する。処理の末尾に Daily・習慣・まとめの件数を出力する

## 動作確認

```sh
npm run typecheck
npm test
```

- ドメインのテストは規則（今日の分はロックしない、締めの日は日曜・月末、転記が揃うまで締めの日をロックしない、Refs は一度だけ、など）を直接検証する
- `application/run-maintenance.test.ts` はインメモリのリポジトリで、週・月が変わった最初の実行が「転記 → Refs → ロック」の順に 1 回で進むこと、締めの日の Daily が無ければ作ってから書くこと、日曜と月末が重なる日は月のまとめだけを書くこと、Refs の追記に失敗したらロックしないこと、その実行でも今日の習慣ページは作られていることを検証する

## コード構成

DDD の層で分けている。依存は `application → domain`、`infrastructure → domain / application(ポート)` の一方向で、`domain/` は外部に依存しない。

```
src/
  main.ts            エントリポイント（npm run maintain）。「今日」を JST で 1 回だけ決める
  config.ts          合成ルート。環境変数を読み、infrastructure の実装を Dependencies（リポジトリ / ポート）へ組み立てる
  domain/            ドメイン層。純粋関数とエンティティだけを置く
    page.ts          ページへの操作（リネーム・ロック）の定数
    daily.ts         DailyPage エンティティ（fromRecord で生成。期待タイトル・終了判定・操作の決定）とタイトル規則、並び順
    digest.ts        まとめの期間（DigestPeriod: 締めの日と見出し）、締めの日の Daily の決め方、まとめの状態と転記計画（DigestTarget）
    habit.ts         HabitPage エンティティ（タイトルから日付を決める）と、今日の分を作るかの判定
    jst.ts           JST の暦日（Temporal.PlainDate）への変換
    markdown-section.ts     まとめの見出しと、転記・Refs が共有するセクション（divider + 見出し 2）の規則
    transfer-markdown.ts    転記セクション（見出し + 本文、省略時の注記）の組み立て
    refs.ts          Refs の収集（本文のリンクのうち内部リンクを除く）・タイトルの優先順位・セクション組み立て
    diary-repository.ts     DiaryRepository インターフェース（Daily の一覧、作成、リネーム、ロック、本文の読み書き）と ContentRejectedError
    habit-repository.ts     HabitRepository インターフェース（一覧と作成だけ）
    testing.ts              ドメインのテスト用。エンティティの生成規則を通すファクトリ関数
  application/       アプリケーション層。ユースケースの流れと IO の順序だけを持つ
    run-maintenance.ts      1 実行の流れ（Daily → 習慣 → まとめ）
    maintain-dailies.ts     Daily を最新状態にする（締めの日と今日を作成 → 今日を整える → 過去日をロック）
    maintain-habits.ts      習慣を最新状態にする（今日を作成）
    write-digests.ts        まとめを書く（見出し → 転記 → Refs → 締めの日をロック）
    page-actions.ts         リネーム / ロックの計画（データ）と適用、件数の導出
    testing.ts              ユースケースのテスト用。呼び出しを記録するインメモリのリポジトリ
    web-page-title-lookup.ts   WebPageTitleLookup ポート（URL → リンク先ページのタイトル | null）
  infrastructure/    外部システムの実装
    notion/
      diary-repository.ts   DiaryRepository の Notion SDK 実装。Daily の取得、テンプレートからの作成（date も書く）、レート制限の待機、bookmark の外部 URL 復元、書式拒否の変換をここで吸収
      habit-repository.ts   HabitRepository の Notion SDK 実装。全行の取得と、テンプレートなしの作成
      page-mapping.ts       行 → DailyPage / HabitPage の写像と、送るタイトル・日付の値（type select の選択肢名と date のプロパティ名もここ）
      markdown-normalization.ts   Markdown API の方言（<unknown/>・<embed>・署名付き URL・自ブロックへのリンク）をドメインが読める Markdown へ正規化
      pacing.ts, error.ts
    web/
      page-title.ts         HTML からのタイトル抽出（og:title → <title>）
      page-title-lookup.ts  WebPageTitleLookup の fetch 実装。タイムアウト・64KB 制限・失敗は null
  shared/            層に属さない小さな部品
    sequence.ts      mapSequentially（順序依存の IO を可変変数なしに直列適用）と countBy
    lazy.ts          初回だけ計算するメモ化。本番コードで唯一の可変変数をここに閉じる
```

日誌のリポジトリ（`DiaryRepository`）と習慣のリポジトリ（`HabitRepository`）は、別のデータベースなので分けている。

## 日付の扱い

- 日付は `Temporal.PlainDate`（暦日）で扱い、実行開始時に「今日」を JST で 1 回だけ決めて全処理へ渡す
- Notion の `created_time` は UTC の瞬間なので、JST の暦日へ落としてから使う
- ISO 週の番号は `PlainDate.weekOfYear` / `yearOfWeek` で数える。年をまたぐ週は木曜が属する年で数える（2026-12-28〜2027-01-03 は `26.W53`）
- Node 24 には Temporal が無いため `temporal-polyfill` を使う。Node 26（Temporal 標準搭載）が 2026 年 10 月に LTS になったら、`.node-version` と workflow を 26 に上げ、`temporal-polyfill` の import と依存を外す

## レート制限

Notion API の平均 3 req/s 制限に合わせ、書き込みは 350ms、読み取りは 150ms の間隔を空ける（`infrastructure/notion/pacing.ts`）。429 と 5xx は `@notionhq/client` が自動で再試行する。
