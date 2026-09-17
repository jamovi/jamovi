import { marked } from 'marked';

const urlAttributes = new Set([
    'background',
    'cite',
    'data',
    'href',
    'longdesc',
    'ping',
    'poster',
    'src',
    'action',
    'formaction',
    'manifest',
    'xlink:href',
]);

export type HTMLAttributes = {[attr: string]: string};
export type SafeHTMLAttributes = HTMLAttributes & { readonly __safeHtmlAttributes: unique symbol };
export type RichOptions = {
    tags?: readonly string[];
    attributes?: Partial<Record<string, readonly string[]>>;
    linkTarget?: '_blank';
};

export const richDescriptionOptions: RichOptions = {
    tags: [ 'b', 'em', 'i', 'strong', 'sub', 'sup', 'a', 'ol', 'ul', 'li'],
    attributes: {
        a: ['href', 'title'],
    },
};

export const richBaseOptions: RichOptions = {
    tags: [ 'em', 'i', 'sub', 'sup']
};

export const richBoldOptions: RichOptions = {
    tags: [ 'b', 'em', 'i', 'strong', 'sub', 'sup']
};

export const richMarkdownOptions: RichOptions = {
    tags: [ 'b', 'strong', 'em', 'i', 's', 'strike', 'del', 'sub', 'sup', 'a', 'ol', 'ul', 'li'],
    attributes: {
        a: ['href', 'title'],
    },
};

function asSafeHTMLAttributes(attributes: HTMLAttributes): SafeHTMLAttributes {
    return attributes as SafeHTMLAttributes;
}

/**
 * Builds trusted DOM structure.
 * Safe use: pass plain strings for untrusted text; only pass trusted
 * attributes and trusted Node children.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K ='div' as K, attributes: HTMLAttributes = {}, ...children: Array<string | Node>) : HTMLElementTagNameMap[K] {
    let element = document.createElement(tag);
    applyTrustedAttrs(element, attributes);
    for (let child of children) {
        if (typeof child !== 'string')
            element.append(child);
        else
            element.append(document.createTextNode(child));
    }
    return element;
};

/**
 * Converts input into a text node.
 * Safe use: use when you want explicit text-node construction rather than
 * passing a raw string child.
 */
export function text(input: string): Text {
    return document.createTextNode(input);
}

/**
 * Parses a trusted HTML string into an element.
 * Safe use: only use with already-trusted HTML, such as fixed internal markup
 * or HTML generated entirely by trusted application code.
 */
export function htmlTrusted<T extends HTMLElement> (html: string) : T {
    let template = document.createElement('template');
    template.innerHTML = html.trim(); // trim to avoid whitespace nodes
    let child = template.content.firstElementChild;
    if (child === null)
        throw new Error('htmlTrusted() expected trusted HTML with a root element.');
    return child as T;
}

/**
 * Applies trusted attributes directly to an existing element.
 * Safe use: only use with internal, trusted attribute names and values.
 */
function applyTrustedAttrs<T extends Element>(element: T, attributes: HTMLAttributes = {}): T {
    for (let attribute in attributes) {
        let value = attributes[attribute];
        if (value !== undefined)
            element.setAttribute(attribute, value.toString());
    }
    return element;
}

/**
 * Applies attributes that have already been filtered into SafeHTMLAttributes.
 * Safe use: pass the result of attrs(...), not a raw attribute bag.
 */
export function setSafeAttrs<T extends Element>(element: T, attributes: SafeHTMLAttributes): T {
    return applyTrustedAttrs(element, attributes);
}

/**
 * Filters a raw attribute bag and applies the safe result to an element.
 * Safe use: use when attribute values may be partially untrusted.
 */
export function setAttrsSafely<T extends Element>(element: T, attributes: HTMLAttributes = {}): T {
    return setSafeAttrs(element, attrs(attributes));
}

