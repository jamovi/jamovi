export class HTMLElementCreator {
    public static create(tag='div', attributes={}, ...children: Array<string | HTMLElement>) {
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

    public static parse(html: string) : HTMLElement {
        let template = document.createElement('template');
        template.innerHTML = html.trim(); // trim to avoid whitespace nodes
        let child = template.content.firstElementChild;
        if (child instanceof HTMLElement)
            return child;

        throw 'Should only return HTMLElement type';
    }
}

export default HTMLElementCreator;