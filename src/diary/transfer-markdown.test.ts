import { describe, expect, it } from "vitest";

import {
  createTransferFallbackSection,
  createTransferSection,
  extractHeadingTitles,
  extractNotionBlockLinkIds,
  replaceNotionBlockLinks,
} from "./transfer-markdown";

const DAILY_ID = "3b5372a1-dbcd-81d9-beaa-fc44aac44a64";
const MENTION =
  '<mention-page url="https://app.notion.com/p/3b5372a1dbcd81d9beaafc44aac44a64"/>';

describe("extractHeadingTitles", () => {
  it("最上位の見出し2だけを転記済み見出しとして抽出する", () => {
    // 見出し3・インデントされた見出し・空見出しを転記済み判定へ混ぜないことを保証する。
    const markdown = [
      "---",
      "## 26.07.20（月）",
      "本文",
      "### 小見出し",
      "\t## ネスト内",
      "## ",
      "## 26.07.21（火）",
    ].join("\n");

    expect(extractHeadingTitles(markdown)).toEqual([
      "26.07.20（月）",
      "26.07.21（火）",
    ]);
  });

  it("コードブロック内の見出し記法を無視する", () => {
    // コード例の "## " 行を転記済みと誤判定して転記を飛ばさないことを保証する。
    const markdown = "```md\n## 26.07.20（月）\n```\n## 26.07.21（火）";

    expect(extractHeadingTitles(markdown)).toEqual(["26.07.21（火）"]);
  });
});

describe("createTransferSection", () => {
  it("divider・日付見出し・本文を連結し末尾の空行を1つに揃える", () => {
    // 転記先の見出し規則が転記済み判定と一致することを保証する。
    expect(
      createTransferSection("26.07.20（月）", [
        { pageId: DAILY_ID, markdown: "本文\n- 箇条書き\n\n\n" },
      ]),
    ).toBe("---\n## 26.07.20（月）\n本文\n- 箇条書き\n");
  });

  it("同じ日の複数Dailyを1つの見出しの下へ順に並べる", () => {
    // 同日に複数ページがあっても見出しを増やさず本文だけを続けることを保証する。
    expect(
      createTransferSection("26.07.20（月）", [
        { pageId: DAILY_ID, markdown: "一つ目" },
        { pageId: DAILY_ID, markdown: "二つ目" },
      ]),
    ).toBe("---\n## 26.07.20（月）\n一つ目\n二つ目\n");
  });

  it("Notionホストの画像・ファイルを元ページmention付き案内文に置換する", () => {
    // 失効する署名付きURLをtoggle内のインデント行も含めて転記先へ持ち込まず、外部URLの画像はそのまま残すことを保証する。
    const signed =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc";
    const markdown = [
      `![](${signed})`,
      `[report.pdf](${signed})`,
      `<video src="${signed}"></video>`,
      `\t![](${signed})`,
      "![](https://cdn.example.com/image.png)",
    ].join("\n");

    expect(createTransferSection("26.07.20（月）", [{ pageId: DAILY_ID, markdown }])).toBe(
      [
        "---",
        "## 26.07.20（月）",
        `（画像/ファイルは元ページを参照） ${MENTION}`,
        `（画像/ファイルは元ページを参照） ${MENTION}`,
        `（画像/ファイルは元ページを参照） ${MENTION}`,
        `\t（画像/ファイルは元ページを参照） ${MENTION}`,
        "![](https://cdn.example.com/image.png)",
        "",
      ].join("\n"),
    );
  });

  it("unknownブロックはURLがあればリンクに、無ければ案内文にする", () => {
    // bookmark等の参照先を失わずに転記し、URLの無いブロックだけ元ページへ誘導することを保証する。
    const markdown = [
      '<unknown url="https://example.com/bookmark" alt="bookmark"/>',
      '\t<unknown alt="table_of_contents"/>',
    ].join("\n");

    expect(createTransferSection("26.07.20（月）", [{ pageId: DAILY_ID, markdown }])).toBe(
      [
        "---",
        "## 26.07.20（月）",
        "[https://example.com/bookmark](https://example.com/bookmark)",
        `\t（コピー非対応ブロック。元ページを参照） ${MENTION}`,
        "",
      ].join("\n"),
    );
  });
});

describe("createTransferFallbackSection", () => {
  it("日付見出しと同じ日の全Dailyへのmentionを含む注記を返す", () => {
    // 互換性エラー後も見出しで転記済みと判定され、元ページへ辿れることを保証する。
    expect(
      createTransferFallbackSection("26.07.20（月）", [DAILY_ID, DAILY_ID]),
    ).toBe(
      `---\n## 26.07.20（月）\n（この日の転記はブロック互換性の問題で省略。元ページを参照） ${MENTION} ${MENTION}\n`,
    );
  });
});

describe("Notionブロックリンクの復元", () => {
  const blockLink =
    '<unknown url="https://app.notion.com/p/3a2372a1dbcd81a2acf2f0ecc76d3d1a#3a2372a1dbcd811f8c7ecb7a9e59f9da" alt="external_object_instance"/>';

  it("自ブロックへのリンクになったunknownからブロックIDを重複なく抽出する", () => {
    // 外部URLを失ったbookmarkだけをブロックAPIで引き直す対象にすることを保証する。
    const markdown = [
      blockLink,
      blockLink,
      '<unknown url="https://example.com/bookmark" alt="bookmark"/>',
    ].join("\n");

    expect(extractNotionBlockLinkIds(markdown)).toEqual([
      "3a2372a1dbcd811f8c7ecb7a9e59f9da",
    ]);
  });

  it("引き直した外部URLをリンク行へ置き換え、不明なものは残す", () => {
    // 復元できたbookmarkは参照先として転記・Refs収集に使え、できないものは後続の置換に委ねることを保証する。
    const blockUrls = new Map([
      ["3a2372a1dbcd811f8c7ecb7a9e59f9da", "https://zenn.dev/article"],
    ]);
    const unresolved =
      '<unknown url="https://app.notion.com/p/3a2372a1dbcd81a2acf2f0ecc76d3d1a#00000000000000000000000000000000" alt="external_object_instance"/>';

    expect(replaceNotionBlockLinks(`${blockLink}\n${unresolved}`, blockUrls)).toBe(
      `[https://zenn.dev/article](https://zenn.dev/article)\n${unresolved}`,
    );
  });
});
