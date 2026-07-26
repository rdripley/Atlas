export type Profile = "planner" | "requester";
export type Screen =
  | "home"
  | "capture"
  | "submitted"
  | "inbox"
  | "plan"
  | "projects"
  | "project"
  | "investments"
  | "focus"
  | "settings";
export type Timing = "Urgent" | "On the way home" | "Today" | "This week" | "Whenever";
export type ThoughtStatus = "Captured" | "Seen" | "Planned" | "In progress" | "Completed";
export type TaskSize = "Tiny" | "Small" | "Medium" | "Large";
export type Effort = "Low" | "Medium" | "High";
export type TaskKind = "Responsibility" | "Investment";

export interface Prediction {
  type: string;
  size: TaskSize;
  minutes: number;
  timing: Timing;
  project?: string;
  mental: Effort;
  emotional: Effort;
  physical: Effort;
}

export interface Thought {
  id: string;
  text: string;
  timing: Timing;
  urgent: boolean;
  status: ThoughtStatus;
  createdAt: string;
  prediction: Prediction;
}

export interface Task {
  id: string;
  title: string;
  size: TaskSize;
  minutes: number;
  status: "Ready" | "In progress" | "Parked" | "Completed";
  kind: TaskKind;
  section: "Morning" | "Workday" | "On the way home" | "After work" | "Evening" | "Tomorrow";
  projectId?: string;
  currentStep?: string;
  endGoal?: string;
  futureNote?: string;
  urgent?: boolean;
}

export interface ParkingPoint {
  id: string;
  completed: string;
  remains: string;
  nextAction: string;
  futureNote: string;
  resumeWindow: string;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  endGoal: string;
  currentStep: string;
  nextStep: string;
  steps: string[];
  tools: string[];
  materials: string[];
  estimatedCost: number;
  parkingHistory: ParkingPoint[];
}

export interface Investment {
  id: "health" | "app";
  title: string;
  why: string;
  target: string;
  protectedMinutes: number;
  completedMinutes: number;
  nextSession: string;
  examples: string[];
}

export interface Correction {
  phrase: string;
  prediction: Prediction;
}

export interface FocusSession {
  taskId: string;
  startedAt: string;
  plannedMinutes: number;
  remainingMinutes: number;
  overrun: boolean;
  resumed: boolean;
}

export interface AtlasState {
  profile: Profile;
  thoughts: Thought[];
  tasks: Task[];
  projects: Project[];
  investments: Investment[];
  corrections: Correction[];
  focus: FocusSession | null;
  protectedInvestment: "health" | "app";
  demoNow: string;
}
