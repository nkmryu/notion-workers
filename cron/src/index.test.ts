import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

const TOKEN = "github_pat_test_value";

function respondWith(status: number, body = ""): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async () => new Response(status === 204 ? null : body, { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scheduled", () => {
  it("secret の GITHUB_TOKEN で dispatch する", async () => {
    // Cron の入口が env の secret を使って dispatch まで進むことを保証する。
    const fetcher = respondWith(204);
    vi.stubGlobal("fetch", fetcher);

    await worker.scheduled({}, { GITHUB_TOKEN: TOKEN });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });

  it("dispatch が失敗したら、scheduled も失敗する", async () => {
    // 失敗を握りつぶさず、Cloudflare の Cron の記録に失敗として残ることを保証する。
    vi.stubGlobal("fetch", respondWith(401, '{"message":"Bad credentials"}'));

    await expect(worker.scheduled({}, { GITHUB_TOKEN: TOKEN })).rejects.toThrow("HTTP 401");
  });
});
