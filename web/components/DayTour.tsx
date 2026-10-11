"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FEATURES } from "@/lib/shop";

const STOPS = [
  { time: "08:50", who: "每個人", title: "打卡，看今天先做哪件", body: "一進來就是「現在這件」，不用先找選單。", href: "/workspace" },
  { time: "09:10", who: "老闆", title: "問助理：誰欠我們最多？", body: "像傳訊息一樣問，答案從你們的帳算出來，附上是哪幾張單。", href: "/workspace/ask?q=誰欠我們最多" },
  { time: "10:30", who: "業務", title: "報價用 LINE 傳給客人，客人在手機簽名", body: "客人看到的是乾淨的報價頁，簽完你這邊馬上知道。", href: "/workspace/portal" },
  { time: "12:40", who: "員工", title: "午餐請客戶，拍收據報帳", body: "金額、類別、照片，三十秒送出，不用再黏報帳單。", href: "/workspace/approvals" },
  { time: "14:00", who: "主管", title: "請假、請購、報帳，手機上一次簽完", body: "全部排在同一個「等我簽」，退回要寫原因。", href: "/workspace/approvals" },
  { time: "16:00", who: "專案經理", title: "記工時，把做完的時數開成發票", body: "每個案子賺不賺、還剩多少預算，一眼看到。", href: "/workspace/projects" },
  { time: "18:00", who: "系統", title: "逾期帳款與低庫存，自動化自己跟", body: "提醒信、請購單草稿、待辦，下班後照規則跑，不會重複寄。", href: "/workspace/automations" },
  { time: "21:30", who: "老闆", title: "躺在沙發看今天的數字", body: "營收、毛利、帳齡、缺貨，手機加到主畫面就能看。", href: "/workspace/reports" },
] as const;

const SHOWCASE = { scene: "service", size: "mid", modules: FEATURES.map((item) => item.id) };

/** Opens a full-featured practice workspace, so every stop lands on a page that is switched on. */
export function DayTour() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [going, setGoing] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function open(href: string) {
    setGoing(href);
    setFailed(false);
    start(async () => {
      const response = await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SHOWCASE),
      }).catch(() => null);
      if (!response?.ok) {
        setFailed(true);
        setGoing(null);
        return;
      }
      router.push(href);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STOPS.map((stop) => (
          <li key={stop.time} className="site-sheet flex flex-col gap-2 p-5">
            <p className="flex items-baseline justify-between gap-2 text-xs text-cream-dim">
              <span className="num text-base font-medium text-cream">{stop.time}</span>
              <span>{stop.who}</span>
            </p>
            <h3 className="font-medium">{stop.title}</h3>
            <p className="text-sm text-cream-dim">{stop.body}</p>
            <button
              type="button"
              className="mt-auto self-start pt-2 text-sm underline underline-offset-4"
              onClick={() => open(stop.href)}
              disabled={pending}
              aria-busy={going === stop.href}
            >
              {going === stop.href ? "打開中…" : "直接看這一步"}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-cream-dim" role="status">
        {failed ? "示範沒打開，請再按一次，或從上面「先看示範」進去。" : "會打開一個「接案／專業、11–50 人、全部功能」的示範，資料只留在你的瀏覽器。"}
      </p>
    </div>
  );
}
