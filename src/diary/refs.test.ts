import { describe, expect, it } from "vitest";

import {
  buildRefsSection,
  collectRefs,
  shouldGenerateRefs,
} from "./refs";

describe("collectRefs", () => {
  it("本文リンク・bookmark・embedのURLを初出順で重複なく集める", () => {
    // 対象3種のURLを文書内の初出順で完全一致の重複なく返すことを保証する。
    const markdown = [
      "[first](https://example.com/first)",
      '<unknown url="https://example.com/bookmark" alt="bookmark"/>',
      "- toggle",
      '\t<embed src="https://example.com/embed"></embed>',
      "\t[first again](https://example.com/first)",
      "[second](https://example.com/second) と [third](https://example.com/third)",
    ].join("\n");

    expect(collectRefs(markdown)).toEqual([
      { url: "https://example.com/first", anchorTitle: "first" },
      { url: "https://example.com/bookmark", anchorTitle: null },
      { url: "https://example.com/embed", anchorTitle: null },
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

  it("画像・署名付きファイル・Notion内部リンク・mentionを除外する", () => {
    // コピー元参照やNotion内部遷移をRefsへ混入させないことを保証する。
    const markdown = [
      "![](https://cdn.example.com/image.png)",
      '<video src="https://cdn.example.com/clip.mp4"></video>',
      "[document.pdf](https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/document.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc)",
      "[notion](https://www.notion.so/workspace/page)",
      "[app](https://app.notion.com/page)",
      '<mention-page url="https://app.notion.com/p/abc"/>',
      '<unknown url="https://app.notion.com/p/abc#def" alt="external_object_instance"/>',
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

describe("shouldGenerateRefs", () => {
  const pastMonthly = {
    createdTime: "2026-06-01T00:00:00.000Z",
    title: "26.M06",
    periodType: "monthly" as const,
    isLocked: false,
  };
  const now = new Date("2026-07-22T03:00:00.000Z");

  it("Refs見出しがあれば生成しない", () => {
    // 見出しを冪等キーとして重複生成を防ぐことを保証する。
    expect(
      shouldGenerateRefs(pastMonthly, ["Refs"], now, true),
    ).toBe(false);
  });

  it("未ロックの過去月はロック可能になった場合だけ生成する", () => {
    // 日次転記が完了する前にはRefsを確定せず、ロック直前だけ生成することを保証する。
    expect(
      shouldGenerateRefs(pastMonthly, [], now, false),
    ).toBe(false);
    expect(
      shouldGenerateRefs(pastMonthly, [], now, true),
    ).toBe(true);
  });

  it("今月のMonthlyは生成対象にしない", () => {
    // 進行中の月へRefsを生成しないことを保証する。
    expect(
      shouldGenerateRefs(
        { ...pastMonthly, title: "26.M07" },
        [],
        now,
        true,
      ),
    ).toBe(false);
  });

  it("Refsの無いロック済み過去月はロック計画と無関係に生成対象にする", () => {
    // 外部要因でRefsより先にロックされた月も定期実行だけで補完できることを保証する。
    const locked = { ...pastMonthly, isLocked: true };

    expect(shouldGenerateRefs(locked, [], now, false)).toBe(true);
    expect(shouldGenerateRefs(locked, ["Refs"], now, false)).toBe(false);
  });
});
