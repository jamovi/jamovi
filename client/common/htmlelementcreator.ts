export class HTMLElementCreator {
    public static create<K extends keyof HTMLElementTagNameMap>(tag: K ='div' as K, attributes={}, ...children: Array<string | HTMLElement>) : HTMLElementTagNameMap[K] {
        let element = document.createElement(tag);
        for (let attribute in attributes) {
            let value = attributes[attribute];
            if (value !== undefined)
                element.setAttribute(attribute, value.toString());
        }
        for (let child of children) {
            if (child instanceof HTMLElement)
                element.append(child);
            else
                element.append(document.createTextNode(child));
        }
        return element;
    };

    public static parse<T extends HTMLElement> (html: string) : T {
        let template = document.createElement('template');
        template.innerHTML = html.trim(); // trim to avoid whitespace nodes
        let child = template.content.firstElementChild;
        return child as T;
    }
}

export default HTMLElementCreator;