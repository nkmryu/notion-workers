// Cloudflare Workers の Cron から、GitHub Actions の maintain.yml を workflow_dispatch で起動する。
// 処理そのものは GitHub Actions で動かす。Workers の無料プランは 1 回あたり 50 サブリクエストまでで、
// Notion への読み書きを全部ここで行うと上限に当たるため。
// workerd は入口のモジュールの export をすべてハンドラーとして読むので、default 以外は dispatch.ts に置く。

import { dispatchMaintain } from "./dispatch";

export interface Env {
  // fine-grained PAT（対象は nkmryu/notion-workers だけ、Actions の Read and write）。wrangler secret put で置く。
  readonly GITHUB_TOKEN?: string;
}

// 例外を投げると、Cloudflare の Cron の記録に失敗として残る。
export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await dispatchMaintain(env.GITHUB_TOKEN);
  },
};
