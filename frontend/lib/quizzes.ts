// Shared shape for interactive "what do you do?" cards (Scenario Library +
// Psychology module). Each option carries a 0–10 score; the best answer is
// flagged; an explanation is revealed after choosing. Education only.
export type QuizOption = { text: string; score: number; best?: boolean };
export type QuizCard = {
  id: string;
  tag: string;            // category / pattern bucket for tracking
  prompt: string;         // the situation
  options: QuizOption[];
  explanation: string;
};

export const SCENARIOS: QuizCard[] = [
  {
    id: "sc-up3r",
    tag: "Greed / letting winners run",
    prompt: "You're up +3R on the day. A fresh, qualified A-setup appears in your plan. What do you do?",
    options: [
      { text: "Take it at your normal 1% risk — it fits the plan", score: 10, best: true },
      { text: "Skip it — you're up, don't risk giving it back", score: 5 },
      { text: "Take it but double size to press the good day", score: 1 },
      { text: "Take it with no stop so you don't get shaken out", score: 0 },
    ],
    explanation: "A qualified setup is a qualified setup regardless of P&L. Take it at NORMAL risk. Sizing up because you're 'playing with house money' is how green days turn red; skipping good setups out of fear leaves edge on the table.",
  },
  {
    id: "sc-down2r",
    tag: "Drawdown discipline",
    prompt: "You're down −2R (your daily loss limit). An A+ setup prints. What do you do?",
    options: [
      { text: "Honor the daily stop — done for the day, journal it", score: 10, best: true },
      { text: "Take it, this one's different and will get it back", score: 2 },
      { text: "Take it at half size to stay disciplined-ish", score: 4 },
      { text: "Double size to recover the day", score: 0 },
    ],
    explanation: "The daily loss limit exists precisely for moments that 'feel different'. After −2R your read and emotions are compromised. Stop, review, come back tomorrow. The market will have more A+ setups.",
  },
  {
    id: "sc-stop1tick",
    tag: "Process over outcome",
    prompt: "Your stop gets hit by exactly 1 tick, then price reverses and would have hit your target. What do you do?",
    options: [
      { text: "Nothing — the stop did its job; log it and move on", score: 10, best: true },
      { text: "Re-enter immediately to 'get it back'", score: 3 },
      { text: "Widen your stops on all future trades so it can't happen", score: 2 },
      { text: "Stop using stops — they just get hunted", score: 0 },
    ],
    explanation: "Getting stopped a tick before a reversal is normal variance, not a system flaw. Reacting by widening stops or removing them trades a small known loss for a large unknown one. If stop placement is systematically too tight, fix it in review with data — not on tilt.",
  },
  {
    id: "sc-news5",
    tag: "Event risk",
    prompt: "High-impact news drops in 5 minutes. You have a setup forming. What do you do?",
    options: [
      { text: "Wait for the news; let the spike settle, then trade structure", score: 10, best: true },
      { text: "Enter now to front-run the move", score: 2 },
      { text: "Enter now but with a much wider stop", score: 3 },
      { text: "Enter and add on the spike", score: 0 },
    ],
    explanation: "Around scheduled news, spreads widen and the first move often whipsaws. Front-running is a coin flip with bad slippage. Let the release pass, let a real structure form, then trade that with a normal stop.",
  },
  {
    id: "sc-norange",
    tag: "Patience",
    prompt: "It's a quiet, rangebound lunch session. You haven't traded in an hour and feel restless. What do you do?",
    options: [
      { text: "Wait — no qualified setup means no trade", score: 10, best: true },
      { text: "Take a marginal setup just to stay engaged", score: 2 },
      { text: "Drop to a lower timeframe to find 'something'", score: 3 },
      { text: "Fade random extremes to pass the time", score: 0 },
    ],
    explanation: "Boredom is not a signal. Low-volume ranges are where overtrading quietly bleeds accounts. No trade is a position. Save your risk for the killzones with real participation.",
  },
  {
    id: "sc-revenge",
    tag: "Revenge / tilt",
    prompt: "Two quick losses in a row. You feel the urge to immediately make it back. What do you do?",
    options: [
      { text: "Step away briefly; reset; only return on a planned setup", score: 10, best: true },
      { text: "Re-enter immediately, bigger, to recover", score: 0 },
      { text: "Flip your bias and trade the other way out of frustration", score: 1 },
      { text: "Keep clicking until you get one back", score: 0 },
    ],
    explanation: "Two losses can trigger tilt, where process is replaced by emotion. The cooldown after consecutive losses exists for this. Reset, reread your plan, and only act on a genuine setup — or call it a day.",
  },
];

