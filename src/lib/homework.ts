import { type HomeworkExercise, type MatchingPair } from "@/lib/homework-types";

export function getExerciseTypeLabel(type: HomeworkExercise["type"]) {
  const labels: Record<HomeworkExercise["type"], string> = {
    "gap-fill": "Gap Fill",
    "multiple-choice": "Multiple Choice",
    "phrase-explanation": "Phrase Recall",
    matching: "Matching",
    "open-answer": "Open Answer",
    "error-correction": "Error Correction",
    "sentence-building": "Sentence Building",
  };

  return labels[type];
}

export function getInitialMeaningOrder(
  pairs: MatchingPair[],
  savedOrder?: string[],
) {
  if (savedOrder && savedOrder.length === pairs.length) {
    return [...savedOrder];
  }

  if (pairs.length <= 1) {
    return pairs.map((pair) => pair.right);
  }

  return [...pairs.slice(1).map((pair) => pair.right), pairs[0].right];
}
