// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Renderer } from '../../../shared/renderer.ts';
import type { ReportModel } from '../../report-model.ts';
import { answerText } from '../../answers/answer-text.ts';
import { conversationAnswer } from '../../answers/conversation-answer.ts';
import { translator, type Translate } from '../report-copy.ts';
import { chatAnswer } from './chat-answer.ts';
import type { ChatChoice, ChatView } from './chat-choice.ts';
import { cardView, diagramView, foldersView, stepsView, tableView } from './chat-views.ts';

/** Each view by its word - a record over the closed list, so a word added to it does not compile until it draws something. */
const VIEWS: Readonly<Record<ChatView, (report: ReportModel, t: Translate) => string>> = {
  steps: (report, t) => stepsView(report, t),
  folders: (report, t) => foldersView(report, t),
  table: (report, t) => tableView(report, t),
  diagram: (report, t) => diagramView(report, t),
  card: (report, t) => cardView(report, t),
};

/**
 * `agentwhy why` in the chat (`2026-11-20-ask-your-ai-why.md` AY1): the report's own model, drawn as Markdown an AI shows
 * as it is printed. Chosen by `why` in the composition root beside the terminal's renderer, so nothing `report` prints
 * changes.
 */
export class ChatAnswerRenderer implements Renderer<ReportModel> {
  readonly #choice: ChatChoice;

  constructor(choice: ChatChoice) {
    this.#choice = choice;
  }

  render(report: ReportModel): string {
    const t = translator(this.#choice.lang);
    if (this.#choice.json === true) return JSON.stringify(conversationAnswer(report, t, this.#choice.done)) + '\n';
    if (this.#choice.answer !== undefined) return answerText(conversationAnswer(report, t, this.#choice.done), this.#choice.answer, t);
    return this.#choice.view === undefined ? chatAnswer(report, t) : VIEWS[this.#choice.view](report, t);
  }
}
