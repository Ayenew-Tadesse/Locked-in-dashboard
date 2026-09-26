# How scores are calculated

Every score is calculated by one piece of code, `app/core/scoring.js`. The
app and the Claude API both use it, so they always agree. Each daily score
comes with its full breakdown: open **Today → How today's score is
calculated** in the app. The weights below are the defaults, and you can
change all of them in **Settings → Scoring formula**.

## Daily score (0–100)

A day's tasks are the tasks whose **date** is that day (cancelled tasks are
ignored). Five components are each measured from 0 to 100%:

| Component | Default weight | What it measures |
| --- | --- | --- |
| Task completion | 40 | Share of the day's tasks done. Completed = full credit; unfinished tasks earn their completion % as partial credit. |
| Priority-weighted completion | 20 | Same as above, weighted by priority (low 1, medium 2, high 3, urgent 4), so finishing urgent work counts more. |
| Deadlines met | 20 | Of the tasks **due** that day, the share completed on or before the deadline. |
| Milestone work | 10 | Completion of the day's tasks that are linked to a milestone. |
| Time worked | 10 | Logged actual minutes ÷ daily target (default 240 min), capped at 100%. |

```
base  = Σ (weight × component) ÷ Σ weights of components that had data
score = base − 5 × (tasks overdue at the end of the day), penalty capped at 25
score is clamped to 0–100 and rounded
```

* **Skipped components:** if there is nothing to measure (nothing due that
  day, no milestone tasks, no time logged), the component is left out and the
  other weights are scaled up. You're never penalised for, say, not having a
  deadline.
* **No tasks planned** means no score (shown as "—"), not zero. Future days have
  no score.
* **Overdue:** a task is overdue when its deadline has passed and it isn't
  completed or cancelled. The penalty for a past day counts tasks that were
  still overdue at the end of that day.

### Worked example

Four tasks planned, and one older task still overdue:

| Task | Priority | Status | Due | Milestone | Minutes |
| --- | --- | --- | --- | --- | --- |
| A | urgent | completed | today (met) | yes | 90 |
| B | high | completed | | | 60 |
| C | medium | in progress, 50% | | | 30 |
| D | low | not started | | | |

* Completion: (1 + 1 + 0.5 + 0) ÷ 4 = **62.5%**
* Priority: (4·1 + 3·1 + 2·0.5 + 1·0) ÷ (4+3+2+1) = 8 ÷ 10 = **80%**
* Deadlines: 1 of 1 due today met = **100%**
* Milestone work: 1 of 1 linked task done = **100%**
* Time: 180 ÷ 240 = **75%**
* Base = (40·62.5 + 20·80 + 20·100 + 10·100 + 10·75) ÷ 100 = **78.5**
* Penalty: 1 overdue task × 5 = **5**
* **Score = 74** (78.5 − 5, rounded)

This exact example is an automated test (`tests/unit/core.test.mjs`).

## Weekly and monthly score

Weeks run Monday to Sunday. Days that haven't happened yet are ignored.

```
score = 70% × average daily score (of days that have a score)
      + 30% × consistency
consistency = active days ÷ target active days (capped at 100%)
```

An **active day** has at least one completed task. The target is 5 active
days per week, scaled for a month (about 21–22 days). This keeps the spirit of
the original dashboard's "5 active days = 100%" while also rewarding the
quality of each day.

The week view also shows:

* **Best day:** the highest daily score.
* **Needs improvement:** days scoring under 60, or where under half the planned
  tasks got done.

## Quarterly score

Quarters are calendar quarters: Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec.

```
score = 50% × average weekly score (weeks overlapping the quarter, so far)
      + 50% × average progress of that quarter's goals
```

If there are no goals, the score is the weekly average alone. **Quarter
progress** (the headline %) is the average progress of the quarter's goals.

## Milestone and goal progress

These are calculated by the database, so they're correct everywhere:

* **Milestone, automatic mode** (default): completed related tasks ÷ related
  tasks, excluding cancelled ones. It becomes *Completed* at 100%, and goes back
  to *In progress* if new tasks are added.
* **Milestone, manual mode:** current progress ÷ target (e.g. 3 of 10 books).
* **Goal, milestones mode:** the average of its milestones' percentages.
* **Goal, manual mode:** current progress ÷ target.
* **Pace:** a milestone is *Behind schedule* when its progress is more than 10
  points below the share of time elapsed between its start date and deadline.

## Your notes

Each day and each week has a notes field (Today page, Week page). Notes are
stored alongside the score snapshot and are returned by the API, so Claude can
use your own explanations when summarising your progress.

## Stored snapshots

Scores are recalculated live from your tasks. A snapshot of each day's and
week's score (with its breakdown) is also saved to `daily_scores` /
`weekly_scores` for history, and refreshed when tasks change or the formula
is edited.
