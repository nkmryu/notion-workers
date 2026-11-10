import { describe, expect, it } from "vitest";

import { createPageMention, extractBlockLinkIds, normalizeMarkdown } from "./markdown-normalization";

const PAGE_ID = "3b5372a1-dbcd-81d9-beaa-fc44aac44a64";
const MENTION = '<mention-page url="https://app.notion.com/p/3b5372a1dbcd81d9beaafc44aac44a64"/>';
const BLOCK_ID = "3a2372a1dbcd811f8c7ecb7a9e59f9da";
const BLOCK_LINK = `<unknown url="https://app.notion.com/p/3a2372a1dbcd81a2acf2f0ecc76d3d1a#${BLOCK_ID}" alt="external_object_instance"/>`;
const NO_BLOCK_URLS: ReadonlyMap<string, string> = new Map();

describe("createPageMention", () => {
  it("ページ ID をハイフン無しの Notion URL にした mention を作る", () => {
    // 転記先から元ページへ辿れる言及表記になることを保証する。
    expect(createPageMention(PAGE_ID)).toBe(MENTION);
  });
});

describe("extractBlockLinkIds", () => {
  it("自ブロックへのリンクになった unknown からブロック ID を重複なく抽出する", () => {
    // 外部 URL を失った bookmark だけをブロック API で引き直す対象にすることを保証する。
    const markdown = [BLOCK_LINK, BLOCK_LINK, '<unknown url="https://example.com/bookmark" alt="bookmark"/>'].join("\n");

    expect(extractBlockLinkIds(markdown)).toEqual([BLOCK_ID]);
  });
});

describe("normalizeMarkdown", () => {
  it("引き直した外部 URL をリンクにし、引けなかったものは残す", () => {
    // 復元できた bookmark は参照として転記・Refs 収集に使え、できないものは後段の置換に委ねることを保証する。
    const unresolved =
      '<unknown url="https://app.notion.com/p/3a2372a1dbcd81a2acf2f0ecc76d3d1a#00000000000000000000000000000000" alt="external_object_instance"/>';

    expect(
      normalizeMarkdown(`${BLOCK_LINK}\n${unresolved}`, PAGE_ID, new Map([[BLOCK_ID, "https://zenn.dev/article"]])),
    ).toBe(
      [
        "[https://zenn.dev/article](https://zenn.dev/article)",
        // 引けなかった unknown は URL を持つので、リンクとして残る
        "[https://app.notion.com/p/3a2372a1dbcd81a2acf2f0ecc76d3d1a#00000000000000000000000000000000](https://app.notion.com/p/3a2372a1dbcd81a2acf2f0ecc76d3d1a#00000000000000000000000000000000)",
      ].join("\n"),
    );
  });

  it("Notion ホストの画像・ファイルを元ページ mention 付き案内文に置換し、外部 URL の画像は残す", () => {
    // 失効する署名付き URL を toggle 内のインデント行も含めて転記先へ持ち込まないことを保証する。
    const signed =
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc";
    const markdown = [
      `![](${signed})`,
      `[report.pdf](${signed})`,
      `<video src="${signed}"></video>`,
      `\t![](${signed})`,
      `本文中の [資料](${signed}) への言及`,
      "![](https://cdn.example.com/image.png)",
    ].join("\n");

    expect(normalizeMarkdown(markdown, PAGE_ID, NO_BLOCK_URLS)).toBe(
      [
        `（画像/ファイルは元ページを参照） ${MENTION}`,
        `（画像/ファイルは元ページを参照） ${MENTION}`,
        `（画像/ファイルは元ページを参照） ${MENTION}`,
        `\t（画像/ファイルは元ページを参照） ${MENTION}`,
        "本文中の 資料 への言及",
        "![](https://cdn.example.com/image.png)",
      ].join("\n"),
    );
  });

  it("unknown は URL があればリンクに、無ければ案内文にし、embed はリンクにする", () => {
    // bookmark・embed の参照先を失わずに転記し、URL の無いブロックだけ元ページへ誘導することを保証する。
    const markdown = [
      '<unknown url="https://example.com/bookmark" alt="bookmark"/>',
      '\t<unknown alt="table_of_contents"/>',
      '<embed src="https://example.com/embed"></embed>',
    ].join("\n");

    expect(normalizeMarkdown(markdown, PAGE_ID, NO_BLOCK_URLS)).toBe(
      [
        "[https://example.com/bookmark](https://example.com/bookmark)",
        `\t（コピー非対応ブロック。元ページを参照） ${MENTION}`,
        "[https://example.com/embed](https://example.com/embed)",
      ].join("\n"),
    );
  });
});
