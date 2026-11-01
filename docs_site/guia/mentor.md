# Mentor

The Mentor builds your study plan, spreads it across the calendar and follows you day by day. The complete guide to each screen is in [`docs/MENTOR_GUIA.md`](https://github.com/Lessteps/NoteVault/blob/main/docs/MENTOR_GUIA.md) (in Spanish); here is the essentials.

## How it is organized

```text
Mentor
├─ Plan                  overview of plans and each plan
│   └─ <your plan>
│       ├─ Execution     day to day: today, areas, Pomodoro, progress
│       └─ Plan          build and adjust (summary, topics, agenda, practice…)
├─ Day close             what happened today and what to fix
├─ Goals
├─ Projects
└─ Notes and study       half-finished topics, reviews, mistakes
```

The chat with the Mentor lives in the assistant panel, in the right column.

## The plan always fits your dates

You set a start date and an end date. The plan **adjusts to that range**: it spreads every pending topic between the two dates. For each subject, the app tells you the **required pace** (topics per day and minutes per day) to reach the end date.

## Execution

- **Today:** the scheduled areas, with their topics, minutes and status.
- **Spaced reviews** at 3, 7, 14, 30, 60 and 120 days.
- **Pomodoro:** one global timer that is not lost when you change tabs; each block goes into the hours log.
- **Solid route:** if an earlier day is unfinished, later topics stay blocked until it is closed.
- **Start today / Replan from today:** moves the plan start to today, keeps the end date, keeps what is already completed and can be undone.

## Topic states

| State | Meaning |
| :--- | :--- |
| Scheduled | Not due yet. |
| On time | Today falls within its date window. |
| Pending | Its time has passed and it is not complete (automatic). |
| Done | Completed. |

## Every topic is three pieces

A **theory** note (`.md`), a **map** (`.canvas`) and a **practice** file (`.practica.md`) with exercises. All three are generated with the [Skills](skills.md), and the app knows which skill version each one was made with.
