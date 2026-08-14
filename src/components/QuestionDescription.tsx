/**
 * QuestionDescription — todo 14. Pure presentational block rendering the
 * CURRENT question's title + description (题目描述 instruction text).
 *
 * Rendered ABOVE the panels in GameScreen for BOTH modes (spot-diff and
 * find-area): `description` is REQUIRED on every Question (shared/types.ts,
 * z.string().min(1)) and stays visible during gameplay — it tells the player
 * WHAT to look for. No state, no handlers, no image logic.
 */
export interface QuestionDescriptionProps {
  /** Question title — headline above the instruction text. */
  title: string;
  /** 题目描述 instruction text — required, always visible during gameplay. */
  description: string;
}

export function QuestionDescription({
  title,
  description,
}: QuestionDescriptionProps) {
  return (
    <section className="question-description" aria-label="题目说明">
      <h2 className="question-description__title" data-testid="question-title">
        {title}
      </h2>
      <p
        className="question-description__text"
        data-testid="question-description"
      >
        {description}
      </p>
    </section>
  );
}