/**
 * Replaces an element's content with plain text.
 * Safe use: use for untrusted text when no HTML markup should survive.
 */
export function setText<T extends Element>(element: T, input: string): T {
    element.replaceChildren(document.createTextNode(input));
    return element;
}

/**
 * Replaces an element's content with sanitized whitelist-rich content.
 * Safe use: use for untrusted text that may contain only the allowed inline tags.
 */
export function setRich<T extends Element>(element: T, input: string, options?: RichOptions): T {
    element.replaceChildren(rich(input, options));
    return element;
}

/**
 * Reduces an untrusted URL value to an allowed URL or a fallback.
 * Safe use: use for href/src/action-like values before setting them on elements.
 */
export function url(value: string, fallback: string = ''): string {
    let trimmed = value.trim();

    if (trimmed === '')
        return fallback;

    if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\'))
        return fallback;

    if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../'))
        return trimmed;

    try {
        let url = new URL(trimmed, 'https://jamovi.invalid');

        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:')
            return trimmed;
    }
    catch (e) {
        return fallback;
    }

    return fallback;
}

/**
 * Filters a raw attribute bag into SafeHTMLAttributes.
 * Safe use: use when attribute values may be partially untrusted before passing
 * them to h(...) or setSafeAttrs(...).
 */
export function attrs(attributes: HTMLAttributes): SafeHTMLAttributes {
    let safe: HTMLAttributes = {};

    for (let attribute in attributes) {
        let value = attributes[attribute];

        if (value === undefined)
            continue;

        let lowerAttribute = attribute.toLowerCase();

        if (lowerAttribute.startsWith('on'))
            continue;

        if (lowerAttribute === 'style' || lowerAttribute === 'srcdoc' || lowerAttribute === 'srcset')
            continue;

        if (urlAttributes.has(lowerAttribute)) {
            let safeValue = url(value);
            if (safeValue === '')
                continue;
            safe[attribute] = safeValue;
            continue;
        }

        safe[attribute] = value;
    }

    return asSafeHTMLAttributes(safe);
}

/**
 * Builds a node sanitizer bound to a given whitelist.
 * A tag in `blockTags` that isn't itself allowed is collapsed onto a plain
 * <p>, rather than being flattened inline like any other disallowed tag --
 * used to keep markdown's block structure (paragraphs, headings, list items)
 * legible once their own semantics have been stripped.
 */
function createSanitizer(options: RichOptions, blockTags: ReadonlySet<string> = new Set()) {
    let allowedTags = new Set(options.tags ?? richBaseOptions.tags);
    let allowedAttributes = options.attributes ?? {};

    function sanitizeAttributes(element: HTMLElement, tag: string): SafeHTMLAttributes {
        let tagAttributes = allowedAttributes[tag] ?? [];
        let rawAttributes: HTMLAttributes = {};

        for (let attribute of tagAttributes) {
            let value = element.getAttribute(attribute);
            if (value !== null)
                rawAttributes[attribute] = value;
        }

        return attrs(rawAttributes);
    }

    function sanitizeNode(node: Node): Node[] {
        if (node.nodeType === Node.TEXT_NODE)
            return [document.createTextNode(node.textContent ?? '')];

        if (node.nodeType !== Node.ELEMENT_NODE)
            return [];

        let element = node as HTMLElement;
        let tag = element.tagName.toLowerCase();

        if (tag === 'script' || tag === 'style')
            return [];

        let sanitizedChildren = Array.from(element.childNodes)
            .flatMap(child => sanitizeNode(child));

        if (allowedTags.has(tag)) {
            let safeAttributes = sanitizeAttributes(element, tag);

            if (tag === 'a' && safeAttributes.href === undefined)
                return sanitizedChildren;

            let cleanElement = document.createElement(tag);
            setSafeAttrs(cleanElement, safeAttributes);
            if (tag === 'a' && options.linkTarget === '_blank') {
                cleanElement.setAttribute('target', '_blank');
                cleanElement.setAttribute('rel', 'noopener noreferrer');
            }
            cleanElement.append(...sanitizedChildren);
            return [cleanElement];
        }

        if (blockTags.has(tag)) {
            let p = document.createElement('p');
            p.append(...sanitizedChildren);
            return [p];
        }

        return sanitizedChildren;
    }

    return sanitizeNode;
}

