// 転記と Refs が共有する「セクション」の規則。最上位の見出し 2 で始まり、見出しが冪等キーになる。
// セクションは、締めの日の Daily の末尾に置いた「まとめの見出し」（見出し 1）の下に並べる。
// divider は日付の見出しの直下にだけ置く。まとめの見出しと Refs の見出しには付けず、転記する本文からも除く。
const SECTION_HEADING_PATTERN = /^## (.+)$/gm;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
// split の結果にコードブロックも残すため、全体を 1 つのグループで捕まえる。
const FENCED_CODE_SPLIT_PATTERN = /(```[\s\S]*?```)/;
// 子ブロックの中の divider は、タブでインデントされた行になる。
const DIVIDER_LINE_PATTERN = /^\t*---[ \t]*(?:\n|$)/gm;
const DIVIDER = "---";
const EMPTY_BLOCK = "<empty-block/>";

export function createSectionHeader(title: string): string {
  return `## ${title}\n`;
}

export function createDigestHeader(label: string): string {
  return `# ${label}\n`;
}

// 1 日分のセクション。日付の見出しの直下に divider を置き、空行（空の段落）で次のセクションと分ける。
// 本文が空行で終わっていれば、空行を重ねない。
export function createDateSection(title: string, body: string): string {
  const content = body === "" ? "" : `${body}\n`;
  const separator = body.split("\n").at(-1) === EMPTY_BLOCK ? "" : `${EMPTY_BLOCK}\n`;

  return `${createSectionHeader(title)}${DIVIDER}\n${content}${separator}`;
}

// コードブロック内の "## " 行や URL を本文として扱わないよう、先に取り除く。
export function stripFencedCode(markdown: string): string {
  return markdown.replace(FENCED_CODE_PATTERN, "");
}

// divider の行を取り除く。子ブロックの中の divider も除き、コードブロックの中の "---" は残す。
export function removeDividers(markdown: string): string {
  return markdown
    .split(FENCED_CODE_SPLIT_PATTERN)
    .map(function (part, index) {
      // 奇数番目は split が捕まえたコードブロック。
      return index % 2 === 1 ? part : part.replace(DIVIDER_LINE_PATTERN, "");
    })
    .join("");
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

// 締めの日の Daily を、その日自身の本文（ownBody）と、まとめの見出しから末尾まで（digest）に分けたもの。
// ownBody と digest を "\n" でつなぐと元の Markdown に戻る。
export interface DigestParts {
  readonly ownBody: string;
  readonly digest: string;
}

// まとめの見出しで分ける。まとめの見出しが無ければ null。
// 旧形式（divider → まとめの見出し）で書いたまとめもあるので、見出しの直前の divider はまとめに含める。
export function splitAtDigest(markdown: string, label: string): DigestParts | null {
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex(function (line) {
    return line.trimEnd() === `# ${label}`;
  });

  if (headerIndex === -1) {
    return null;
  }

  const start = headerIndex > 0 && lines[headerIndex - 1]?.trim() === DIVIDER ? headerIndex - 1 : headerIndex;
  return { ownBody: lines.slice(0, start).join("\n"), digest: lines.slice(start).join("\n") };
}

// まとめの見出しから後ろを除いた本文を返す。まとめの見出しが無ければそのまま返す。
// 締めの日の Daily を転記元にするとき、そのページが持つまとめまで写して入れ子にしないために使う。
export function removeDigest(markdown: string, label: string): string {
  const parts = splitAtDigest(markdown, label);
  return parts === null ? markdown : `${parts.ownBody.replace(/\n+$/, "")}\n`;
}

// 空行（空の段落）と divider だけの本文は、何も書いていないものとみなす。
export function isBlankBody(markdown: string): boolean {
  return removeDividers(markdown).replaceAll(EMPTY_BLOCK, "").trim() === "";
}
