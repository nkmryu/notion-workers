import { describe, expect, it, vi } from "vitest";

import { DISPATCH_URL, dispatchMaintain } from "./dispatch";

const TOKEN = "github_pat_test_value";

function respondWith(status: number, body = ""): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async () => new Response(status === 204 ? null : body, { status }));
}

describe("dispatchMaintain", () => {
  it("maintain.yml の dispatches へ、main を ref にした POST を 1 回だけ送る", async () => {
    // GitHub の REST API が workflow_dispatch に求める形（宛先・認証・ヘッダー・本文）で送ることを保証する。
    const fetcher = respondWith(204);

    await dispatchMaintain(TOKEN, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.github.com/repos/nkmryu/notion-workers/actions/workflows/maintain.yml/dispatches");
    expect(url).toBe(DISPATCH_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "notion-workers-cron",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ ref: "main" });
  });

  it.each([
    [401, '{"message":"Bad credentials"}'],
    [403, '{"message":"Resource not accessible by personal access token"}'],
    [404, '{"message":"Not Found"}'],
    [422, '{"message":"No ref found for: main"}'],
    [500, "Internal Server Error"],
    [200, '{"workflow_run_id":1}'],
  ])("HTTP %i なら、状態と GitHub の説明を載せた例外を投げ、トークンは載せない", async (status, body) => {
    // 204 以外を成功とみなさず、Cloudflare の Cron の記録に失敗として残ることを保証する。
    const result = dispatchMaintain(TOKEN, respondWith(status, body));

    await expect(result).rejects.toThrow(`HTTP ${status}`);
    await expect(result).rejects.toThrow(body);
    await expect(result).rejects.not.toThrow(TOKEN);
  });

  it("通信そのものが失敗したら、例外をそのまま投げる", async () => {
    // fetch の失敗を握りつぶさず、Cron の失敗として残ることを保証する。
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network error");
    });

    await expect(dispatchMaintain(TOKEN, fetcher)).rejects.toThrow("network error");
  });

  it.each([undefined, "", "  "])("トークンが %j なら、GitHub へ送らずに例外を投げる", async (token) => {
    // secret を入れ忘れたまま動いた Cron が、認証なしの要求を送らずに失敗として残ることを保証する。
    const fetcher = respondWith(204);

    await expect(dispatchMaintain(token, fetcher)).rejects.toThrow("GITHUB_TOKEN");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
