import { createSectionHeader } from "./markdown-section";

const FALLBACK_MESSAGE =
  "（この日の転記はブロック互換性の問題で省略。元ページを参照）";

// 1 日分の転記セクション。見出しの下へ、同じ日の全ページの本文を順に並べる。
export function createTransferSection(heading: string, bodies: readonly string[]): string {
  const trimmed = bodies.map(function (body) {
    return body.replace(/\n+$/, "");
  });

  return `${createSectionHeader(heading)}${trimmed.join("\n")}\n`;
}

// 本文が受け付けられなかった日は、見出しと元ページへの言及だけを残す。見出しが立つので次回は転記済みとして扱われる。
export function createTransferFallbackSection(
  heading: string,
  sourceMentions: readonly string[],
): string {
  return `${createSectionHeader(heading)}${FALLBACK_MESSAGE} ${sourceMentions.join(" ")}\n`;
}
