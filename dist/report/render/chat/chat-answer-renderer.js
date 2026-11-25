import { answerText } from '../../answers/answer-text.js';
import { conversationAnswer } from '../../answers/conversation-answer.js';
import { translator } from '../report-copy.js';
import { chatAnswer } from './chat-answer.js';
import { cardView, diagramView, foldersView, stepsView, tableView } from './chat-views.js';
/** Each view by its word - a record over the closed list, so a word added to it does not compile until it draws something. */
const VIEWS = {
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
export class ChatAnswerRenderer {
    #choice;
    constructor(choice) {
        this.#choice = choice;
    }
    render(report) {
        const t = translator(this.#choice.lang);
        if (this.#choice.json === true)
            return JSON.stringify(conversationAnswer(report, t, this.#choice.done)) + '\n';
        if (this.#choice.answer !== undefined)
            return answerText(conversationAnswer(report, t, this.#choice.done), this.#choice.answer, t);
        return this.#choice.view === undefined ? chatAnswer(report, t) : VIEWS[this.#choice.view](report, t);
    }
}
