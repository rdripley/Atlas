import type { Correction, Prediction, Timing } from "./types";

const base: Prediction = {
  type: "Household request",
  size: "Small",
  minutes: 20,
  timing: "Whenever",
  mental: "Low",
  emotional: "Low",
  physical: "Low",
};

function includesAny(input: string, phrases: string[]) {
  return phrases.some((phrase) => input.includes(phrase));
}

export function inferThought(
  text: string,
  requestedTiming?: Timing,
  corrections: Correction[] = [],
): Prediction {
  const input = text.toLowerCase().trim();
  const learned = corrections
    .slice()
    .reverse()
    .find((item) => input.includes(item.phrase.toLowerCase()));

  if (learned) {
    return { ...learned.prediction, timing: requestedTiming ?? learned.prediction.timing };
  }

  let prediction = { ...base };

  if (input.includes("milk")) {
    prediction = { ...prediction, type: "Shopping item", size: "Tiny", minutes: 10, timing: "On the way home" };
  } else if (input.includes("dog food")) {
    prediction = { ...prediction, type: "Shopping item", size: "Small", minutes: 15, timing: "On the way home" };
  } else if (input.includes("talk") && input.includes("vacation")) {
    prediction = { ...prediction, type: "Conversation", size: "Small", minutes: 30, timing: "This week", emotional: "Medium" };
  } else if (includesAny(input, ["patch drywall", "hallway wall", "drywall"])) {
    prediction = {
      ...prediction,
      type: "Home project",
      size: "Large",
      minutes: 45,
      timing: "This week",
      project: "Patch hallway drywall",
      mental: "Medium",
      physical: "Medium",
    };
  } else if (includesAny(input, ["sink leaking", "sink is leaking", "leak"])) {
    prediction = { ...prediction, type: "Urgent home task", size: "Medium", minutes: 45, timing: "Urgent", mental: "Medium" };
  } else if (includesAny(input, ["workout", "work out", "walk"])) {
    prediction = { ...prediction, type: "Health investment", size: "Medium", minutes: 45, timing: "Today", physical: "High" };
  } else if (includesAny(input, ["work on my app", "developing atlas", "build atlas"])) {
    prediction = { ...prediction, type: "App Development investment", size: "Medium", minutes: 60, timing: "This week", mental: "High" };
  } else if (includesAny(input, ["pick up", "on the way home"])) {
    prediction = { ...prediction, type: "Errand", size: "Small", minutes: 20, timing: "On the way home" };
  }

  return { ...prediction, timing: requestedTiming ?? prediction.timing };
}

