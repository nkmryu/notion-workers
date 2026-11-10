import { describe, expect, it } from "vitest";

import { buildRefsSection, collectRefs, selectRefTitle } from "./refs";

describe("collectRefs", () => {
  it("本文のリンクを初出順で重複なく集める", () => {
    // ネストした行や 1 行に複数あるリンクも含め、文書内の初出順で完全一致の重複なく返すことを保証する。
    const markdown = [
      "[first](https://example.com/first)",
      "[https://example.com/bookmark](https://example.com/bookmark)",
      "- toggle",
      "\t[first again](https://example.com/first)",
      "[second](https://example.com/second) と [third](https://example.com/third)",
    ].join("\n");

    expect(collectRefs(markdown)).toEqual([
      { url: "https://example.com/first", anchorTitle: "first" },
      { url: "https://example.com/bookmark", anchorTitle: null },
      { url: "https://example.com/second", anchorTitle: "second" },
      { url: "https://example.com/third", anchorTitle: "third" },
    ]);
  });

  it("コードブロック内のURLと自動リンク記法は集めない", () => {
    // コード例や設定サンプルに書かれたURLを参照として扱わないことを保証する。
    const markdown = [
      "```yaml",
      "url: <https://example.com/config>",
      "[link](https://example.com/in-code)",
      "```",
      "本文中の <https://example.com/literal> は文字列",
      "[article](https://example.com/article)",
    ].join("\n");

    expect(collectRefs(markdown)).toEqual([
      { url: "https://example.com/article", anchorTitle: "article" },
    ]);
  });

  it("画像・日誌の内部リンク・相対リンクを除外する", () => {
    // メディアや Notion 内部への遷移を Refs へ混入させないことを保証する。
    const markdown = [
      "![](https://cdn.example.com/image.png)",
      "[notion](https://www.notion.so/workspace/page)",
      "[app](https://app.notion.com/page)",
      "[relative](/relative)",
      "[source](https://example.com/source)",
    ].join("\n");

    expect(collectRefs(markdown)).toEqual([
      { url: "https://example.com/source", anchorTitle: "source" },
    ]);
  });

  it("URL文字列と同じアンカーテキストはタイトルとして採用しない", () => {
    // URLそのものを表示するリンクだけならHTTPタイトル解決へ進めることを保証する。
    const url = "https://example.com/article";

    expect(collectRefs(`[  ${url}  ](${url})`)).toEqual([
      { url, anchorTitle: null },
    ]);
  });

  it("アンカーテキストのMarkdownエスケープを外す", () => {
    // Notionが "\\|" のように返すエスケープをタイトルへ残さないことを保証する。
    expect(
      collectRefs(
        "[AWS IAM編 \\| DevelopersIO](https://example.com/iam)",
      ),
    ).toEqual([{ url: "https://example.com/iam", anchorTitle: "AWS IAM編 | DevelopersIO" }]);
  });

  it("同一URLの複数アンカーでは初出のテキストを採用する", () => {
    // 重複URLの後続アンカーが初出タイトルを上書きしないことを保証する。
    const url = "https://example.com/article";

    expect(
      collectRefs(`[最初の記事名](${url})\n[後続の記事名](${url})`),
    ).toEqual([{ url, anchorTitle: "最初の記事名" }]);
  });

  it("URL表示の初出後に現れる最初の本文アンカーを採用する", () => {
    // タイトルを持たない初出URLが後続の最初のアンカーテキストを妨げないことを保証する。
    const url = "https://example.com/article";

    expect(collectRefs(`[${url}](${url})\n[記事タイトル](${url})`)).toEqual(
      [{ url, anchorTitle: "記事タイトル" }],
    );
  });

  it("対象URLが無ければ空配列を返す", () => {
    // URLが0件の月ではRefsセクションを作らない判定に使えることを保証する。
    expect(collectRefs("本文だけ\n<empty-block/>")).toEqual([]);
  });
});

describe("buildRefsSection", () => {
  it("divider・Refs見出し・リンク付きbulletのMarkdownを構築する", () => {
    // Refsセクションが転記と同じ見出し規則のMarkdownになることを保証する。
    expect(
      buildRefsSection([
        { url: "https://example.com/article", title: "記事タイトル" },
        { url: "https://example.com/plain", title: "https://example.com/plain" },
      ]),
    ).toBe(
      [
        "---",
        "## Refs",
        "- [記事タイトル](https://example.com/article)",
        "- [https://example.com/plain](https://example.com/plain)",
        "",
      ].join("\n"),
    );
  });

  it("タイトル中のMarkdown記号をエスケープする", () => {
    // 記事タイトルの記号がリンク構文や装飾として解釈されないことを保証する。
    expect(
      buildRefsSection([{ url: "https://example.com/a", title: "a [b] *c* | d" }]),
    ).toBe("---\n## Refs\n- [a \\[b\\] \\*c\\* \\| d](https://example.com/a)\n");
  });

  it("URLが0件ならセクションを構築しない", () => {
    // 参照が無い月に空のRefs見出しを追記しないことを保証する。
    expect(buildRefsSection([])).toBe("");
  });
});

describe("selectRefTitle", () => {
  const url = "https://example.com/article";

  it("本文アンカーテキストをHTTP取得タイトルより優先する", () => {
    // 本文で付けた名称が取得先ページのタイトルより優先されることを保証する。
    expect(
      selectRefTitle(
        { url, anchorTitle: "本文の記事名" },
        "HTTPの記事名",
      ),
    ).toEqual({ url, title: "本文の記事名", source: "anchor" });
  });

  it("アンカーが無ければリンク先ページのタイトルを使う", () => {
    // HTTPから抽出できた記事名をリンクテキストにすることを保証する。
    expect(selectRefTitle({ url, anchorTitle: null }, "HTTPの記事名"))
      .toEqual({ url, title: "HTTPの記事名", source: "linked_page" });
  });

  it("タイトル解決に失敗した場合はURL文字列へフォールバックする", () => {
    // 取得失敗があってもURL表示でRefsを生成できることを保証する。
    expect(selectRefTitle({ url, anchorTitle: null }, null)).toEqual({
      url,
      title: url,
      source: "url",
    });
  });
});