export const PSYCHOLOGY: QuizCard[] = [
  {
    id: "ps-fomo",
    tag: "FOMO",
    prompt: "Price just ran 2R without you. It's still going. The urge to jump in is strong. Best response?",
    options: [
      { text: "Let it go; wait for a pullback to structure or the next setup", score: 10, best: true },
      { text: "Market-buy now so you don't miss more", score: 1 },
      { text: "Buy now with a tiny stop to limit the chase risk", score: 3 },
      { text: "Buy and tell yourself you'll add if it dips", score: 0 },
    ],
    explanation: "Chasing puts you in at the worst R:R right as a move exhausts. The feeling of missing out is not a setup. There's always another trade; entries come to those who wait for structure.",
  },
  {
    id: "ps-tilt",
    tag: "Tilt",
    prompt: "You're angry after a dumb mistake and your clicking is getting faster. What's the disciplined move?",
    options: [
      { text: "Hard stop: stand up, walk away, end the session if needed", score: 10, best: true },
      { text: "Trade smaller but keep going to 'work through it'", score: 4 },
      { text: "Take one big trade to reset your mood", score: 0 },
      { text: "Switch instruments for a fresh start", score: 2 },
    ],
    explanation: "Tilt degrades every decision. The only reliable fix is to stop trading and let the emotion clear. 'Working through it' usually compounds the damage.",
  },
  {
    id: "ps-lossaccept",
    tag: "Loss acceptance",
    prompt: "A trade is approaching your stop. Your finger hovers to move it 'just this once'. Best response?",
    options: [
      { text: "Leave the stop; accept the planned −1R as a cost of business", score: 10, best: true },
      { text: "Move the stop a little to give it room", score: 1 },
      { text: "Cancel the stop and watch it closely", score: 0 },
      { text: "Add to the position to lower your average", score: 0 },
    ],
    explanation: "Moving a stop converts a small, known loss into an unknown, potentially account-threatening one. The whole edge depends on losses staying ~1R. Accept it and move on.",
  },
  {
    id: "ps-patience",
    tag: "Patience",
    prompt: "Your A-setup checklist needs 4 conditions; only 3 are met. What do you do?",
    options: [
      { text: "Pass — an incomplete setup is not your edge", score: 10, best: true },
      { text: "Take it; 3 of 4 is close enough", score: 3 },
      { text: "Take it at full size; you have a 'feeling'", score: 1 },
      { text: "Lower your checklist to 3 conditions permanently", score: 0 },
    ],
    explanation: "Your edge is defined by the full setup, not most of it. Taking partial setups quietly widens your selection and erodes expectancy. Wait for the complete picture.",
  },
  {
    id: "ps-overtrade",
    tag: "Overtrading",
    prompt: "You've taken 6 trades in a slow morning and you're flat. The itch to keep going remains. Best move?",
    options: [
      { text: "Set a max-trades cap and stop for the session", score: 10, best: true },
      { text: "Keep trading — variance will turn", score: 2 },
      { text: "Increase size to make the activity worthwhile", score: 0 },
      { text: "Trade faster to find a winner", score: 0 },
    ],
    explanation: "High trade counts in poor conditions are the footprint of overtrading. Costs and marginal setups grind you down. A per-session trade cap protects you from yourself.",
  },
  {
    id: "ps-revenge2",
    tag: "Revenge",
    prompt: "You just gave back an open profit and closed for a small loss. The urge to immediately re-enter bigger is loud. Best response?",
    options: [
      { text: "Recognize it as revenge; take a break before any new trade", score: 10, best: true },
      { text: "Re-enter bigger to make the loss back fast", score: 0 },
      { text: "Re-enter same size immediately", score: 3 },
      { text: "Flip direction to catch the 'real' move", score: 1 },
    ],
    explanation: "Re-entering to 'get even' is the textbook revenge spiral — sizing and selection both degrade. Name the emotion, step back, and only return on a planned setup.",
  },
];
