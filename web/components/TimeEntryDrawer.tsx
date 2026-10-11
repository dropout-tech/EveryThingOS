"use client";

import { useState, type FormEvent } from "react";
import type { useLiveAction } from "./LiveAction";
import { Button } from "./ui/Button";
import { Drawer } from "./ui/Drawer";
import { Field } from "./ui/Field";
import { BACKDATE_DAYS, HOURS_STEP, MAX_ENTRY_HOURS, addDays, checkTimeEntry, dayHoursFor, formatHours, type Activity, type Project, type ProjectTask, type TimeEntry, type TimeEntryErrors, type TimeLog } from "@/lib/projects";

const QUICK = [0.5, 1, 2, 4, 8];

type Props = {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  tasks: ProjectTask[];
  logs: TimeLog[];
  activities: Activity[];
  today: string;
  me: string;
  defaultProject?: string;
  live: boolean;
  action: ReturnType<typeof useLiveAction>;
  onDemoSave: (entry: TimeEntry) => void;
};

/** 記工時. Built for a phone on site: one project, how long, done. The same rules run again on the server. */
export function TimeEntryDrawer(props: Props) {
  return (
    <Drawer open={props.open} title="記工時" onClose={props.onClose}>
      {props.open ? <TimeEntryForm {...props} /> : null}
    </Drawer>
  );
}

function TimeEntryForm({ onClose, projects, tasks, logs, activities, today, me, defaultProject, live, action, onDemoSave }: Props) {
  const [project, setProject] = useState(defaultProject && projects.some((p) => p.id === defaultProject) ? defaultProject : projects.length === 1 ? projects[0].id : "");
  const [task, setTask] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [activity, setActivity] = useState(activities[0]?.name ?? "");
  const [billable, setBillable] = useState(true);
  const [errors, setErrors] = useState<TimeEntryErrors>({});
  const [touched, setTouched] = useState(false);
  const openTasks = tasks.filter((t) => t.project === project && t.status !== "done");
  const already = dayHoursFor(logs, me, date);

  function values(overrides: Partial<Record<string, unknown>> = {}) {
    return { project, task, hours: hours.replace(/[，,\s]/g, ""), date, note, activity: activities.length > 1 ? activity : activities[0]?.name ?? "", billable, ...overrides };
  }

  function recheck(overrides: Partial<Record<string, unknown>>) {
    if (!touched) return;
    const result = checkTimeEntry(values(overrides), today, dayHoursFor(logs, me, String(overrides.date ?? date)));
    setErrors(result.ok ? {} : result.errors);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    const result = checkTimeEntry(values(), today, already);
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      event.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    const entry = result.value;
    const name = projects.find((p) => p.id === entry.project)?.name ?? entry.project;
    if (!live) {
      onDemoSave(entry);
      onClose();
      return;
    }
    const done = await action.run(
      "/api/projects/time",
      { project: entry.project, task: entry.task, hours: entry.hours, date: entry.date, note: entry.note, activity: entry.activity, billable: entry.billable },
      () => `記好了：${name} ${formatHours(entry.hours)}${entry.date === today ? "" : `（${entry.date.slice(5)}）`}。`,
    );
    if (done?.ok) onClose();
  }

  if (!projects.length) {
    return <p className="text-sm text-cream-dim">現在沒有進行中的專案可以記。{live ? "先在 ERPNext 開一個專案。" : ""}</p>;
  }

  return (
    <form onSubmit={submit} noValidate aria-label="記工時" className="space-y-4">
      <Field label="哪個專案" error={errors.project}>
        <select
          name="project"
          className="field"
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setTask("");
            recheck({ project: e.target.value, task: "" });
          }}
        >
          <option value="">請選</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.customer ? `｜${p.customer}` : ""}
            </option>
          ))}
        </select>
      </Field>

      {openTasks.length ? (
        <Field label="做哪一項（可不選）" error={errors.task}>
          <select name="task" className="field" value={task} onChange={(e) => setTask(e.target.value)}>
            <option value="">不指定</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.subject}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="幾小時" error={errors.hours} hint={errors.hours ? null : already > 0 ? `這天已經記了 ${formatHours(already)}` : `以 15 分鐘為單位，一筆最多 ${MAX_ENTRY_HOURS} 小時`}>
        <input
          name="hours"
          className="field num"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          placeholder="1.5"
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            recheck({ hours: e.target.value });
          }}
        />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-2" role="group" aria-label="常用時數">
        {QUICK.map((h) => (
          <button
            key={h}
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={Number(hours) === h}
            onClick={() => {
              setHours(String(h));
              recheck({ hours: String(h) });
            }}
          >
            {h}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="加 15 分鐘"
          onClick={() => {
            const next = String(Math.min(MAX_ENTRY_HOURS, (Number(hours) || 0) + HOURS_STEP));
            setHours(next);
            recheck({ hours: next });
          }}
        >
          +15 分
        </button>
      </div>

      <Field label="哪一天" error={errors.date}>
        <input
          name="date"
          type="date"
          className="field"
          value={date}
          max={today}
          min={addDays(today, -BACKDATE_DAYS)}
          onChange={(e) => {
            setDate(e.target.value);
            recheck({ date: e.target.value });
          }}
        />
      </Field>

      {activities.length > 1 ? (
        <Field label="做什麼" error={errors.activity}>
          <select name="activity" className="field" value={activity} onChange={(e) => setActivity(e.target.value)}>
            {activities.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="備註（可不填）" error={errors.note}>
        <textarea name="note" className="field" rows={2} maxLength={280} value={note} placeholder="例如：和老闆對菜單" onChange={(e) => setNote(e.target.value)} />
      </Field>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 shrink-0" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        這段時間可以跟客人請款
      </label>

      <div className="form-actions sticky-submit">
        <Button type="submit" variant="primary" block pending={action.busy} pendingLabel="記錄中…">
          記下來
        </Button>
      </div>
      {live ? <p className="text-xs text-cream-dim">記好就會送出到 ERPNext 的工時表；記錯了到 ERPNext 取消那張工時表。</p> : null}
    </form>
  );
}
