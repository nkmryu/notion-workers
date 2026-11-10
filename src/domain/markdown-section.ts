// 転記と Refs が共有する「セクション」の規則。divider と見出し 2 で始まり、見出しが冪等キーになる。
// セクションは、締めの日の Daily の末尾に置いた「まとめの見出し」（divider と見出し 1）の下に並べる。
const SECTION_HEADING_PATTERN = /^## (.+)$/gm;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;

export function createSectionHeader(title: string): string {
  return `---\n## ${title}\n`;
}

export function createDigestHeader(label: string): string {
  return `---\n# ${label}\n`;
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

// まとめの見出しより後ろにある、最上位の見出し 2 を返す。まとめの見出しが無ければ null。
// 締めの日の Daily 自身の本文はまとめの見出しより前にあるので、本文中の見出しを転記済みと読み違えない。
export function extractDigestSectionTitles(
  markdown: string,
  label: string,
): readonly string[] | null {
  const lines = stripFencedCode(markdown).split("\n");
  const headerIndex = lines.findIndex(function (line) {
    return line.trimEnd() === `# ${label}`;
  });

  return headerIndex === -1 ? null : extractSectionTitles(lines.slice(headerIndex + 1).join("\n"));
}

// まとめの見出し（と直前の divider）から後ろを除いた本文を返す。まとめの見出しが無ければそのまま返す。
// 締めの日の Daily を転記元にするとき、そのページが持つまとめまで写して入れ子にしないために使う。
export function removeDigest(markdown: string, label: string): string {
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex(function (line) {
    return line.trimEnd() === `# ${label}`;
  });

  if (headerIndex === -1) {
    return markdown;
  }

  const start = headerIndex > 0 && lines[headerIndex - 1]?.trim() === "---" ? headerIndex - 1 : headerIndex;
  return `${lines.slice(0, start).join("\n").replace(/\n+$/, "")}\n`;
}
