"use client";

import MCQuiz from "../../components/MCQuiz";
import { SCENARIOS } from "../../lib/quizzes";

export default function ScenariosPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Scenario Library</h1>
        <p className="text-sm text-muted">
          &quot;What do you do?&quot; — realistic in-the-moment decisions. Pick an answer, see the score and the
          reasoning. Your tendencies are tracked on this device. Practice / not financial advice.
        </p>
      </header>
      <MCQuiz cards={SCENARIOS} storageKey="ce_scenarios_v1" />
    </div>
  );
}
