// ページに対して行う操作。「何もしない」は空の配列で表す。
// 操作の種類は snake_case の文字列で表し、本番コードではこの定数を参照する。
export const PAGE_ACTION_TYPE = {
  rename: "rename",
  lock: "lock",
} as const;

export type PageAction =
  | { readonly type: typeof PAGE_ACTION_TYPE.rename; readonly title: string }
  | { readonly type: typeof PAGE_ACTION_TYPE.lock };
