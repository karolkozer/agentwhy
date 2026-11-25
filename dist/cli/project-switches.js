/**
 * `agentwhy` in the folder it was typed in, and every project a page switches to after it, in this one process
 * (`.ai/specs/2026-09-27-which-project.md` V14, V18). A switch starts `start` for the chosen folder with the range the page
 * was drawn with; the page is answered with the new run's address once that run serves, and the run it came from ends.
 * A run that ends before it serves - nothing there to show, a folder that cannot be read - answers the page with what it
 * said, and nothing else changes. The terminal is given back when the last run shown has ended: Ctrl+C there stops it,
 * as it stopped the first.
 *
 * `write` is given each run's result as it ends; the last one's is returned for the shell to write and exit with.
 */
export async function runSwitching(runIn, workingDirectory, argv, write) {
    const shown = [];
    const past = [];
    // AP13: the process is the agentwhy plugin's whichever project it shows, so the runs a switch starts are its too. Only
    // a served page asks for a switch, so only `start --plugin` reaches here with the flag.
    const carried = argv.includes('--plugin') ? ['--plugin'] : [];
    const seams = (folder, handedOver, arrivedFrom) => ({
        switchTo: (folder, since, from) => new Promise((resolve) => {
            let answered = false;
            const run = runIn(folder, ['start', '--since', since, ...carried], seams(folder, (url) => {
                answered = true;
                shown.push(run);
                resolve({ url });
            }, from));
            run.then((result) => {
                if (!answered)
                    resolve({ failed: reasonOf(result) });
            }, (error) => {
                if (!answered)
                    resolve({ failed: error instanceof Error ? error.message : String(error) });
            });
        }),
        ...(handedOver === undefined ? {} : { handedOver }),
        ...(arrivedFrom === undefined ? {} : { arrivedFrom }),
        served: (token) => { past.push({ token, folder }); },
        pastRuns: () => past,
    });
    let result = await runIn(workingDirectory, argv, seams(workingDirectory));
    for (let at = 0; at < shown.length; at += 1) {
        write(result);
        result = await shown[at];
    }
    return result;
}
/** What a run that never served said, as one line a page can show. */
function reasonOf(result) {
    const said = result.kind === 'completed' ? result.output : result.kind === 'hook-block' ? result.reason : result.kind === 'usage-error' ? result.message : result.usage;
    return said.trim().split('\n')[0] || 'agentwhy could not show that project.';
}
