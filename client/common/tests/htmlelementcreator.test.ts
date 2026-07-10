// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { attrs, h, htmlTrusted, rich, richBoldOptions, richDescriptionOptions, richParagraphs, setAttrsSafely, setSafeAttrs, setRich, setText, text, url } from '../htmlelementcreator';

function renderFragment(fragment: DocumentFragment): string {
    const container = document.createElement('div');
    container.append(fragment);
    return container.innerHTML;
}

function renderNodes(nodes: Node[]): string {
    const container = document.createElement('div');
    container.append(...nodes);
    return container.innerHTML;
}

describe('h', () => {
    it('appends sanitized fragments as child nodes', () => {
        const fragment = rich('Hello <strong>there</strong> <span>friend</span>');
        const element = h('div', {}, fragment);

        expect(element.innerHTML).toBe('Hello there friend');
    });

    it('accepts explicit text nodes', () => {
        const element = h('div', {}, text('<strong>hello</strong>'));

        expect(element.innerHTML).toBe('&lt;strong&gt;hello&lt;/strong&gt;');
    });

    it('accepts filtered attribute objects', () => {
        const element = h('a', attrs({
            href: 'https://example.com',
            onclick: 'alert(1)',
            title: 'Example',
        }), 'Open');

        expect(element.getAttribute('href')).toBe('https://example.com');
        expect(element.hasAttribute('onclick')).toBe(false);
        expect(element.getAttribute('title')).toBe('Example');
    });
});

describe('htmlTrusted', () => {
    it('parses trusted html into an element', () => {
        const element = htmlTrusted<HTMLDivElement>('<div class="status"></div>');

        expect(element.tagName).toBe('DIV');
        expect(element.className).toBe('status');
    });

    it('throws when trusted html has no root element', () => {
        expect(() => htmlTrusted('')).toThrow();
        expect(() => htmlTrusted('plain text')).toThrow();
    });
});

describe('rich', () => {
    it('returns a fragment that preserves text without reparsing it as html', () => {
        const fragment = rich('a < b && c > d');
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('a &lt; b &amp;&amp; c &gt; d');
    });

    it('preserves only base tags by default', () => {
        const fragment = rich('<p>Hello <strong>there</strong> <span>friend</span></p>');
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('Hello there friend');
    });

    it('strips attributes from allowed tags', () => {
        const fragment = rich('<em class="x" onclick="alert(1)">safe</em>');
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('<em>safe</em>');
    });

    it('drops script and style elements entirely', () => {
        const fragment = rich('<p>safe<script>alert(1)</script><style>p{color:red;}</style>text</p>');
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('safetext');
    });

    it('preserves sub and sup because they are explicitly whitelisted', () => {
        const fragment = rich('x<sub>1</sub> + y<sup>2</sup>');
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('x<sub>1</sub> + y<sup>2</sup>');
    });

    it('supports a base preset for base inline notation only', () => {
        const fragment = rich('<i>i</i><em>em</em><sub>1</sub><sup>2</sup><b>b</b><strong>strong</strong><a href="https://example.com">link</a>');

        expect(renderFragment(fragment)).toBe('<i>i</i><em>em</em><sub>1</sub><sup>2</sup>bstronglink');
    });

    it('supports a help preset with bold and base inline notation', () => {
        const fragment = rich('<b>b</b><strong>strong</strong><i>i</i><em>em</em><sub>1</sub><sup>2</sup><a href="https://example.com">link</a>', richBoldOptions);

        expect(renderFragment(fragment)).toBe('<b>b</b><strong>strong</strong><i>i</i><em>em</em><sub>1</sub><sup>2</sup>link');
    });

    it('strips links by default', () => {
        const fragment = rich('See <a href="https://example.com">docs</a>');
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('See docs');
    });

    it('preserves safe links when link options are supplied', () => {
        const fragment = rich('See <a href="https://example.com" title="Docs" class="x" onclick="alert(1)">docs</a>', richDescriptionOptions);
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('See <a href="https://example.com" title="Docs">docs</a>');
    });

    it('preserves lists when link options are supplied', () => {
        const fragment = rich('<ul class="x"><li>One</li><li><a href="https://example.com">Two</a></li></ul><ol><li><strong>Three</strong></li></ol>', richDescriptionOptions);

        expect(renderFragment(fragment)).toBe('<ul><li>One</li><li><a href="https://example.com">Two</a></li></ul><ol><li><strong>Three</strong></li></ol>');
    });

    it('can force safe links to open in a new tab', () => {
        const fragment = rich('<a href="https://example.com" target="_self" rel="opener">docs</a>', {
            ...richDescriptionOptions,
            linkTarget: '_blank',
        });

        expect(renderFragment(fragment)).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>');
    });

    it('unwraps links without safe href values', () => {
        const fragment = rich('See <a href="javascript:alert(1)" title="Docs">docs</a>', richDescriptionOptions);
        const container = document.createElement('div');

        container.append(fragment);

        expect(container.innerHTML).toBe('See docs');
    });

    it('preserves safe relative, fragment, mailto, and tel links', () => {
        expect(renderFragment(rich('<a href="/docs">docs</a>', richDescriptionOptions))).toBe('<a href="/docs">docs</a>');
        expect(renderFragment(rich('<a href="#section">section</a>', richDescriptionOptions))).toBe('<a href="#section">section</a>');
        expect(renderFragment(rich('<a href="mailto:test@example.com">email</a>', richDescriptionOptions))).toBe('<a href="mailto:test@example.com">email</a>');
        expect(renderFragment(rich('<a href="tel:+61255550000">phone</a>', richDescriptionOptions))).toBe('<a href="tel:+61255550000">phone</a>');
    });

    it('preserves allowed rich content inside safe links', () => {
        const fragment = rich('<a href="https://example.com"><strong>docs</strong> <em>now</em></a>', richDescriptionOptions);

        expect(renderFragment(fragment)).toBe('<a href="https://example.com"><strong>docs</strong> <em>now</em></a>');
    });

    it('drops unsafe nested content inside safe links', () => {
        const fragment = rich('<a href="https://example.com">ok<script>alert(1)</script><style>a{color:red;}</style>text</a>', richDescriptionOptions);

        expect(renderFragment(fragment)).toBe('<a href="https://example.com">oktext</a>');
    });

    it('scopes allowed attributes to their tag', () => {
        const fragment = rich('<strong title="Docs">safe</strong><a href="https://example.com" title="Docs">docs</a>', richDescriptionOptions);

        expect(renderFragment(fragment)).toBe('<strong>safe</strong><a href="https://example.com" title="Docs">docs</a>');
    });

    it('sanitizes uppercase link tags and attributes', () => {
        const fragment = rich('<A HREF="https://example.com" ONCLICK="alert(1)">docs</A>', richDescriptionOptions);

        expect(renderFragment(fragment)).toBe('<a href="https://example.com">docs</a>');
    });

    it('unwraps links with missing or empty href values', () => {
        expect(renderFragment(rich('<a title="Docs">docs</a>', richDescriptionOptions))).toBe('docs');
        expect(renderFragment(rich('<a href="">docs</a>', richDescriptionOptions))).toBe('docs');
    });
});

