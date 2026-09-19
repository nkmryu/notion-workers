// 順序依存のある IO（レート制限のため直列にする必要がある呼び出し）を、可変の蓄積変数なしに並べて適用する。
export function mapSequentially<T, R>(
  items: readonly T[],
  apply: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  return items.reduce<Promise<readonly R[]>>(async function (previous, item) {
    const results = await previous;
    return [...results, await apply(item)];
  }, Promise.resolve([]));
}

export function countBy<T, K extends string>(
  items: readonly T[],
  keyOf: (item: T) => K,
  keys: readonly K[],
): Readonly<Record<K, number>> {
  const grouped = Object.groupBy(items, keyOf);

  return Object.fromEntries(
    keys.map(function (key) {
      return [key, grouped[key]?.length ?? 0];
    }),
  ) as Record<K, number>;
}
