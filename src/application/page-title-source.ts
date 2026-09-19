// 外部 Web ページのタイトルを引く口。取れなければ null を返し、失敗で手続きを止めない。
export interface PageTitleSource {
  readonly lookupTitle: (url: string) => Promise<string | null>;
}
