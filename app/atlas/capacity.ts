import type { Task } from "./types";

export interface CapacityResult {
  availableMinutes: number;
  plannedMinutes: number;
  bufferMinutes: number;
  label: string;
}

export function calculateCapacity(tasks: Task[]): CapacityResult {
  const tonight = tasks.filter(
    (task) =>
      task.section !== "Tomorrow" &&
      task.section !== "Workday" &&
      task.section !== "Morning" &&
      task.status !== "Completed",
  );
  const plannedMinutes = tonight.reduce((sum, task) => sum + task.minutes, 0);
  const availableMinutes = 135;
  const bufferMinutes = Math.max(0, availableMinutes - plannedMinutes);

  return {
    availableMinutes,
    plannedMinutes,
    bufferMinutes,
    label: "2 hr 15 min",
  };
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

