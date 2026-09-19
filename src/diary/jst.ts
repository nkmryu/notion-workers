import { Temporal } from "temporal-polyfill";

export const JST_TIME_ZONE = "Asia/Tokyo";

// 日誌の日付は JST の暦日で決める。Notion の created_time や実行時刻は UTC の瞬間なので、ここで暦日へ落とす。
export function toJstDate(instant: Temporal.Instant): Temporal.PlainDate {
  return instant.toZonedDateTimeISO(JST_TIME_ZONE).toPlainDate();
}

export function parseCreatedTime(createdTime: string): Temporal.PlainDate {
  try {
    return toJstDate(Temporal.Instant.from(createdTime));
  } catch {
    throw new Error(`created_time が不正です: ${createdTime}`);
  }
}
