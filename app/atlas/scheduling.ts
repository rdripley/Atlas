import type { Investment, Task } from "./types";

export function recommendedPlan(tasks: Task[], investments: Investment[]) {
  const responsibilities = tasks
    .filter((task) => task.kind === "Responsibility" && task.status !== "Completed")
    .slice(0, 2);
  const app = investments.find((investment) => investment.id === "app");

  return {
    responsibilities,
    investment: {
      title: "Build Atlas",
      minutes: 60,
      protected: true,
      context: app?.completedMinutes === 0 ? "No App Development time completed this week." : "Keep momentum on App Development.",
    },
    buffer: 25,
  };
}

export function effortWarning(tasks: Task[]) {
  const hardTasks = tasks.filter(
    (task) =>
      task.status !== "Completed" &&
      (task.title.toLowerCase().includes("vacation") || task.title.toLowerCase().includes("sink")),
  );
  return hardTasks.length > 1
    ? "This evening already has enough high-decision or emotional work."
    : null;
}

