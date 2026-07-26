# Atlas

Atlas is a mobile-first browser prototype for household requests, realistic capacity planning, protected personal investments, focused work, and safe stopping and resuming. Russ is the planner; Andrea is the requester.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Validate

```bash
npm run build
npm run lint
```

## Demo scenarios

1. **Household request:** switch to Andrea · Requester, capture “Pick up dog food.” as On the way home, then switch to Russ · Planner and add it from Inbox.
2. **Protected investment:** open Plan, add a nonurgent household task, and move it to tomorrow when Atlas warns that it would replace App Development.
3. **Stop and resume:** open the drywall project, start the task, simulate the planned stopping time, park it with a Future Me note, then resume.
4. **Urgent interruption:** start Build Atlas from Investments, switch to Andrea · Requester and submit an urgent sink leak, then return to Russ · Planner focus mode and park development to handle it.

Prototype data persists in `localStorage`. Use Demo settings → Reset Demo Data to restore the seeded state.

## GitHub Pages

Pushes to `main` deploy automatically to `https://rdripley.github.io/Atlas/`.