/**
 * Sanitizes untrusted text into a DocumentFragment containing only the allowed
 * inline tags and safe text nodes.
 * Safe use: use when limited rich text is allowed inside element content.
 */
export function rich(input: string | null | undefined, options: RichOptions = richBaseOptions): DocumentFragment {
    let template = document.createElement('template');
    let fragment = document.createDocumentFragment();

    // an absent value renders as nothing rather than tearing down the whole render
    if (input === null || input === undefined)
        return fragment;

    // Escape ampersands first so input entities such as &amp; remain literal text.
    template.innerHTML = String(input).replace(/&/g, '&amp;');

    let sanitizeNode = createSanitizer(options);
    fragment.append(...Array.from(template.content.childNodes).flatMap(node => sanitizeNode(node)));
    return fragment;
}

// block-level tags markdown source can produce, that get collapsed onto a
// plain <p> (rather than flattened inline) when not themselves whitelisted
const markdownBlockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);

/**
 * Renders untrusted markdown into a sequence of sanitized nodes, one per
 * top-level block. Only inline/list/link markup allowed by `options` keeps
 * its semantics; anything else (headings, blockquotes, ...) is stripped down
 * to plain text the same way a disallowed literal HTML tag is by `rich()`,
 * but still lands on its own line rather than running into its neighbours.
 * Safe use: use for untrusted markdown text, such as content authored from R.
 */
export function richMarkdown(input: string | null | undefined, options: RichOptions = richMarkdownOptions): Node[] {
    if (input === null || input === undefined)
        return [];

    // marked may pass raw inline/block HTML in the source straight through;
    // that's fine, since the sanitizer below strips it down to `options`
    // exactly as it would for any other untrusted HTML.
    let html = marked.parse(String(input), { gfm: true, breaks: false, async: false }) as string;

    // marked leaves HTML entity references (e.g. &mdash;, &nbsp;, &#8212;) as-is
    // in text, trusting the browser to decode them -- but markdown content isn't
    // meant to double as an HTML-entity escape hatch, so anything other than the
    // handful of entities marked itself relies on to escape a literal <, >, &, "
    // or ' is re-escaped, so it renders as plain text instead of being decoded
    html = html.replace(/&(?!amp;|lt;|gt;|quot;|#39;)([a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);/g, '&amp;$1;');

    // marked pretty-prints its own block tags onto separate lines; that
    // formatting whitespace isn't part of the content, so drop it before it
    // can turn into stray text nodes once those tags are stripped or kept
    html = html.replace(/>[ \t]*\n[ \t]*</g, '><');

    let template = document.createElement('template');
    template.innerHTML = html;

    let sanitizeNode = createSanitizer(options, markdownBlockTags);

    return Array.from(template.content.childNodes)
        .flatMap(node => sanitizeNode(node))
        // drop the (now only meaningful) blank text nodes between top-level
        // blocks -- paragraph separation is carried by the <p> wrapping above
        .filter(node => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() !== '');
}

/**
 * Splits untrusted text into paragraphs containing sanitized whitelist-rich
 * content. Blank paragraphs are omitted.
 */
export function richParagraphs(input: string, options?: RichOptions): HTMLParagraphElement[] {
    return input
        .replace(/<\/?br\b[^>]*>/gi, '\n') // </br> is not valid HTML but exists in some legacy module descriptions.
        .replace(/\r\n?/g, '\n')
        .split(/(?:[ \t]*\n){2,}/)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph.length > 0)
        .map(paragraph => h('p', {}, rich(paragraph, options)));
}
