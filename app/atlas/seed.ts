import { inferThought } from "./inference";
import type { AtlasState, Task, Thought, Timing } from "./types";

const seededInputs: Array<[string, Timing, boolean]> = [
  ["We need milk.", "On the way home", false],
  ["Pick up dog food on the way home.", "On the way home", false],
  ["The hallway wall still needs to be fixed.", "This week", false],
  ["Talk to me about vacation this week.", "This week", false],
  ["The kitchen sink is leaking.", "Urgent", true],
  ["Work out.", "Today", false],
  ["Spend time developing Atlas.", "This week", false],
];

function thought(text: string, timing: Timing, urgent: boolean, index: number): Thought {
  return {
    id: `seed-thought-${index}`,
    text,
    timing,
    urgent,
    status: index < 2 ? "Planned" : "Captured",
    createdAt: new Date(2026, 6, 26, 14, index).toISOString(),
    prediction: inferThought(text, timing),
  };
}

const tasks: Task[] = [
  {
    id: "measure-drywall",
    title: "Measure hallway drywall",
    size: "Small",
    minutes: 20,
    status: "Ready",
    kind: "Responsibility",
    section: "After work",
    projectId: "drywall",
    currentStep: "Take a photo and measure the damaged area",
    endGoal: "The hallway drywall is repaired, primed, and painted.",
  },
  {
    id: "dog-food",
    title: "Pick up dog food",
    size: "Small",
    minutes: 15,
    status: "Ready",
    kind: "Responsibility",
    section: "On the way home",
  },
  {
    id: "build-atlas",
    title: "Build Atlas",
    size: "Medium",
    minutes: 60,
    status: "Ready",
    kind: "Investment",
    section: "Evening",
    currentStep: "Refine the protected-time planning flow",
    endGoal: "A calm personal operating system that protects attention and long-term goals.",
  },
];

export function createSeedState(): AtlasState {
  return {
    profile: "planner",
    thoughts: seededInputs.map(([text, timing, urgent], index) => thought(text, timing, urgent, index)),
    tasks: tasks.map((task) => ({ ...task })),
    projects: [
      {
        id: "drywall",
        title: "Patch hallway drywall",
        endGoal: "The hallway drywall is repaired, primed, and painted.",
        currentStep: "Take a photo and measure",
        nextStep: "Determine repair method",
        steps: [
          "Take a photo and measure",
          "Determine repair method",
          "Create materials list",
          "Buy materials",
          "Patch",
          "Sand",
          "Prime",
          "Paint",
        ],
        tools: ["Tape measure", "Putty knife", "Sanding block"],
        materials: ["Patch", "Mesh tape", "Sanding sponge", "Primer", "Paint"],
        estimatedCost: 35,
        parkingHistory: [],
      },
    ],
    investments: [
      {
        id: "health",
        title: "Health",
        why: "Maintain health, reduce stress, and improve energy.",
        target: "Three sessions per week",
        protectedMinutes: 45,
        completedMinutes: 45,
        nextSession: "Tuesday · 6:00 PM",
        examples: ["Workout", "Walk", "Meal preparation"],
      },
      {
        id: "app",
        title: "App Development",
        why: "Build useful products, develop technical skills, and create future opportunities.",
        target: "Three hours per week",
        protectedMinutes: 60,
        completedMinutes: 0,
        nextSession: "Tonight · 7:30 PM",
        examples: ["Build Atlas", "Research an API", "Fix authentication", "Design a feature"],
      },
    ],
    corrections: [],
    focus: null,
    protectedInvestment: "app",
    demoNow: "Monday · 5:35 PM",
  };
}

