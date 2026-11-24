export const DISPATCH_URL =
  "https://api.github.com/repos/nkmryu/notion-workers/actions/workflows/maintain.yml/dispatches";

export async function dispatchMaintain(token: string | undefined, fetcher: typeof fetch = fetch): Promise<void> {
  if (token === undefined || token.trim() === "") {
    throw new Error("secret GITHUB_TOKEN が未設定です");
  }

  const response = await fetcher(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "notion-workers-cron",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (response.status !== 204) {
    // 本文は GitHub のエラーの説明（"Bad credentials" など）で、送ったトークンは含まない。
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`maintain.yml の dispatch が HTTP ${response.status} で失敗しました: ${detail}`);
  }
}
