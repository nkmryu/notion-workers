import { describe, expect, it } from "vitest";

import { extractBlockLinkIds, restoreBlockLinks } from "./markdown-links";

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

    expect(extractBlockLinkIds(markdown)).toEqual([
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

    expect(restoreBlockLinks(`${blockLink}\n${unresolved}`, blockUrls)).toBe(
      `[https://zenn.dev/article](https://zenn.dev/article)\n${unresolved}`,
    );
  });
});
