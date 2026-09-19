// 転記と Refs が共有する「セクション」の規則。divider と見出し 2 で始まり、見出しが冪等キーになる。
const SECTION_HEADING_PATTERN = /^## (.+)$/gm;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;

export function createSectionHeader(title: string): string {
  return `---\n## ${title}\n`;
}

// コードブロック内の "## " 行や URL を本文として扱わないよう、先に取り除く。
export function stripFencedCode(markdown: string): string {
  return markdown.replace(FENCED_CODE_PATTERN, "");
}

// 最上位の見出し 2 だけを返す。インデントされた（子ブロックの）見出しは対象外。
export function extractSectionTitles(markdown: string): readonly string[] {
  return [...stripFencedCode(markdown).matchAll(SECTION_HEADING_PATTERN)].flatMap<string>(
    function (match) {
      const title = match[1]?.trim() ?? "";
      return title === "" ? [] : [title];
    },
  );
}
