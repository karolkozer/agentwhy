/** W15's order: the hook, the names, search protection, the switches, what is said. Nothing that cannot be written. */
export function onboardingChanges(choices, inForce) {
    const changes = [];
    if (choices.watch && inForce.canWrite && inForce.watch !== choices.scope) {
        changes.push({ change: 'watch', where: choices.scope, ...(inForce.watch === false ? {} : { from: inForce.watch }) });
    }
    const known = new Set(inForce.protected);
    const fresh = (names) => [...new Set(names.map((pattern) => pattern.trim()))].filter((pattern) => pattern !== '' && !known.has(pattern));
    // KD2: a row not watched starts on Block and has nothing to switch; Tell me puts its patterns on the told list, as an
    // added name's are.
    const toldRows = inForce.rows.filter((row) => !row.watched && row.mode === 'block' && choices.modes[row.key] === 'tell').flatMap((row) => row.patterns);
    const told = inForce.canTell ? [...new Set([...fresh(choices.tell), ...toldRows])] : [];
    const blocked = fresh(choices.protect).filter((pattern) => !told.includes(pattern));
    // KD2: Block is what the row says once Finish is done, so a row left on it gets the rules no file holds yet. A row
    // switched back to Block from Tell me is the switch's to write.
    const unruled = inForce.rows.filter((row) => row.mode === 'block' && !row.ruled && (choices.modes[row.key] ?? 'block') === 'block').map((row) => row.key);
    if ((blocked.length > 0 || unruled.length > 0) && inForce.canAdd)
        changes.push({ change: 'protect', patterns: blocked, rows: unruled });
    const switched = inForce.rows.flatMap((row) => {
        const to = choices.modes[row.key];
        return to !== undefined && to !== row.mode && row.switchable && inForce.canTell ? [{ change: 'mode', key: row.key, to }] : [];
    });
    // F38 as amended: Block keeps a file from searches too. An add and a switch back to Block install `refuse` themselves.
    const staysBlocked = inForce.rows.some((row) => row.watched && (choices.modes[row.key] ?? row.mode) === 'block');
    const installsRefuse = changes.some((change) => change.change === 'protect') || switched.some((change) => change.change === 'mode' && change.to === 'block');
    if (inForce.refuse === false && inForce.canWrite && staysBlocked && !installsRefuse)
        changes.push({ change: 'search', where: choices.scope });
    changes.push(...switched);
    if (told.length > 0)
        changes.push({ change: 'tell', patterns: told });
    // Rows 2 and 3 say nothing without the hook, and the page does not let them move while row 1 is off (W13).
    if (choices.watch && inForce.noticesWritable) {
        const on = choices.stopped === inForce.stopped ? undefined : choices.stopped ? 'refused' : 'value';
        const clean = choices.fine === inForce.fine ? undefined : choices.fine ? 'once' : 'off';
        if (on !== undefined || clean !== undefined) {
            changes.push({ change: 'notices', ...(on === undefined ? {} : { on }), ...(clean === undefined ? {} : { clean }) });
        }
    }
    // KRD5: last, as the newest - its own hook, which needs no other and is no message. WK5: where it is on without its write
    // check, the same change adds that entry alone (`ProjectSetup`'s older install).
    if (choices.hideKeys === true && (inForce.hideKeys !== true || inForce.hideKeysLacksWriteCheck === true) && inForce.canWrite)
        changes.push({ change: 'hide-keys' });
    return changes;
}
