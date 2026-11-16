import { createDateSection, removeDividers } from "./markdown-section";

const FALLBACK_MESSAGE =
  "（この日の転記はブロック互換性の問題で省略。元ページを参照）";

// 1 日分の転記セクション。日付の見出しと divider の下へ、同じ日の全ページの本文を順に並べる。
// divider は日付の見出しの直下だけに置くので、本文の中の divider は写さない。
export function createTransferSection(heading: string, bodies: readonly string[]): string {
  const trimmed = bodies.flatMap(function (body) {
    const content = removeDividers(body).replace(/\n+$/, "");
    return content === "" ? [] : [content];
  });

  return createDateSection(heading, trimmed.join("\n"));
}

// 本文が受け付けられなかった日は、見出しと元ページへの言及だけを残す。見出しが立つので次回は転記済みとして扱われる。
export function createTransferFallbackSection(
  heading: string,
  sourceMentions: readonly string[],
): string {
  return createDateSection(heading, `${FALLBACK_MESSAGE} ${sourceMentions.join(" ")}`);
}
