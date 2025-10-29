
import { IElement } from "./hydrate";

function _latexify(item: IElement): Array<string> {

    let chunks = [];

    if (item.type === 'group') {
        if (item.title)
            chunks.push(`% heading goes here (${ item.title })\n`);
        for (let child of item.items)
            chunks = [...chunks, ..._latexify(child)];
    }
    else if (item.type === 'image') {
        chunks.push('% image goes here\n');
    }
    else if (item.type === 'table') {
        chunks.push(`% table goes here (${ item.title })\n`);
    }

    return chunks;
}

export function latexify(hydrated: IElement): string {

    let chunks = [ ];
    chunks.push('\\begin{document}\n');

    chunks = [...chunks, ..._latexify(hydrated)];

    chunks.push('\\end{document}\n');
    return chunks.join('');
}

