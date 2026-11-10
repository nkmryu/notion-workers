// Notion API の平均 3 req/s 制限に合わせ、連続する呼び出しの間隔を空ける。429 の再試行は SDK が行う。
export const READ_INTERVAL_MS = 150;
export const WRITE_INTERVAL_MS = 350;

export function sleep(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}