describe('url', () => {
    it('returns safe absolute, relative, and fragment urls', () => {
        expect(url('https://example.com')).toBe('https://example.com');
        expect(url('mailto:test@example.com')).toBe('mailto:test@example.com');
        expect(url('/files/report.omv')).toBe('/files/report.omv');
        expect(url('./local/file')).toBe('./local/file');
        expect(url('#section')).toBe('#section');
        expect(url('   /trimmed/path   ')).toBe('/trimmed/path');
    });

    it('returns the fallback for dangerous or unsupported urls', () => {
        expect(url('javascript:alert(1)', '#')).toBe('#');
        expect(url('data:text/html,<script>alert(1)</script>', '#')).toBe('#');
        expect(url('ftp://example.com/file.txt', '#')).toBe('#');
    });

    it('returns the fallback for protocol-relative urls', () => {
        expect(url('//evil.com', '#')).toBe('#');
        expect(url('/\\evil.com', '#')).toBe('#');
        expect(url('\\evil.com', '#')).toBe('#');
    });

    it('returns the fallback for an empty url', () => {
        expect(url('')).toBe('');
        expect(url('   ')).toBe('');
        expect(url('   ', '#')).toBe('#');
    });
});

describe('richParagraphs', () => {
    it('splits text into sanitized paragraphs', () => {
        const paragraphs = richParagraphs('First <strong>note</strong>\n\nSecond <span>note</span>');

        expect(renderNodes(paragraphs)).toBe('<p>First note</p><p>Second note</p>');
    });

    it('omits blank paragraphs', () => {
        const paragraphs = richParagraphs('\n\n First \n\n\n Second \n\n');

        expect(renderNodes(paragraphs)).toBe('<p>First</p><p>Second</p>');
    });

    it('splits paragraphs separated by lone carriage returns', () => {
        const paragraphs = richParagraphs('First\r\rSecond');

        expect(renderNodes(paragraphs)).toBe('<p>First</p><p>Second</p>');
    });

    it('normalizes br tags to newlines before splitting paragraphs', () => {
        const paragraphs = richParagraphs('First<br>Second<BR/>Third<br />Fourth<br class="break">Fifth');

        expect(renderNodes(paragraphs)).toBe('<p>First\nSecond\nThird\nFourth\nFifth</p>');
    });

    it('treats repeated br tags as blank lines after normalization', () => {
        const paragraphs = richParagraphs('Intro <br><br> * <b>First</b> item <br><br> * <b>Second</b> item', richDescriptionOptions);

        expect(renderNodes(paragraphs)).toBe('<p>Intro</p><p>* <b>First</b> item</p><p>* <b>Second</b> item</p>');
    });

    it('splits module descriptions separated by repeated br tags', () => {
        const paragraphs = richParagraphs('FoodieStats is a dedicated statistical module designed for gastronomy professionals, nutritionists and high-performance athletes. This module covers a range of critical aspects in food and beverage product development. <br><br> * <b>Food and Beverage Product Formulation</b> - Contains experimental design methods used in the creation of food and beverage products and their practical application within the food industry. <br><br> * <b>Sensory and Consumer Data</b> - Integrates methods and tools for in-depth sensory and consumer data analysis, emphasizing measurement scales, sensometrics, and various data collection methods. <br><br> * <b>Food Control and Machine Learning</b> - Includes food control and machine learning approaches to advance product development in the realm of gastronomy. <br><br> * <b>Food Science and Nutrition</b> - Utilizes health-focused analytics to optimize nutritional content.', richDescriptionOptions);

        expect(paragraphs).toHaveLength(5);
        expect(renderNodes(paragraphs)).toContain('<p>* <b>Food and Beverage Product Formulation</b>');
    });

    it('splits module descriptions separated by closing br tags', () => {
        const paragraphs = richParagraphs('FoodieStats is a dedicated statistical module designed for gastronomy professionals, nutritionists and high-performance athletes. This module covers a range of critical aspects in food and beverage product development. </br></br> * <b>Food and Beverage Product Formulation</b> - Contains experimental design methods used in the creation of food and beverage products and their practical application within the food industry. </br></br> * <b>Sensory and Consumer Data</b> - Integrates methods and tools for in-depth sensory and consumer data analysis, emphasizing measurement scales, sensometrics, and various data collection methods. </br></br> * <b>Food Control and Machine Learning</b> - Includes food control and machine learning approaches to advance product development in the realm of gastronomy. </br></br> * <b>Food Science and Nutrition</b> - Utilizes health-focused analytics to optimize nutritional content.', richDescriptionOptions);

        expect(paragraphs).toHaveLength(5);
        expect(renderNodes(paragraphs)).toContain('<p>* <b>Food and Beverage Product Formulation</b>');
    });

    it('passes options through to rich paragraph content', () => {
        const paragraphs = richParagraphs('See <a href="https://example.com">docs</a>', richDescriptionOptions);

        expect(renderNodes(paragraphs)).toBe('<p>See <a href="https://example.com">docs</a></p>');
    });
});

