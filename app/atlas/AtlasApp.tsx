"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { calculateCapacity, formatMinutes } from "./capacity";
import { planningConversation } from "./conversations";
import { inferThought } from "./inference";
import { effortWarning, recommendedPlan } from "./scheduling";
import { createSeedState } from "./seed";
import { loadState, saveState } from "./storage";
import type {
  AtlasState,
  FocusSession,
  Prediction,
  Profile,
  Screen,
  Task,
  Thought,
  Timing,
} from "./types";

const timings: Timing[] = ["Urgent", "On the way home", "Today", "This week", "Whenever"];

const plannerNav: Array<{ screen: Screen; label: string; icon: string }> = [
  { screen: "home", label: "Home", icon: "⌂" },
  { screen: "inbox", label: "Inbox", icon: "▣" },
  { screen: "capture", label: "Capture", icon: "+" },
  { screen: "plan", label: "Plan", icon: "◫" },
  { screen: "projects", label: "More", icon: "•••" },
];

const requesterNav: Array<{ screen: Screen; label: string; icon: string }> = [
  { screen: "capture", label: "Capture", icon: "+" },
  { screen: "submitted", label: "Submitted", icon: "✓" },
];

function taskIcon(kind: Task["kind"]) {
  return kind === "Investment" ? "◆" : "●";
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function taskIsForDate(task: Task, date: string) {
  if (task.plannedFor === null) return false;
  if (task.plannedFor) {
    return task.plannedFor === date || (date === localDateKey() && task.plannedFor < date);
  }
  return task.section === "Tomorrow" ? date === localDateKey(1) : date === localDateKey();
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function normalizedTaskText(text: string) {
  return text.trim().toLowerCase().replace(/[.!?]+$/, "");
}

function confirmationFor(timing: Timing) {
  if (timing === "Urgent") return "Captured as urgent. The planner has been notified.";
  if (timing === "On the way home") return "Captured. This may be shown before the planner leaves work.";
  return "Captured. This will be reviewed after 5:00 PM.";
}

function Header({
  profile,
  onProfile,
  onSettings,
  fixedProfile,
}: {
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onSettings: () => void;
  fixedProfile?: Profile;
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onProfile(profile)} aria-label="Atlas home">
        <span className="brand-mark">A</span>
        <span>Atlas</span>
      </button>
      <div className="header-actions">
        {fixedProfile ? (
          <span className="profile-label">{fixedProfile === "planner" ? "Russ · Planner" : "Andrea · Requester"}</span>
        ) : (
          <label className="profile-switch">
            <span className="sr-only">Active profile</span>
            <select value={profile} onChange={(event) => onProfile(event.target.value as Profile)}>
              <option value="planner">Russ · Planner</option>
              <option value="requester">Andrea · Requester</option>
            </select>
          </label>
        )}
        <button className="icon-button" onClick={onSettings} aria-label="Atlas settings">
          ⚙
        </button>
      </div>
    </header>
  );
}

function BottomNav({
  profile,
  screen,
  onNavigate,
  pending,
}: {
  profile: Profile;
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  pending: number;
}) {
  const items = profile === "planner" ? plannerNav : requesterNav;
  return (
    <nav className={`bottom-nav ${profile === "requester" ? "requester-nav" : ""}`} aria-label="Primary">
      {items.map((item) => (
        <button
          key={item.screen}
          className={`${screen === item.screen ? "active" : ""} ${item.screen === "capture" ? "capture-nav" : ""}`}
          onClick={() => onNavigate(item.screen)}
          aria-current={screen === item.screen ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
          {item.screen === "inbox" && pending > 0 && <span className="badge">{pending}</span>}
        </button>
      ))}
    </nav>
  );
}

function ScreenHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="screen-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}

function TaskCard({
  task,
  onStart,
  onComplete,
  compact = false,
}: {
  task: Task;
  onStart?: (task: Task) => void;
  onComplete?: (task: Task) => void;
  compact?: boolean;
}) {
  return (
    <article className={`task-card ${task.kind.toLowerCase()} ${compact ? "compact" : ""}`}>
      <div className="task-type" aria-label={task.kind}>{taskIcon(task.kind)}</div>
      <div className="task-copy">
        <h3>{task.title}</h3>
        <p>{task.size} · {formatMinutes(task.minutes)} · {task.status}</p>
      </div>
      {task.status !== "Completed" && (onStart || onComplete) && (
        <div className="task-actions">
          {onStart && (
            <button className="text-button" onClick={() => onStart(task)}>
              {task.status === "Parked" ? "Resume" : "Start"}
            </button>
          )}
          {onComplete && (
            <button className="text-button complete-task-button" onClick={() => onComplete(task)}>
              Complete
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function HomeScreen({
  state,
  onNavigate,
  onStart,
  onComplete,
}: {
  state: AtlasState;
  onNavigate: (screen: Screen) => void;
  onStart: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  const today = localDateKey();
  const active = state.tasks.filter((task) => task.status !== "Completed" && taskIsForDate(task, today));
  const capacity = calculateCapacity(active);
  const now = active.find((task) => task.status === "In progress") ?? active.find((task) => task.kind === "Responsibility");
  const next = active.find((task) => task.id !== now?.id && task.kind === "Responsibility");
  const later = active.find((task) => task.kind === "Investment");
  const pending = state.thoughts.filter((thought) => thought.status === "Captured").length;

  return (
    <>
      <ScreenHeading eyebrow={state.demoNow} title="Today" description="A realistic plan, with room to stop." />
      <section className="capacity-card">
        <div>
          <p className="eyebrow">Available after work</p>
          <strong>{capacity.label}</strong>
        </div>
        <div className="capacity-ring" aria-label={`${capacity.label} available`}>135</div>
      </section>

      <button className="inbox-strip" onClick={() => onNavigate("inbox")}>
        <span><b>{pending}</b> requests waiting for review</span>
        <span aria-hidden="true">→</span>
      </button>

      <section className="home-group">
        <div className="section-title"><h2>Responsibilities</h2><span>Required</span></div>
        {active.filter((task) => task.kind === "Responsibility").slice(0, 2).map((task) => (
          <TaskCard key={task.id} task={task} onStart={onStart} onComplete={onComplete} compact />
        ))}
      </section>

      <section className="home-group protected-block">
        <div className="section-title"><h2>Protected investment</h2><span>Keep</span></div>
        {later && <TaskCard task={later} onStart={onStart} onComplete={onComplete} compact />}
        <p className="protect-note">This time is protected capacity, not leftover time.</p>
      </section>

      <section className="sequence">
        <div><span>Now</span><strong>{now?.title ?? "Choose a next action"}</strong></div>
        <div><span>Next</span><strong>{next?.title ?? "Buffer"}</strong></div>
        <div><span>Later</span><strong>{later?.title ?? "Stop safely"}</strong></div>
      </section>
    </>
  );
}

function CaptureScreen({
  profile,
  corrections,
  onCapture,
}: {
  profile: Profile;
  corrections: AtlasState["corrections"];
  onCapture: (text: string, timing: Timing) => void;
}) {
  const [text, setText] = useState("");
  const [timing, setTiming] = useState<Timing>("Whenever");
  const [confirmation, setConfirmation] = useState("");
  const [mode, setMode] = useState<"text" | "voice" | "photo">("text");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    onCapture(text.trim(), timing);
    setConfirmation(confirmationFor(timing));
    setText("");
  }

  function mockCapture(kind: "voice" | "photo") {
    setMode(kind);
    setText(kind === "voice" ? "Pick up dog food." : "The hallway wall still needs to be fixed.");
  }

  return (
    <>
      <ScreenHeading
        eyebrow={profile === "requester" ? "Just send it" : "Clear your head"}
        title="Capture"
        description={profile === "requester" ? "Say what you need. Planning happens later." : "Everything begins as a thought. No sorting required."}
      />
      {confirmation && (
        <div className="success-message" role="status">
          <span className="success-icon">✓</span>
          <div><strong>Captured</strong><p>{confirmation}</p></div>
        </div>
      )}
      <form className="capture-card" onSubmit={submit}>
        <div className="capture-modes" aria-label="Capture method">
          <button type="button" className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>Text</button>
          <button type="button" className={mode === "voice" ? "active" : ""} onClick={() => mockCapture("voice")}>Voice</button>
          <button type="button" className={mode === "photo" ? "active" : ""} onClick={() => mockCapture("photo")}>Photo</button>
        </div>
        {mode !== "text" && (
          <div className="mock-notice">
            {mode === "voice" ? "Voice transcript ready to review." : "Photo scanned. Suggested description added."}
          </div>
        )}
        <label htmlFor="capture-text">What do you need?</label>
        <textarea
          id="capture-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type a request or thought…"
          rows={4}
        />
        <fieldset className="timing-options">
          <legend>When? <span>Optional</span></legend>
          <div>
            {timings.map((item) => (
              <button
                type="button"
                key={item}
                className={timing === item ? "selected" : ""}
                onClick={() => setTiming(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="primary-button" type="submit">Capture thought</button>
      </form>
      <section className="widget-preview">
        <p className="eyebrow">Home-screen widget preview</p>
        <div>
          <span>Tap + to load a sample into Capture</span>
          <button
            type="button"
            aria-label="Load a sample capture"
            onClick={() => {
              setMode("text");
              setText("We need milk.");
            }}
          >
            +
          </button>
        </div>
      </section>
      <p className="privacy-note">Saved on this device. Predictions are deterministic and use {corrections.length} learned correction{corrections.length === 1 ? "" : "s"}.</p>
    </>
  );
}

function SubmittedScreen({ thoughts }: { thoughts: Thought[] }) {
  return (
    <>
      <ScreenHeading eyebrow="Household requests" title="Submitted" description="You can walk away. The planner will take it from here." />
      <div className="stack">
        {thoughts.slice().reverse().map((thought) => (
          <article className="submitted-card" key={thought.id}>
            <div>
              <h3>{thought.text}</h3>
              <p>{thought.timing}</p>
            </div>
            <span className={`status-pill ${thought.status.toLowerCase().replace(" ", "-")}`}>{thought.status}</span>
          </article>
        ))}
      </div>
    </>
  );
}

function InboxScreen({
  thoughts,
  onPrediction,
  onPlan,
}: {
  thoughts: Thought[];
  onPrediction: (thought: Thought, prediction: Prediction) => void;
  onPlan: (thought: Thought, plannedFor: string | null) => void;
}) {
  const pending = thoughts.filter((thought) => thought.status === "Captured" || thought.status === "Seen");
  return (
    <>
      <ScreenHeading eyebrow={`${pending.length} to review`} title="Inbox" description="Atlas inferred the details. Correct only what matters." />
      {pending.length === 0 && <div className="empty-state"><strong>Inbox clear.</strong><p>Nothing needs your attention right now.</p></div>}
      <div className="stack">
        {pending.map((thought) => (
          <article className={`inference-card ${thought.urgent ? "urgent" : ""}`} key={thought.id}>
            <div className="inference-title">
              <div><span className="eyebrow">{thought.urgent ? "Urgent request" : "New thought"}</span><h2>{thought.text}</h2></div>
              <span className="confidence">Inferred</span>
            </div>
            <div className="prediction-grid">
              <label>Type
                <select
                  value={thought.prediction.type}
                  onChange={(event) => onPrediction(thought, { ...thought.prediction, type: event.target.value })}
                >
                  <option>Shopping item</option><option>Errand</option><option>Conversation</option>
                  <option>Home project</option><option>Urgent home task</option><option>Household request</option>
                  <option>Health investment</option><option>App Development investment</option>
                </select>
              </label>
              <label>Timing
                <select
                  value={thought.prediction.timing}
                  onChange={(event) => onPrediction(thought, { ...thought.prediction, timing: event.target.value as Timing })}
                >
                  {timings.map((timing) => <option key={timing}>{timing}</option>)}
                </select>
              </label>
              <label>Size
                <select
                  value={thought.prediction.size}
                  onChange={(event) => onPrediction(thought, { ...thought.prediction, size: event.target.value as Prediction["size"] })}
                >
                  <option>Tiny</option><option>Small</option><option>Medium</option><option>Large</option>
                </select>
              </label>
              <label>Minutes
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={thought.prediction.minutes}
                  onChange={(event) => onPrediction(thought, { ...thought.prediction, minutes: Number(event.target.value) })}
                />
              </label>
            </div>
            {thought.prediction.project && <p className="project-link">Likely project · {thought.prediction.project}</p>}
            <InboxScheduleActions thought={thought} onPlan={onPlan} />
          </article>
        ))}
      </div>
    </>
  );
}

function InboxScheduleActions({
  thought,
  onPlan,
}: {
  thought: Thought;
  onPlan: (thought: Thought, plannedFor: string | null) => void;
}) {
  type ScheduleChoice = "today" | "tomorrow" | "date" | "whenever";
  const inferredChoice: ScheduleChoice =
    thought.prediction.timing === "Whenever"
      ? "whenever"
      : thought.prediction.timing === "This week"
        ? "tomorrow"
        : "today";
  const [choice, setChoice] = useState<ScheduleChoice>(inferredChoice);
  const [chosenDate, setChosenDate] = useState(localDateKey(2));
  const plannedFor =
    choice === "whenever"
      ? null
      : choice === "today"
        ? localDateKey()
        : choice === "tomorrow"
          ? localDateKey(1)
          : chosenDate;
  const buttonLabel =
    choice === "whenever"
      ? "Add to Whenever"
      : choice === "today"
        ? "Add to today"
        : choice === "tomorrow"
          ? "Add to tomorrow"
          : `Add to ${displayDate(chosenDate)}`;

  return (
    <div className="schedule-actions">
      <div className="schedule-fields">
        <label>
          Add to
          <select value={choice} onChange={(event) => setChoice(event.target.value as ScheduleChoice)}>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="date">Pick a date</option>
            <option value="whenever">Whenever</option>
          </select>
        </label>
        {choice === "date" && (
          <label>
            Date
            <input
              type="date"
              min={localDateKey()}
              value={chosenDate}
              onChange={(event) => setChosenDate(event.target.value)}
            />
          </label>
        )}
      </div>
      <button
        className="primary-button"
        disabled={choice === "date" && !chosenDate}
        onClick={() => onPlan(thought, plannedFor)}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function PlanScreen({
  state,
  onStart,
  onComplete,
  onAddOptional,
  tradeoff,
  onResolveTradeoff,
}: {
  state: AtlasState;
  onStart: (task: Task) => void;
  onComplete: (task: Task) => void;
  onAddOptional: () => void;
  tradeoff: boolean;
  onResolveTradeoff: (move: boolean) => void;
}) {
  const [view, setView] = useState<"Day" | "Week" | "Now / Next / Later">("Day");
  const [conversation, setConversation] = useState<"recommend" | "why" | "approved">("recommend");
  const today = localDateKey();
  const tomorrow = localDateKey(1);
  const todayTasks = state.tasks.filter((task) => taskIsForDate(task, today));
  const capacity = calculateCapacity(todayTasks);
  const recommendation = recommendedPlan(todayTasks, state.investments);
  const warning = effortWarning(todayTasks);
  const sections: Task["section"][] = ["Morning", "Workday", "On the way home", "After work", "Evening", "Tomorrow"];
  const weekDates = Array.from({ length: 7 }, (_, index) => localDateKey(index));
  const wheneverTasks = state.tasks.filter((task) => task.plannedFor === null && task.status !== "Completed");
  const upcomingTasks = state.tasks
    .filter((task) => task.plannedFor && task.plannedFor > tomorrow && task.status !== "Completed")
    .sort((left, right) => (left.plannedFor ?? "").localeCompare(right.plannedFor ?? ""));

  return (
    <>
      <ScreenHeading eyebrow="Protect what matters" title="Plan" description={`${capacity.label} available after work · 25 min buffer required`} />
      <div className="segmented">
        {(["Day", "Week", "Now / Next / Later"] as const).map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>
        ))}
      </div>

      {view === "Week" ? (
        <section className="week-grid">
          {weekDates.map((date, index) => {
            const tasks = state.tasks.filter((task) => task.status !== "Completed" && taskIsForDate(task, date));
            const minutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
            return (
              <div key={date} className={index === 0 ? "today" : ""}>
                <span>{displayDate(date)}</span>
                <strong>{tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${formatMinutes(minutes)}` : "Open"}</strong>
                {tasks[0] && <small>{tasks[0].title}</small>}
              </div>
            );
          })}
        </section>
      ) : view === "Now / Next / Later" ? (
        <section className="zoom-list">
          {todayTasks.length ? ["Now", "Next", "Later"].map((label, index) => (
            <div key={label}><span>{label}</span><TaskCard task={todayTasks[index] ?? todayTasks[0]} onStart={onStart} onComplete={onComplete} compact /></div>
          )) : <div className="empty-state"><strong>No tasks yet.</strong><p>Capture a thought to begin building your plan.</p></div>}
        </section>
      ) : (
        <div className="day-plan">
          {sections.map((section) => {
            const date = section === "Tomorrow" ? tomorrow : today;
            const tasks = state.tasks.filter((task) =>
              task.status !== "Completed" &&
              taskIsForDate(task, date) &&
              (section === "Tomorrow" || task.section === section)
            );
            if (!tasks.length && !["Workday", "Morning"].includes(section)) return null;
            return (
              <section key={section} className="plan-section">
                <div className="plan-time"><h2>{section}</h2><span>{section === "Workday" ? "8:00–5:00" : section === "On the way home" ? "5:00–5:30" : section === "Evening" ? "7:15–9:00" : ""}</span></div>
                {tasks.length ? tasks.map((task) => <TaskCard key={task.id} task={task} onStart={onStart} onComplete={onComplete} compact />) : <div className="calendar-block">{section === "Workday" ? "Work · fixed commitment" : "No planned work"}</div>}
                {section === "After work" && <div className="calendar-block">Dinner · 6:30–7:15 PM</div>}
              </section>
            );
          })}
          {upcomingTasks.length > 0 && (
            <section className="plan-section">
              <div className="plan-time"><h2>Upcoming</h2><span>After tomorrow</span></div>
              {upcomingTasks.map((task) => (
                <div key={task.id} className="dated-task">
                  <span>{displayDate(task.plannedFor!)}</span>
                  <TaskCard task={task} onComplete={onComplete} compact />
                </div>
              ))}
            </section>
          )}
          {wheneverTasks.length > 0 && (
            <section className="plan-section">
              <div className="plan-time"><h2>Whenever</h2><span>No date yet</span></div>
              {wheneverTasks.map((task) => <TaskCard key={task.id} task={task} onComplete={onComplete} compact />)}
            </section>
          )}
        </div>
      )}

      {todayTasks.length > 0 && <section className="conversation-card">
        <div className="atlas-avatar">A</div>
        {conversation === "approved" ? (
          <div><h2>Plan protected.</h2><p>The important work fits without overloading the evening.</p></div>
        ) : (
          <div className="conversation-copy">
            <p>{planningConversation.intro}</p>
            <p>{planningConversation.arrivals}</p>
            <p>{planningConversation.investment}</p>
            {conversation === "why" && <p className="why-callout">{planningConversation.why}</p>}
            <h3>Recommended plan</h3>
            <ul>
              {recommendation.responsibilities.map((task) => <li key={task.id}><span>{task.title}</span><b>{task.minutes} min</b></li>)}
              <li className="protected-row"><span>Build Atlas <em>Protected</em></span><b>60 min</b></li>
              <li><span>Buffer</span><b>25 min</b></li>
            </ul>
            {warning && <p className="effort-warning">{warning}</p>}
            <p><strong>Approve this plan?</strong></p>
            <div className="card-actions wrap">
              <button className="primary-button" onClick={() => setConversation("approved")}>Approve</button>
              <button className="secondary-button" onClick={() => setConversation("why")}>Ask why</button>
              <button className="secondary-button">Protect Health instead</button>
            </div>
          </div>
        )}
      </section>}

      <button className="secondary-button wide-button" onClick={onAddOptional}>Add nonurgent household task</button>

      {tradeoff && (
        <div className="modal-backdrop" role="presentation">
          <section className="tradeoff-modal" role="dialog" aria-modal="true" aria-labelledby="tradeoff-title">
            <span className="warning-mark">!</span>
            <p className="eyebrow">Direct tradeoff</p>
            <h2 id="tradeoff-title">Adding this removes tonight’s App Development investment.</h2>
            <p>This no longer fits today unless another task is removed.</p>
            <button className="primary-button" onClick={() => onResolveTradeoff(true)}>Move household task to tomorrow</button>
            <button className="danger-button" onClick={() => onResolveTradeoff(false)}>Replace investment anyway</button>
          </section>
        </div>
      )}
    </>
  );
}

function ProjectsScreen({ state, onOpen }: { state: AtlasState; onOpen: () => void }) {
  const project = state.projects[0];
  return (
    <>
      <ScreenHeading eyebrow="Outcomes, not backlogs" title="Projects" description="Only the current and next steps stay visible." />
      {project ? (
        <article className="project-card" onClick={onOpen}>
          <p className="eyebrow">Home · Active</p>
          <h2>{project.title}</h2>
          <p className="goal-copy">{project.endGoal}</p>
          <div className="project-steps">
            <div><span>Current</span><strong>{project.currentStep}</strong></div>
            <div><span>Next</span><strong>{project.nextStep}</strong></div>
          </div>
          <button className="text-button">Open project →</button>
        </article>
      ) : (
        <div className="empty-state"><strong>No projects yet.</strong><p>Atlas will suggest a project when a captured thought needs multiple steps.</p></div>
      )}
      <div className="more-grid">
        <button onClick={() => project && onOpen()}>Projects <span>{state.projects.length} active</span></button>
        <button>Responsibilities <span>6 areas</span></button>
        <button>Reference <span>Saved context</span></button>
      </div>
    </>
  );
}

function ProjectScreen({
  state,
  onBack,
  onStart,
  onComplete,
}: {
  state: AtlasState;
  onBack: () => void;
  onStart: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  const project = state.projects[0];
  if (!project) {
    return (
      <>
        <button className="back-button" onClick={onBack}>← Projects</button>
        <div className="empty-state"><strong>No project selected.</strong><p>Return to Projects to continue.</p></div>
      </>
    );
  }
  const task = state.tasks.find((item) => item.projectId === project.id && item.status !== "Completed");
  return (
    <>
      <button className="back-button" onClick={onBack}>← Projects</button>
      <ScreenHeading eyebrow="Home project" title={project.title} description={project.endGoal} />
      {project.parkingHistory.length > 0 && (
        <section className="future-note-card">
          <p className="eyebrow">Future Me note</p>
          <h2>Read this first</h2>
          <p>{project.parkingHistory.at(-1)?.futureNote}</p>
          <span>Resume · {project.parkingHistory.at(-1)?.resumeWindow}</span>
        </section>
      )}
      <section className="current-next">
        <div><span>Current step</span><strong>{project.currentStep}</strong></div>
        <div><span>Next step</span><strong>{project.nextStep}</strong></div>
      </section>
      {task && (
        <div className="project-task-actions">
          <button className="primary-button" onClick={() => onStart(task)}>
            {task.status === "Parked" ? "Resume with saved context" : "Start current step"}
          </button>
          <button className="secondary-button" onClick={() => onComplete(task)}>Complete task</button>
        </div>
      )}
      <div className="disclosure-stack">
        <details><summary>Remaining steps <span>{project.steps.length}</span></summary><ol>{project.steps.map((step) => <li key={step}>{step}</li>)}</ol></details>
        <details><summary>Tools <span>{project.tools.length}</span></summary><p>{project.tools.join(" · ")}</p></details>
        <details><summary>Materials <span>{project.materials.length}</span></summary><p>{project.materials.join(" · ")}</p></details>
        <details><summary>Estimated cost <span>${project.estimatedCost}</span></summary><p>Demo estimate for patching and finishing supplies.</p></details>
        <details><summary>Instructions <span>8 steps</span></summary><p>Measure first. Choose the repair method before buying materials.</p></details>
        <details><summary>Reference links <span>2</span></summary><p>Drywall repair guide · Paint matching notes</p></details>
        <details><summary>Photos <span>1</span></summary><p>Hallway damage · captured today</p></details>
        <details><summary>Parking history <span>{project.parkingHistory.length}</span></summary>{project.parkingHistory.map((point) => <p key={point.id}>{point.completed} → {point.nextAction}</p>)}</details>
      </div>
    </>
  );
}

function InvestmentsScreen({
  state,
  onStart,
  onComplete,
}: {
  state: AtlasState;
  onStart: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  return (
    <>
      <ScreenHeading eyebrow="Protected capacity" title="Investments" description="Important work gets time before the evening fills up." />
      <div className="stack">
        {state.investments.map((investment) => {
          const appTask = state.tasks.find((task) => task.kind === "Investment" && task.status !== "Completed");
          return (
            <article className="investment-card" key={investment.id}>
              <div className="investment-heading"><span className="investment-symbol">◆</span><div><p className="eyebrow">Investment</p><h2>{investment.title}</h2></div></div>
              <p className="investment-why">{investment.why}</p>
              <div className="investment-metrics">
                <div><span>Target</span><strong>{investment.target}</strong></div>
                <div><span>Protected this week</span><strong>{formatMinutes(investment.protectedMinutes)}</strong></div>
                <div><span>Completed this week</span><strong>{formatMinutes(investment.completedMinutes)}</strong></div>
                <div><span>Next session</span><strong>{investment.nextSession}</strong></div>
              </div>
              <p className="example-actions">{investment.examples.join(" · ")}</p>
              {investment.id === "app" && appTask && (
                <div className="investment-actions">
                  <button className="secondary-button" onClick={() => onStart(appTask)}>Start Build Atlas</button>
                  <button className="secondary-button" onClick={() => onComplete(appTask)}>Complete task</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

function ParkingWorkflow({
  task,
  onCancel,
  onPark,
}: {
  task: Task;
  onCancel: () => void;
  onPark: (values: { completed: string; remains: string; nextAction: string; futureNote: string; resumeWindow: string }) => void;
}) {
  const [completed, setCompleted] = useState(task.projectId ? "Measured the damaged area and photographed the wall" : "Finished the planning flow and saved the current implementation");
  const [remains, setRemains] = useState(task.projectId ? "Choose the repair method and buy materials" : "Test the focus and parking flow");
  const [nextAction, setNextAction] = useState(task.projectId ? "Buy patch, mesh tape, and sanding sponge" : "Open the focus flow and run the acceptance scenario");
  const [futureNote, setFutureNote] = useState("");
  const [resumeWindow, setResumeWindow] = useState("Saturday at 9:00 AM");

  return (
    <section className="parking-workflow">
      <button className="back-button" onClick={onCancel}>← Back to focus</button>
      <ScreenHeading eyebrow="Stop safely" title={`Park ${task.title}`} description="Preserve the context so Future You can resume without reconstruction." />
      <div className="parking-steps">
        <label><span>1</span> What was completed?
          <textarea value={completed} onChange={(event) => setCompleted(event.target.value)} rows={2} />
        </label>
        <label><span>2</span> What remains?
          <textarea value={remains} onChange={(event) => setRemains(event.target.value)} rows={2} />
        </label>
        <label><span>3</span> Concrete next action
          <input value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
        </label>
        <label className="future-input"><span>4</span> What should Future You know before starting again?
          <textarea value={futureNote} onChange={(event) => setFutureNote(event.target.value)} placeholder="The measurements are in the photo. Start with the materials list…" rows={3} />
        </label>
        <label><span>5</span> Resume window
          <select value={resumeWindow} onChange={(event) => setResumeWindow(event.target.value)}>
            <option>Saturday at 9:00 AM</option>
            <option>Tomorrow at 6:00 PM</option>
            <option>Wednesday at 7:30 PM</option>
          </select>
        </label>
      </div>
      <button
        className="primary-button wide-button"
        disabled={!futureNote.trim()}
        onClick={() => onPark({ completed, remains, nextAction, futureNote, resumeWindow })}
      >
        Park and preserve context
      </button>
    </section>
  );
}

function FocusScreen({
  state,
  onComplete,
  onOverrun,
  onContinue,
  onParking,
  onReplan,
  onUrgent,
}: {
  state: AtlasState;
  onComplete: (task: Task) => void;
  onOverrun: () => void;
  onContinue: (minutes: number) => void;
  onParking: () => void;
  onReplan: () => void;
  onUrgent: (thought: Thought) => void;
}) {
  const focus = state.focus;
  const task = state.tasks.find((item) => item.id === focus?.taskId);
  const urgent = state.thoughts.slice().reverse().find((thought) => thought.urgent && thought.status === "Captured");
  if (!focus || !task) return <div className="empty-state"><strong>No active focus session.</strong></div>;
  const project = state.projects.find((item) => item.id === task.projectId);
  const savedNote = task.futureNote ?? project?.parkingHistory.at(-1)?.futureNote;

  return (
    <div className="focus-shell">
      <div className="focus-top">
        <span>Focus session</span>
        <button onClick={onReplan}>Inspect day</button>
      </div>
      {focus.resumed && savedNote && (
        <section className="resume-note">
          <p className="eyebrow">Future Me note · read first</p>
          <p>{savedNote}</p>
        </section>
      )}
      {urgent && (
        <section className="urgent-banner" role="alert">
          <div><p className="eyebrow">Urgent household request</p><strong>{urgent.text}</strong></div>
          <button onClick={() => onUrgent(urgent)}>Park this and handle it</button>
        </section>
      )}
      <main className="focus-main">
        <p className="eyebrow">{task.kind} · {task.size}</p>
        <h1>{task.title}</h1>
        <div className="focus-step">
          <span>Current step</span>
          <strong>{task.currentStep ?? "Complete this focused work session"}</strong>
        </div>
        <div className="focus-time">
          <div><span>Remaining</span><strong>{focus.remainingMinutes} min</strong></div>
          <div><span>Planned stop</span><strong>8:30 PM</strong></div>
        </div>
        <div className="goal-line"><span>End goal</span><p>{task.endGoal ?? "Finish the action with enough context to stop safely."}</p></div>

        <section className="focus-completion">
          <button className="primary-button" onClick={() => onComplete(task)}>Finish task</button>
          <p>Marks this complete and returns to Today. The optional steps can be skipped.</p>
        </section>

        {!focus.overrun ? (
          <button className="secondary-button wide-button demo-control" onClick={onOverrun}>Simulate planned stopping time</button>
        ) : (
          <section className="overrun-warning" role="alert">
            <span className="warning-mark">!</span>
            <h2>You are over the planned time.</h2>
            <p>{task.kind === "Investment" ? "Continuing removes the next task from today." : "Continuing will use tonight’s App Development block."}</p>
            <p><strong>Stop at the next safe point or remove another task.</strong></p>
            <div className="overrun-actions">
              <button className="primary-button" onClick={onParking}>Stop at the next safe point</button>
              <button className="secondary-button" onClick={() => onContinue(10)}>Continue 10 minutes</button>
              <button className="secondary-button" onClick={() => onContinue(20)}>Continue 20 minutes</button>
              <button className="secondary-button" onClick={onReplan}>Replan the day</button>
            </div>
          </section>
        )}
        <div className="disclosure-stack focus-details">
          <details><summary>Tools & materials</summary><p>{project ? [...project.tools, ...project.materials].join(" · ") : "Laptop · notes · reference material"}</p></details>
          <details><summary>Instructions & project steps</summary><p>{project?.steps.join(" → ") ?? "Work only on the current step until the stopping time."}</p></details>
          <details><summary>Notes & reference links</summary><p>Context is available here without exposing the rest of the backlog.</p></details>
        </div>
      </main>
    </div>
  );
}

function SettingsScreen({
  state,
  onNavigate,
  account,
}: {
  state: AtlasState;
  onNavigate: (screen: Screen) => void;
  account?: AtlasAccount;
}) {
  const [inviteCopied, setInviteCopied] = useState(false);

  async function copyInviteCode() {
    if (!account?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(account.inviteCode);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      window.prompt("Copy Andrea’s invite code", account.inviteCode);
    }
  }

  return (
    <>
      <ScreenHeading eyebrow="Household account" title="Atlas settings" description="Your household data is private and shared across signed-in devices." />
      {account && (
        <section className="settings-card">
          <h2>{account.householdName}</h2>
          <ul>
            <li><span>Signed in</span><strong>{account.displayName}</strong></li>
            <li><span>Email</span><strong>{account.email}</strong></li>
            <li><span>Cloud sync</span><strong>{account.syncStatus}</strong></li>
          </ul>
          {state.profile === "planner" && account.inviteCode && (
            <div className="invite-code">
              <span>Andrea’s invite code</span>
              <strong>{account.inviteCode}</strong>
              <p>Andrea will enter this after creating her own Atlas account.</p>
              <button type="button" className="secondary-button" onClick={copyInviteCode}>
                {inviteCopied ? "Copied" : "Copy invite code"}
              </button>
            </div>
          )}
          <button className="secondary-button wide-button" onClick={account.onSignOut}>Sign out</button>
        </section>
      )}
      <section className="settings-card">
        <h2>Simulated calendar</h2>
        <ul>
          <li><span>Work</span><strong>Mon–Fri · 8:00 AM–5:00 PM</strong></li>
          <li><span>Commute</span><strong>5:00–5:30 PM</strong></li>
          <li><span>Dinner</span><strong>6:30–7:15 PM</strong></li>
          <li><span>Saturday</span><strong>Morning open</strong></li>
          <li><span>Sunday</span><strong>Family event · afternoon</strong></li>
        </ul>
      </section>
      <section className="settings-card">
        <h2>{account ? "Saved to your household" : "Saved locally"}</h2>
        <p>{state.thoughts.length} thoughts · {state.tasks.length} tasks · {state.projects.reduce((total, project) => total + project.parkingHistory.length, 0)} parking points · {state.corrections.length} learned corrections</p>
      </section>
      <div className="settings-links">
        <button onClick={() => onNavigate("investments")}>Open Investments <span>→</span></button>
        <button onClick={() => onNavigate("projects")}>Open Projects <span>→</span></button>
      </div>
    </>
  );
}

export interface AtlasAccount {
  displayName: string;
  email: string;
  householdName: string;
  inviteCode: string;
  syncStatus: string;
  onSignOut: () => void;
}

interface AtlasAppProps {
  initialState?: AtlasState;
  fixedProfile?: Profile;
  onStateChange?: (state: AtlasState) => void;
  account?: AtlasAccount;
}

export default function AtlasApp({ initialState, fixedProfile, onStateChange, account }: AtlasAppProps) {
  const [state, setState] = useState<AtlasState>(() => initialState
    ? { ...initialState, profile: fixedProfile ?? initialState.profile }
    : createSeedState());
  const [hydrated, setHydrated] = useState(Boolean(initialState));
  const [screen, setScreen] = useState<Screen>("home");
  const [tradeoff, setTradeoff] = useState(false);
  const [parking, setParking] = useState(false);
  const [toast, setToast] = useState("");
  const initialCloudState = useRef(initialState);

  useEffect(() => {
    if (initialCloudState.current) return;
    const frame = window.requestAnimationFrame(() => {
      setState(loadState());
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!initialState) return;
    setState((current) => {
      const next = { ...initialState, profile: fixedProfile ?? current.profile };
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [fixedProfile, initialState]);

  useEffect(() => {
    if (!hydrated) return;
    if (onStateChange) {
      onStateChange(state);
    } else {
      saveState(state);
    }
  }, [hydrated, onStateChange, state]);

  const pending = useMemo(
    () => state.thoughts.filter((thought) => thought.status === "Captured").length,
    [state.thoughts],
  );

  function updateState(updater: (current: AtlasState) => AtlasState) {
    setState((current) => updater(current));
  }

  function switchProfile(profile: Profile) {
    const nextProfile = fixedProfile ?? profile;
    updateState((current) => ({ ...current, profile: nextProfile }));
    setScreen(nextProfile === "planner" ? (pending > 0 ? "inbox" : "home") : "capture");
    setParking(false);
  }

  function navigate(next: Screen) {
    setScreen(next);
    setParking(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function capture(text: string, timing: Timing) {
    updateState((current) => {
      const prediction = inferThought(text, timing, current.corrections);
      const urgent = timing === "Urgent" || prediction.timing === "Urgent";
      const newThought: Thought = {
        id: makeId("thought"),
        text,
        timing: prediction.timing,
        urgent,
        status: "Captured",
        createdAt: new Date().toISOString(),
        prediction,
      };
      return { ...current, thoughts: [...current.thoughts, newThought] };
    });
  }

  function correctPrediction(thought: Thought, prediction: Prediction) {
    updateState((current) => ({
      ...current,
      thoughts: current.thoughts.map((item) => item.id === thought.id ? { ...item, prediction } : item),
      corrections: [
        ...current.corrections.filter((item) => item.phrase !== thought.text.split(" ")[0]),
        { phrase: thought.text.split(" ").slice(0, 2).join(" "), prediction },
      ],
    }));
    setToast("Correction saved. Atlas will reuse it for similar inputs.");
  }

  function addThoughtToPlan(thought: Thought, plannedFor: string | null) {
    const today = localDateKey();
    const tomorrow = localDateKey(1);
    const section =
      plannedFor === tomorrow
        ? "Tomorrow"
        : thought.prediction.timing === "On the way home" && plannedFor === today
        ? "On the way home"
        : thought.prediction.timing === "Urgent"
          ? "After work"
          : "Evening";
    const task: Task = {
      id: makeId("task"),
      title: thought.text.replace(/[.!]$/, ""),
      size: thought.prediction.size,
      minutes: thought.prediction.minutes,
      status: "Ready",
      kind: thought.prediction.type.includes("investment") ? "Investment" : "Responsibility",
      section,
      urgent: thought.urgent,
      plannedFor,
      sourceThoughtId: thought.id,
      projectId: thought.prediction.project ? "drywall" : undefined,
    };
    updateState((current) => ({
      ...current,
      thoughts: current.thoughts.map((item) => item.id === thought.id ? { ...item, status: "Planned" } : item),
      tasks: [...current.tasks, task],
    }));
    const destination =
      plannedFor === null
        ? "Whenever"
        : plannedFor === today
          ? "today"
          : plannedFor === tomorrow
            ? "tomorrow"
            : displayDate(plannedFor);
    setToast(`${task.title} added to ${destination}.`);
    navigate("plan");
  }

  function startTask(task: Task) {
    const project = state.projects.find((item) => item.id === task.projectId);
    const resumed =
      task.status === "Parked" &&
      Boolean(task.futureNote || project?.parkingHistory.length);
    const focus: FocusSession = {
      taskId: task.id,
      startedAt: new Date().toISOString(),
      plannedMinutes: task.minutes,
      remainingMinutes: task.minutes,
      overrun: false,
      resumed,
    };
    updateState((current) => ({
      ...current,
      focus,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "In progress" } : item),
    }));
    navigate("focus");
  }

  function completeTask(task: Task, returnHome = false) {
    const taskText = normalizedTaskText(task.title);
    updateState((current) => ({
      ...current,
      focus: current.focus?.taskId === task.id ? null : current.focus,
      tasks: current.tasks.map((item) =>
        item.id === task.id ? { ...item, status: "Completed" as const } : item
      ),
      thoughts: current.thoughts.map((thought) =>
        thought.id === task.sourceThoughtId ||
        (thought.status !== "Completed" && normalizedTaskText(thought.text) === taskText)
          ? { ...thought, status: "Completed" as const }
          : thought
      ),
    }));
    setToast(`${task.title} completed.`);
    if (returnHome) navigate("home");
  }

  function parkTask(values: { completed: string; remains: string; nextAction: string; futureNote: string; resumeWindow: string }) {
    const task = state.tasks.find((item) => item.id === state.focus?.taskId);
    if (!task) return;
    const point = { id: makeId("parking"), ...values, createdAt: new Date().toISOString() };
    updateState((current) => ({
      ...current,
      focus: null,
      tasks: [...current.tasks.map((item) =>
        item.id === task.id ? { ...item, status: "Parked" as const } : item
      ), {
        id: makeId("resume"),
        title: values.nextAction,
        size: "Small" as const,
        minutes: 30,
        status: "Ready" as const,
        kind: task.kind,
        section: "Tomorrow" as const,
        plannedFor: localDateKey(1),
        projectId: task.projectId,
      }],
      projects: current.projects.map((project) =>
        project.id === task.projectId
          ? { ...project, currentStep: values.nextAction, nextStep: values.remains, parkingHistory: [...project.parkingHistory, point] }
          : project
      ),
    }));
    setParking(false);
    setToast("Parked. Your notes are saved and the next action is planned.");
    navigate(task.projectId ? "project" : "plan");
  }

  function handleUrgent(thought: Thought) {
    const currentTask = state.tasks.find((task) => task.id === state.focus?.taskId);
    if (!currentTask) return;
    const quickNote = {
      completed: "Saved current progress before the urgent interruption",
      remains: "Resume the current step",
      nextAction: `Resume ${currentTask.title}`,
      futureNote: "Urgent sink leak interrupted this session. The current work is saved; resume from the current step.",
      resumeWindow: "Tomorrow at 6:00 PM",
    };
    const point = { id: makeId("parking"), ...quickNote, createdAt: new Date().toISOString() };
    const urgentTask: Task = {
      id: makeId("urgent"),
      title: thought.text.replace(/[.!]$/, ""),
      size: thought.prediction.size,
      minutes: thought.prediction.minutes,
      status: "In progress",
      kind: "Responsibility",
      section: "After work",
      urgent: true,
      plannedFor: localDateKey(),
      currentStep: "Stop the leak and prevent further damage",
      endGoal: "The leak is contained and the next repair action is clear.",
    };
    updateState((current) => ({
      ...current,
      thoughts: current.thoughts.map((item) => item.id === thought.id ? { ...item, status: "In progress" } : item),
      tasks: [
        ...current.tasks.map((item) =>
          item.id === currentTask.id
            ? { ...item, status: "Parked" as const, currentStep: quickNote.nextAction, futureNote: quickNote.futureNote }
            : item
        ),
        urgentTask,
      ],
      focus: { taskId: urgentTask.id, startedAt: new Date().toISOString(), plannedMinutes: urgentTask.minutes, remainingMinutes: urgentTask.minutes, overrun: false, resumed: false },
      projects: current.projects.map((project) => project.id === currentTask.projectId ? { ...project, parkingHistory: [...project.parkingHistory, point] } : project),
    }));
    setToast("Development work parked. The urgent sink leak is now active.");
  }

  const activeTask = state.tasks.find((task) => task.id === state.focus?.taskId);

  return (
    <div className={screen === "focus" ? "app focus-app" : "app"}>
      {screen !== "focus" && !parking && (
        <Header profile={state.profile} onProfile={switchProfile} onSettings={() => navigate("settings")} fixedProfile={fixedProfile} />
      )}
      {toast && (
        <button className="toast" onClick={() => setToast("")} aria-label="Dismiss notification">
          <span>✓</span>{toast}
        </button>
      )}
      <div className={screen === "focus" ? "" : "page-shell"}>
        {parking && activeTask ? (
          <ParkingWorkflow task={activeTask} onCancel={() => setParking(false)} onPark={parkTask} />
        ) : (
          <>
            {state.profile === "requester" ? (
              screen === "settings"
                ? <SettingsScreen state={state} account={account} onNavigate={navigate} />
                : screen === "submitted"
                  ? <SubmittedScreen thoughts={state.thoughts} />
                  : <CaptureScreen profile="requester" corrections={state.corrections} onCapture={capture} />
            ) : (
              <>
                {screen === "home" && <HomeScreen state={state} onNavigate={navigate} onStart={startTask} onComplete={completeTask} />}
                {screen === "capture" && <CaptureScreen profile="planner" corrections={state.corrections} onCapture={capture} />}
                {screen === "inbox" && <InboxScreen thoughts={state.thoughts} onPrediction={correctPrediction} onPlan={addThoughtToPlan} />}
                {screen === "plan" && (
                  <PlanScreen
                    state={state}
                    onStart={startTask}
                    onComplete={completeTask}
                    tradeoff={tradeoff}
                    onAddOptional={() => setTradeoff(true)}
                    onResolveTradeoff={(move) => {
                      const optional: Task = {
                        id: makeId("optional"),
                        title: "Organize the garage shelf",
                        size: "Medium",
                        minutes: 45,
                        status: "Ready",
                        kind: "Responsibility",
                        section: move ? "Tomorrow" : "Evening",
                        plannedFor: move ? localDateKey(1) : localDateKey(),
                      };
                      updateState((current) => ({
                        ...current,
                        tasks: move
                          ? [...current.tasks, optional]
                          : [...current.tasks.filter((task) => task.id !== "build-atlas"), optional],
                      }));
                      setTradeoff(false);
                      setToast(move ? planningConversation.adjusted : "App Development was removed from tonight.");
                    }}
                  />
                )}
                {screen === "projects" && <ProjectsScreen state={state} onOpen={() => navigate("project")} />}
                {screen === "project" && <ProjectScreen state={state} onBack={() => navigate("projects")} onStart={startTask} onComplete={completeTask} />}
                {screen === "investments" && <InvestmentsScreen state={state} onStart={startTask} onComplete={completeTask} />}
                {screen === "focus" && (
                  <FocusScreen
                    state={state}
                    onComplete={(task) => completeTask(task, true)}
                    onOverrun={() => updateState((current) => ({ ...current, focus: current.focus ? { ...current.focus, overrun: true, remainingMinutes: 0 } : null }))}
                    onContinue={(minutes) => updateState((current) => ({ ...current, focus: current.focus ? { ...current.focus, overrun: false, remainingMinutes: minutes } : null }))}
                    onParking={() => setParking(true)}
                    onReplan={() => navigate("plan")}
                    onUrgent={handleUrgent}
                  />
                )}
                {screen === "settings" && <SettingsScreen state={state} account={account} onNavigate={navigate} />}
              </>
            )}
          </>
        )}
      </div>
      {screen !== "focus" && !parking && (
        <BottomNav profile={state.profile} screen={screen} onNavigate={navigate} pending={pending} />
      )}
    </div>
  );
}
