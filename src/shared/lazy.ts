// 初回呼び出しで計算し、以後は同じ結果を返す。失敗時は次回に再計算する。
// 本番コードで唯一の可変変数。メモ化をここに閉じ、呼び出し側は const で扱えるようにする。
export function lazy<T>(compute: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;

  return function () {
    cached ??= compute().catch(function (error: unknown) {
      cached = null;
      throw error;
    });

    return cached;
  };
}
