import { describe, expect, it } from "vitest";

import { extractSectionTitles } from "./markdown-section";
import {
  createTransferFallbackSection,
  createTransferSection,
} from "./transfer-markdown";


describe("extractSectionTitles", () => {
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

    expect(extractSectionTitles(markdown)).toEqual([
      "26.07.20（月）",
      "26.07.21（火）",
    ]);
  });

  it("コードブロック内の見出し記法を無視する", () => {
    // コード例の "## " 行を転記済みと誤判定して転記を飛ばさないことを保証する。
    const markdown = "```md\n## 26.07.20（月）\n```\n## 26.07.21（火）";

    expect(extractSectionTitles(markdown)).toEqual(["26.07.21（火）"]);
  });
});

describe("createTransferSection", () => {
  it("divider・日付見出し・本文を連結し末尾の空行を1つに揃える", () => {
    // 転記先の見出し規則が転記済み判定と一致することを保証する。
    expect(createTransferSection("26.07.20（月）", ["本文\n- 箇条書き\n\n\n"])).toBe(
      "---\n## 26.07.20（月）\n本文\n- 箇条書き\n",
    );
  });

  it("同じ日の複数Dailyを1つの見出しの下へ順に並べる", () => {
    // 同日に複数ページがあっても見出しを増やさず本文だけを続けることを保証する。
    expect(createTransferSection("26.07.20（月）", ["一つ目", "二つ目"])).toBe(
      "---\n## 26.07.20（月）\n一つ目\n二つ目\n",
    );
  });
});

describe("createTransferFallbackSection", () => {
  it("日付見出しと同じ日の全Dailyへの言及を含む注記を返す", () => {
    // 互換性エラー後も見出しで転記済みと判定され、元ページへ辿れることを保証する。
    expect(createTransferFallbackSection("26.07.20（月）", ["@one", "@two"])).toBe(
      "---\n## 26.07.20（月）\n（この日の転記はブロック互換性の問題で省略。元ページを参照） @one @two\n",
    );
  });
});
