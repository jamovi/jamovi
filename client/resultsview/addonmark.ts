
'use strict';

import { h } from '../common/htmlelementcreator';

// the addon an element is from (written by jmvcore), when it isn't its
// analysis'. unset, it's null, or has an empty ns
export type ElementAddon = { ns: string, name: string } | null | undefined;

// an addon which changed an element of its analysis', and, of a table, the
// columns (by name) it added or showed, the rows (by name) it added, the
// cells (of the analysis' own columns and rows) it changed, whether it
// changed the title, and the notes (by key) it added or changed
export type ElementAddonChange = {
    ns: string,
    name: string,
    columns?: string[],
    rows?: string[],
    cells?: { row: string, column: string }[],
    title?: boolean,
    notes?: string[],
};

// the titles of the installed modules, by name, sent with the results. an
// addon whose module isn't among them isn't installed
let moduleTitles: { [name: string]: string } = { };

export const setModuleTitles = (titles: { [name: string]: string } | undefined) => {
    moduleTitles = titles ?? { };
};

export const addonKey = (addon: ElementAddon): string => {
    if ( ! addon || ! addon.ns)
        return '';
    return `${ addon.ns }::${ addon.name }`;
};

export const cellKey = (row: string, column: string) => `${ row }\u001f${ column }`;

// what addons changed in a table: its columns, rows and cells (each with the
// module, ns, of the addon), whether its title, and which notes
export const tableChanges = (changes: ElementAddonChange[] | undefined) => {
    const columns = new Map<string, string>();
    const rows = new Map<string, string>();
    const cells = new Map<string, string>();
    const notes = new Set<string>();
    let title = false;
    for (let change of changes ?? [ ]) {
        for (let column of change.columns ?? [ ])
            columns.set(column, change.ns);
        for (let row of change.rows ?? [ ])
            rows.set(row, change.ns);
        for (let cell of change.cells ?? [ ])
            cells.set(cellKey(cell.row, cell.column), change.ns);
        for (let note of change.notes ?? [ ])
            notes.add(note);
        title = title || !! change.title;
    }
    return { columns, rows, cells, notes, title };
};

// the class of each part of an element an addon changed (a table's cells,
// headers, title, notes), highlighted while its mark is hovered, focused or
// pressed (see View.setAddonHighlight())
export const CHANGED_CLASS = 'jmv-addon-changed';

const isInstalled = (ns: string) => ns in moduleTitles;

const markText = (ns: string, kind: 'added' | 'modified'): string => {
    const installed = isInstalled(ns);
    const module = installed ? moduleTitles[ns] : ns;
    if (kind === 'added') {
        if ( ! installed)
            return _("Added by the {module} module, which isn't installed", { module });
        return _('Added by the {module} module', { module });
    }
    else {
        if ( ! installed)
            return _("Modified by the {module} module, which isn't installed", { module });
        return _('Modified by the {module} module', { module });
    }
};

// the mark of an element an addon added or changed: a button, part of the
// element's title (the element places it, see View.placeAddonMark()), which
// says which module, and highlights what it added or changed while it's
// hovered or focused, or pressed. an element an addon added is only marked
// when its parent isn't from the same addon. null is returned (and mark
// removed) when there's nothing to mark
export const updateAddonMark = (
        mark: HTMLButtonElement | null,
        addon: ElementAddon,
        changes: ElementAddonChange[] | undefined,
        parentKey: string): HTMLButtonElement | null => {

    const lines: string[] = [ ];
    let installed = true;

    const key = addonKey(addon);
    if (key !== '' && key !== parentKey) {
        lines.push(markText(addon!.ns, 'added'));
        installed = installed && isInstalled(addon!.ns);
    }
    for (let change of changes ?? [ ]) {
        if ( ! change.ns)
            continue;
        lines.push(markText(change.ns, 'modified'));
        installed = installed && isInstalled(change.ns);
    }

    if (lines.length === 0) {
        mark?.remove();
        return null;
    }

    if (mark === null) {
        mark = h('button', {
            type: 'button',
            class: 'jmv-results-addon-mark',
            'aria-pressed': 'false',
        }) as HTMLButtonElement;
    }
    const text = lines.join('\n');
    mark.title = `${ text }\n${ _('Select to keep what it changed highlighted') }`;
    mark.setAttribute('aria-label', `${ lines.join('. ') }. ${ _('Highlight what it changed') }`);
    mark.classList.toggle('not-installed', ! installed);
    return mark;
};
