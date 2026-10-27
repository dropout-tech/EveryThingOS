"use client";

import { useState } from "react";
import { ActionNote } from "@/components/ActionNote";
import { NextThing } from "@/components/NextThing";
import { channelById } from "@/lib/open-chat/channels";
import { nextThread, OPEN_THREADS } from "@/lib/open-chat/threads";
import type { OpenThread } from "@/lib/open-chat/types";
import { demoKey, peekDemoState, writeDemoState } from "@/lib/demo-state";
import { windowNote } from "@/lib/open-chat/reply-window";
import type { PersonRef } from "@/lib/open-chat/types";
import { PersonCard } from "./PersonCard";
import { ReplyBox } from "./ReplyBox";
import { ThreadList } from "./ThreadList";

export function OpenChatDesk({ threads = OPEN_THREADS, packId, storeName }: { threads?: OpenThread[]; packId?: string; storeName?: string }) {
  const focus = nextThread(threads);
  const [note, setNote] = useState<string | null>(null);
  if (!focus) return null;

  const others: PersonRef[] = threads.filter((thread) => thread.id !== focus.id);
  const channel = channelById(focus.channel)?.label ?? focus.channel;

  return (
    <div className="space-y-4">
      <ActionNote>{note}</ActionNote>
      <NextThing
        title={`${focus.name} 等最久`}
        detail={`「${focus.preview}」。${windowNote(focus.channel, focus.waitedMinutes)}`}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <div className="glass space-y-4 p-4">
          <ReplyBox
            thread={focus}
            others={others}
            live={false}
            onPracticeReply={(text) => {
              if (packId) {
                const key = demoKey("timeline", packId);
                const prev = peekDemoState<{ party: string; text: string }[]>(key, []);
                writeDemoState(key, [{ party: focus.name, text }, ...prev].slice(0, 20));
              }
              setNote(`已寫下給 ${focus.name} 的「${text}」。留在${storeName ?? "這家"}的練習對話，客人頁看得到「今天回過」。還沒傳到${channel}。`);
            }}
          />
          <ThreadList threads={threads} activeId={focus.id} />
        </div>
        <PersonCard thread={focus} />
      </div>
    </div>
  );
}
