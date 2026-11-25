// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { insideProject } from '../../../core/project-root.js';
import { nameOf } from './item-names.js';
/**
 * The patterns for a file the report names inside the project, or `undefined`: a display path is relative only where
 * the file lies under the project root (`path-display-and-share` R1), and a rule written from an absolute path or one
 * that climbs out would protect something the page cannot name for the person. A shared page writes nothing (P46).
 */
export function protectPatterns(path, shared) {
    // With no root given, only a relative path that does not climb is inside; `~` names a home, whatever `isAbsolute` says.
    if (shared || path.startsWith('~') || !insideProject(path, { kind: 'absent' }))
        return undefined;
    return { exact: './' + path.replace(/^\.\//, ''), every: '**/' + nameOf(path) };
}
