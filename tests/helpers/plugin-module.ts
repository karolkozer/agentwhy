// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { registerHooks } from 'node:module';

/**
 * The plugin's module names its neighbours with `.js`, as Claude Code's own check of a plugin asks (2.1.330 refuses `.ts` in
 * `claude plugin validate --strict`, CVB30), and Node runs the `.ts` beside it. Loaded before the module, which is then imported.
 */
registerHooks({
  resolve: (specifier, context, next) =>
    next(specifier.startsWith('./') && specifier.endsWith('.js') && context.parentURL?.includes('/hooks/terminal/') === true ? specifier.replace(/\.js$/, '.ts') : specifier, context),
});
