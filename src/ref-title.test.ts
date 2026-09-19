import { describe, expect, it } from "vitest";

import {
  extractHtmlTitle,
  selectRefTitle,
} from "./ref-title";

describe("extractHtmlTitle", () => {
  it("og:titleをtitle要素より優先する", () => {
    // HTMLに両方の候補がある場合はog:titleを採用することを保証する。
    const html = `
      <html><head>
        <title>通常タイトル</title>
        <meta content="OG &amp; タイトル" property="og:title">
      </head></html>
    `;

    expect(extractHtmlTitle(html, "text/html; charset=utf-8")).toBe(
      "OG & タイトル",
    );
  });

  it("og:titleが無ければtitle要素を使う", () => {
    // Open Graph未対応ページでもtitle要素から記事名を得ることを保証する。
    expect(
      extractHtmlTitle(
        "<html><head><title>記事タイトル</title></head></html>",
        "text/html",
      ),
    ).toBe("記事タイトル");
  });

  it("基本5種と数値参照のHTMLエンティティをデコードする", () => {
    // タイトル表示にHTMLエンティティ表記が残らないことを保証する。
    const html =
      "<title>&amp; &lt; &gt; &quot; &apos; &#65; &#x1F600;</title>";

    expect(extractHtmlTitle(html, "text/html")).toBe(
      "& < > \" ' A 😀",
    );
  });

  it("空白を正規化して200文字に切り詰める", () => {
    // 改行や連続空白を1個へ揃え、Notionへ長すぎる表示名を送らないことを保証する。
    const longTitle = `${"a".repeat(198)}   b\n cdef`;
    const result = extractHtmlTitle(`<title>${longTitle}</title>`, "text/html");

    expect(result).toBe(`${"a".repeat(198)} b`);
    expect(Array.from(result ?? [])).toHaveLength(200);
  });

  it("HTML以外のレスポンスではnullを返す", () => {
    // JSONや画像の本文をHTMLとして誤解析しないことを保証する。
    expect(extractHtmlTitle("<title>誤検出</title>", "application/json"))
      .toBeNull();
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

  it("アンカーが無ければHTTP取得タイトルを使う", () => {
    // HTTPから抽出できた記事名をリンクテキストにすることを保証する。
    expect(selectRefTitle({ url, anchorTitle: null }, "HTTPの記事名"))
      .toEqual({ url, title: "HTTPの記事名", source: "http" });
  });

  it("タイトル解決に失敗した場合はURL文字列へフォールバックする", () => {
    // 取得失敗があってもURL表示でRefsを生成できることを保証する。
    expect(selectRefTitle({ url, anchorTitle: null }, null)).toEqual({
      url,
      title: url,
      source: "fallback",
    });
  });
});
