import { cardPage } from '../report/render/card/card-page.js';
/** What the card's server asks, answered by the commands a person can run themselves: the same readers, the same words. */
export function cardAnswers({ lang, why, server, self, atHome, now }) {
    const outputOf = async (command, args) => {
        const result = await command.execute(args);
        return result.kind === 'completed' ? result.output.trim() : '';
    };
    return {
        lang,
        here: atHome ? 'computer' : 'project',
        self,
        conversation: async (key, callId, lang) => {
            const output = await outputOf(why, ['--plugin', ...(key === undefined ? [] : ['--session', key]), ...(callId === undefined ? [] : ['--without-call', callId]), '--lang', lang, '--json']);
            return output.startsWith('{') ? JSON.parse(output) : output;
        },
        list: (scope, asked) => server.ask(scope, asked),
        peek: (scope) => server.peek(scope),
        address: (scope) => server.address(scope),
        open: (scope, key) => server.open(scope, key),
        card: cardPage,
        now,
    };
}
