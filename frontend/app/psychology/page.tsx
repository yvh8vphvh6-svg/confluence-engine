"use client";

import MCQuiz from "../../components/MCQuiz";
import { PSYCHOLOGY } from "../../lib/quizzes";

export default function PsychologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Psychology</h1>
        <p className="text-sm text-muted">
          The hardest part of trading is you. Work through tilt, FOMO, loss acceptance, patience, overtrading and
          revenge — pick the best response, learn why, and track which biases show up most. Not financial advice.
        </p>
      </header>
      <MCQuiz cards={PSYCHOLOGY} storageKey="ce_psychology_v1" />
    </div>
  );
}
