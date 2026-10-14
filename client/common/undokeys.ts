'use strict';

// whether a key press is an undo or a redo meant for the shared history
// (see History in the server). text being edited (an annotation, a heading,
// a text box) keeps its own undo, as the edit isn't sent until it's
// finished; it's then a single change in the shared history
export function getUndoRedoAction(event: KeyboardEvent): 'undo' | 'redo' | null {

    if ( ! (event.ctrlKey || event.metaKey) || event.altKey)
        return null;

    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
        return null;
    if (target instanceof HTMLElement && target.isContentEditable)
        return null;

    const key = event.key.toLowerCase();
    if (key === 'z')
        return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && ! event.shiftKey)
        return 'redo';
    return null;
}
