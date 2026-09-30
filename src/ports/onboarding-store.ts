/**
 * Whether a person finished the onboarding (`.ai/specs/2026-09-24-onboarding.md` W21-W26): for this project, so it
 * never opens here again, and for any project, so the intro plays once per person. Project names and moments only -
 * the choices themselves live in the files they were written to.
 */
export interface OnboardingReading {
  /** This project's onboarding was finished. */
  readonly here: boolean;
  /** Some project's was, this one's or another's. */
  readonly anywhere: boolean;
  /**
   * The record exists and could not be read. Nothing is guessed from it: a record that is there belongs to someone who
   * has been here, so the caller does not open the onboarding again (W23).
   */
  readonly failed: boolean;
}

/** One person's record, kept outside every repository, built for the project of the run. Appended to, never rewritten. */
export interface OnboardingStore {
  read(): Promise<OnboardingReading>;
  /** `false` where the line could not be written; the caller says so (W26). */
  add(at: number): Promise<boolean>;
  /**
   * W25a: this project's onboarding is to be offered again - agentwhy was uninstalled from it. Appended like the rest;
   * a `done` line counts for this project only where no reset comes after it. `false` where it could not be written.
   */
  reset(at: number): Promise<boolean>;
  /**
   * Which of these projects - by the names the record keeps them under - have finished the onboarding, reset or not by
   * the same rule as `here`: for the list of a person's projects (`.ai/specs/2026-09-27-which-project.md` V10).
   * `undefined` where the record could not be read, so no project is said to be set up or not from a guess.
   */
  doneFor(projects: readonly string[]): Promise<ReadonlySet<string> | undefined>;
}