describe('attrs', () => {
    it('passes through normal text attributes', () => {
        expect(attrs({ class: 'note', title: 'hello', 'data-id': '7' })).toEqual({
            class: 'note',
            title: 'hello',
            'data-id': '7',
        });
    });

    it('drops event, style, and unsafe url attributes', () => {
        expect(attrs({
            onclick: 'alert(1)',
            style: 'color:red',
            href: 'javascript:alert(1)',
            poster: 'javascript:alert(1)',
            cite: 'data:text/html,<script>alert(1)</script>',
            background: '//evil.com/bg.png',
            srcdoc: '<p>x</p>',
            title: 'safe',
        })).toEqual({
            title: 'safe',
        });
    });

    it('keeps safe url attributes', () => {
        expect(attrs({
            href: 'https://example.com',
            src: '/images/icon.png',
            action: './submit',
            poster: '/images/poster.png',
            cite: '#source',
        })).toEqual({
            href: 'https://example.com',
            src: '/images/icon.png',
            action: './submit',
            poster: '/images/poster.png',
            cite: '#source',
        });
    });
});

describe('update helpers', () => {
    it('sets already-safe attributes directly', () => {
        const element = document.createElement('div');

        setSafeAttrs(element, attrs({
            class: 'note',
            title: 'Trusted',
        }));

        expect(element.getAttribute('class')).toBe('note');
        expect(element.getAttribute('title')).toBe('Trusted');
    });

    it('filters and applies a raw attribute bag safely', () => {
        const element = document.createElement('a');

        setAttrsSafely(element, {
            href: 'javascript:alert(1)',
            onclick: 'alert(1)',
            title: 'safe',
        });

        expect(element.hasAttribute('href')).toBe(false);
        expect(element.hasAttribute('onclick')).toBe(false);
        expect(element.getAttribute('title')).toBe('safe');
    });

    it('replaces content with safe plain text', () => {
        const element = document.createElement('div');

        setText(element, '<strong>hello</strong>');

        expect(element.innerHTML).toBe('&lt;strong&gt;hello&lt;/strong&gt;');
    });

    it('replaces content with safe whitelist-rich text', () => {
        const element = document.createElement('div');

        setRich(element, 'Hi <strong>there</strong> <span>friend</span>');

        expect(element.innerHTML).toBe('Hi there friend');
    });

    it('replaces content with rich text using supplied options', () => {
        const element = document.createElement('div');

        setRich(element, 'See <a href="https://example.com">docs</a>', richDescriptionOptions);

        expect(element.innerHTML).toBe('See <a href="https://example.com">docs</a>');
    });
});
