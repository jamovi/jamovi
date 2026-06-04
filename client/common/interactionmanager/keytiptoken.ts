import { EventEmitter } from 'tsee';
import type { IKeyTipActionEvent, IKeyTipTokenOptions } from './keytiptype';

export class KeyTipToken extends EventEmitter implements IKeyTipTokenOptions {
    key: string;
    action?: (event?: IKeyTipActionEvent) => void;
    fullPath?: string;
    path?: string;
    label?: string;
    blocking?: boolean;
    position?: { x: string, y: string, internal?: boolean };
    maintainAccessibility?: boolean;

    constructor(options: IKeyTipTokenOptions) {
        super();
        Object.assign(this, options);
    }
}
