# Notion Workers

Notion の日誌データベースを定期的に整える GitHub Actions ジョブと、そのローカル CLI です。Notion API へは `@notionhq/client` でアクセスします。

## 定期処理の内容

`npm run maintain`（`src/maintain.ts`）を 1 回実行すると、次の順に処理します。

1. 今日のページが無ければ作成し、タイトルを `26.07.22（水）` 形式にします。過去日の未ロック Daily はロックします。
2. 終了した ISO 週（今週より前）に日次ページがあり週次ページが無ければ、古い週から順にすべて作成し、タイトルを `26.W30` 形式にします。進行中の週には作りません。
3. 終了した暦月（今月より前）に日次ページがあり月次ページが無ければ、古い月から順にすべて作成し、タイトルを `26.M07` 形式にします。進行中の月には作りません。
4. 終了した日次ページの本文は、同じ ISO 週の未ロック週次ページへ日付見出し付きで転記します。週次ページは週が変わった最初の実行で作成されるため、その実行で前週 7 日分の転記とロックまで一度に進みます。
5. 同じ本文を同じ暦月の未ロック月次ページにも転記します。月次ページは月が変わった最初の実行で作成されるため、その実行で前月全日の転記・Refs 生成・ロックまで一度に進みます。
6. 過去月の Monthly は、ロック直前に本文中の外部 URL を `Refs` セクションへ初出順でまとめます。`Refs` が無いままロック済みの過去月も同じ規則で補完します。本文のリンク、bookmark、embed を対象とし、画像・動画などのメディア、Notion 内部リンク、mention、コードブロック内の URL は含めません。bullet には本文のアンカーテキストを使い、無ければリンク先の `og:title` または HTML の `title` を取得します。取得できない場合は URL を表示します。対象 URL が無い月にはセクションを作りません。

転記は日付昇順で、保留分をすべて処理します。過去の週次・月次ページは、その期間にある終了済み日次ページの見出しがすべて揃った場合だけロックします。

すべての処理は冪等です。今日の Daily は日付、Weekly / Monthly は週・月、転記は転記先の日付見出し、Refs は `Refs` 見出し、ロックは `is_locked` を冪等キーにするため、途中で失敗しても次の実行が未完了分だけを処理します。1 実行あたりの件数上限は設けていません。

転記は Notion の Markdown API で行います。Daily を `pages.retrieveMarkdown` で拡張 Markdown として読み、`---` と `## 26.07.20（月）` の見出しを付けて `pages.updateMarkdown`（`insert_content`, 末尾）で転記先へ追記します。転記済みかどうかは、転記先 Markdown の最上位 `## ` 見出しと日次ページの期待タイトルが一致するかで判定します。週次と月次の判定は独立しています。同じ日付の Daily が複数ある場合は、1つの日付見出しの下へ `created_time` 順に全ページの本文を転記します。

Markdown への変換で失われるものは次のように扱います。

- Notion がホストする画像・ファイル（署名付き URL で失効する）: 「元ページを参照」の案内文と元 Daily への mention に置換
- プレビュー展開済みの bookmark / link_preview（Markdown では自ブロックへのリンクになり外部 URL を失う）: ブロック API で URL を引き直し、`[URL](URL)` のリンクに置換
- それ以外の Markdown 化できないブロック: URL があればリンク、無ければ案内文に置換
- 転記先が書式検証エラー（`validation_error`）を返した日: 見出しと「元ページを参照」の注記だけを追記し、次回以降は転記済みとして扱う

## ページ分類

`type` select が `Weekly` のページを Weekly、`Monthly` のページを Monthly として扱います。Weekly、Monthly の順に優先して判定します。それ以外では、タイトルが `26.07.22（水）` 形式のページだけを Daily とし、作成日ではなくタイトルの日付をリネーム・ロック・定期ページ作成・転記の基準にします。曜日文字は日付の同定には使いません。

空でない非日付タイトルはメモとして扱い、リネーム・ロック・定期ページ作成・転記から除外します。メモは自動でロックしません。Weekly と Monthly も Daily の全処理から除外します。テンプレート適用中のページに限り、今日作成された空タイトルを今日の Daily 候補として扱います。

## セットアップ

Node.js を用意し、依存パッケージをインストールします。

```sh
npm install
```

`.env.example` を `.env` へコピーし、Notion Integration のトークンを `NOTION_TOKEN` に設定します。対象の日誌データベースには、Integration からのアクセス権を付与してください。
Notion 側の繰り返しテンプレート設定はオフにしてください。ページ作成に使う日誌・週次・月次テンプレートの ID は `NOTION_TEMPLATE_ID`、`NOTION_WEEKLY_TEMPLATE_ID`、`NOTION_MONTHLY_TEMPLATE_ID` に設定します。
週次テンプレートは、`type` という名前の select プロパティへ `Weekly` を設定する必要があります。
月次テンプレートは、同じ select プロパティへ `Monthly` を設定する必要があります。

| 環境変数 | 内容 |
|---|---|
| `NOTION_TOKEN` | Notion Integration のトークン（秘密） |
| `NOTION_DATA_SOURCE_ID` | 日誌データベースの data source ID（秘密として扱う）。`GET /v1/databases/{database_id}` の `data_sources[0].id` を一度だけ取得して保存する（Notion の 2025-09-03 移行ガイドが推奨する discovery step） |
| `NOTION_TEMPLATE_ID` | 日次テンプレートのページ ID |
| `NOTION_WEEKLY_TEMPLATE_ID` | 週次テンプレートのページ ID |
| `NOTION_MONTHLY_TEMPLATE_ID` | 月次テンプレートのページ ID |

## 定期実行（GitHub Actions）

`.github/workflows/maintain.yml` が JST 0:05 と 7:00（UTC `5 15 * * *` と `0 22 * * *`）に `npm run maintain` を実行します。`workflow_dispatch` で手動実行もできます。`concurrency` で同時実行を防ぎ、同じ週・月のページを二重に作らないようにしています。

リポジトリの Actions secrets に `NOTION_TOKEN` と `NOTION_DATA_SOURCE_ID` を登録してください。テンプレート ID は秘密ではないため、workflow ファイルに直接書いています。

GitHub Actions の schedule は数分から数十分遅れることがあります。処理は実行時刻の JST 日付を基準にするため、遅延しても翌日分を誤って作ることはありません。

## ローカル実行

定期処理を手元で 1 回だけ実行します。

```sh
npm run maintain
```

## 動作確認

```sh
npm run typecheck
npm test
```

実行結果は GitHub Actions の各 run のログで確認します。処理の末尾に作成・転記・リネーム・ロックの件数を 1 行で出力します。

## レート制限

Notion API の平均 3 req/s 制限に合わせ、書き込みは 350ms、読み取りは 150ms の間隔を空けます。429 と 5xx は `@notionhq/client` が自動で再試行します。
