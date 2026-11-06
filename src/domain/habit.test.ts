import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { HabitPage, formatHabitTitle, shouldCreateTodayHabitPage } from "./habit";

const today = Temporal.PlainDate.from("2026-07-22");

function habit(title: string): HabitPage {
  return HabitPage.fromRecord({ id: `habit-${title}`, title });
}

describe("HabitPage.fromRecord", () => {
  it("タイトルの日付をその行の日付にする", () => {
    // 習慣ページがどの日の分かをタイトルから決めることを保証する。
    expect(habit("26.07.22（水）").date).toEqual(today);
  });

  it("日付として読めないタイトルの行は、どの日の分でもない", () => {
    // 習慣データベースに置いたメモの行で実行を止めないことを保証する。
    expect(habit("メモ").date).toBeNull();
    expect(habit("").date).toBeNull();
    expect(habit("メモ").isOn(today)).toBe(false);
  });

  it("存在しない日付のタイトルは失敗する", () => {
    // 日付を書き間違えた行を黙って無視しないことを保証する。
    expect(function () {
      habit("26.02.30（月）");
    }).toThrow("日付が不正です: 26.02.30（月）");
  });
});

describe("formatHabitTitle", () => {
  it("Daily と同じ形式のタイトルを作る", () => {
    // 習慣データベースの既存ページと同じ形式で作ることを保証する。
    expect(formatHabitTitle(today)).toBe("26.07.22（水）");
  });
});

describe("shouldCreateTodayHabitPage", () => {
  it("今日の習慣ページが無ければ作成する", () => {
    // 過去日の行しか無いときに今日の分を作ることを保証する。
    expect(shouldCreateTodayHabitPage([habit("26.07.21（火）"), habit("メモ")], today)).toBe(true);
    expect(shouldCreateTodayHabitPage([], today)).toBe(true);
  });

  it("今日の習慣ページがあれば作成しない", () => {
    // 再実行で同じ日のページを二重に作らないことを保証する。
    expect(shouldCreateTodayHabitPage([habit("26.07.21（火）"), habit("26.07.22（水）")], today)).toBe(false);
  });

  it("曜日だけ違う今日の習慣ページがあっても作成しない", () => {
    // 曜日文字を日付の同定に使わず、手で作ったページと重複させないことを保証する。
    expect(shouldCreateTodayHabitPage([habit("26.07.22（火）")], today)).toBe(false);
  });
});
