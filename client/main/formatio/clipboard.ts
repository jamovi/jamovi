
// what's put on the clipboard when results are copied: which flavours, and
// what's in each. kept apart from ResultsPanel (which gathers the pieces --
// hydrating, fetching the rendered image) and host.ts (which does the
// writing), so it can be tested on its own

import { IElement } from './hydrate';
import { htmlify, createDoc as createHtmlDoc, IDocItem } from './htmlify';
import { markdownify, createDoc as createMarkdownDoc } from './markdownify';
import { IReference } from '../references';

// a key is only present when it's set -- electron's handler tests for
// 'image' in it (see electron/app/main.js)
export interface IClipboardData {
    html?: string;
    text?: string;
    image?: string;   // a png, as a data url
    svg?: string;
}

// an image as the results view renders it (cf. resultsview/main.ts's
// getcontent). empty when it isn't rendered (it may be hidden)
export interface IRenderedImage {
    image?: string;    // a png, as a data url
    svg?: string;
    vector?: boolean;  // an Image showing a vector (an Svg element isn't)
}

export interface IClipboardOptions {
    showSyntax?: boolean;   // syntax is copied only where the results view is showing it
}

export interface IClipboardDocOptions extends IClipboardOptions {
    references?: Array<IReference>;
    showRefs?: boolean;
}

// a single analysis, or an element/group within one. it's given twice: as
// hydrated for html (verbatimHtml, with its images filled in -- see
// ResultsPanel._fillImages()), and as parsed for markdown (see
// IHydrateOptions.verbatimHtml). an image's picture comes from the results
// view instead (rendered)
export function clipboardData(hydrated: IElement, parsed: IElement, rendered: IRenderedImage | null, options: IClipboardOptions = {}): IClipboardData {
    const data: IClipboardData = { };

    if (hydrated.type === 'image') {
        // an image has no text flavour, so it pastes as the image wherever
        // one's accepted. the png goes on as an image flavour proper --
        // chat apps (chatgpt, gemini) and the like only take a pasted image
        // from that, and otherwise fall back to the html (where they strip
        // the <img>, leaving just the title) or the text. when it's a
        // vector Image, it's also offered as a real image/svg+xml flavour
        // (see host.copyToClipboard); an Svg element's markup leans on
        // module css and hasn't been paste-tested as a standalone flavour,
        // so it's rasterised only, same as a raster Image
        if (rendered?.image)
            hydrated.path = rendered.image;
        data.html = htmlify(hydrated, options);
        if (rendered?.image)
            data.image = rendered.image;
        if (rendered?.vector && rendered.svg)
            data.svg = rendered.svg;
        return data;
    }

    data.html = htmlify(hydrated, options);

    // the text flavour is markdown, which most places that take text over
    // html (chat apps, slack, editors) render, and which otherwise still
    // reads fine. a lone preformatted (the syntax, say) is its plain text
    // though, unfenced, so it pastes cleanly into an editor
    let text: string;
    if (hydrated.type === 'preformatted')
        text = hydrated.content;
    else
        text = markdownify(parsed, options);
    if (text)
        data.text = text;

    return data;
}

// the whole document, with its references (as clipboardData(), the items
// are given twice)
export function clipboardDocData(hydrated: Array<IDocItem>, parsed: Array<IDocItem>, options: IClipboardDocOptions = {}): IClipboardData {
    const data: IClipboardData = {
        html: createHtmlDoc(hydrated, options),
    };
    const text = createMarkdownDoc(parsed, options);
    if (text)
        data.text = text;
    return data;
}

// the flavours as the web clipboard api has them (a ClipboardItem's), by
// mime type. the svg goes on only where the clipboard can take it as a
// vector flavour proper (see host.ts's supportsSvgFlavour())
export function clipboardFlavours(data: IClipboardData, supportsSvg: boolean): { [ mimeType: string ]: string } {
    const flavours: { [ mimeType: string ]: string } = { };
    if (data.text)
        flavours['text/plain'] = data.text;
    if (data.html)
        flavours['text/html'] = data.html;
    if (data.image)
        flavours['image/png'] = data.image;
    if (data.svg && supportsSvg)
        flavours['image/svg+xml'] = data.svg;
    return flavours;
}
