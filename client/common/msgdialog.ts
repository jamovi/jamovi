import interactionManager, { type FocusLoop } from './interactionmanager';
import { h } from './htmlelementcreator';

const template = document.createElement('template');
template.content.append(
  h('style', {}, `
    .msg-dialog-inner {
      display: block;
    }
    dialog::backdrop {
      background: #00000069;
    }
    .msg-dialog-inner .dialog-body {
      margin: 0 0 1rem;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .msg-dialog-inner .input-field {
      width: 100%;
      box-sizing: border-box;
      margin: 0 0 1rem;
      padding: 0.5rem;
      border: 1px solid #b7b7b7;
      border-radius: 4px;
      font: inherit;
      display: none;
    }
    .msg-dialog-inner .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .msg-dialog-inner button {
      min-width: 80px;
      padding: 0.5rem 0.85rem;
      border: 1px solid #8a8a8a;
      border-radius: 3px;
      background: #e8e8e8;
      color: #000;
      cursor: pointer;
    }
    .msg-dialog-inner button:hover {
      background: #dcdcdc;
    }
    .msg-dialog-inner button:focus {
      outline: 2px solid #005a9e;
      outline-offset: 2px;
    }
  `),
  h('div', { class: 'msg-dialog-inner', tabindex: '-1' },
    h('div', { class: 'dialog-body' }),
    h('input', { class: 'input-field', type: 'text' }),
    h('div', { class: 'buttons' })));

type MsgDialogResult = { action: 'ok' | 'cancel'; value?: string };

interface ButtonLabels {
  ok: string;
  cancel?: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'msg-dialog': MsgDialog;
  }
}

// An autonomous element wrapping a native <dialog>, rather than a customized
// built-in (extends HTMLDialogElement), as WebKit doesn't support those
export default class MsgDialog extends HTMLElement {
  static get observedAttributes() {
    return ['message', 'buttons'];
  }

  private bodyEl!: HTMLElement;
  private buttonsEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private innerEl!: HTMLElement;
  private dialogEl!: HTMLDialogElement;
  private bodyId = `msg-dialog-body-${Math.random().toString(36).slice(2)}`;
  private resolve?: (value: MsgDialogResult) => void;
  private buttonLabels: ButtonLabels = { ok: 'OK' };
  private showInput = false;
  private inputValue = '';
  private loop!: FocusLoop;

  constructor() {
    super();

    this.dialogEl = h('dialog', { class: 'msgdialog' });
    this.dialogEl.appendChild(template.content.cloneNode(true));
    this.appendChild(this.dialogEl);

    // Style the dialog element itself
    this.dialogEl.style.border = '1px solid #ababab';
    this.dialogEl.style.borderRadius = '6px';
    this.dialogEl.style.padding = '1rem';
    this.dialogEl.style.background = '#f3f3f3';
    this.dialogEl.style.color = '#000';
    this.dialogEl.style.minWidth = '320px';
    this.dialogEl.style.font = '13px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
    this.dialogEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.14)';

    this.bodyEl = this.dialogEl.querySelector('.dialog-body') as HTMLElement;
    this.inputEl = this.dialogEl.querySelector('.input-field') as HTMLInputElement;
    this.buttonsEl = this.dialogEl.querySelector('.buttons') as HTMLElement;
    this.innerEl = this.dialogEl.querySelector('.msg-dialog-inner') as HTMLElement;

    this.loop = interactionManager.registerLoop(this.innerEl, { level: 2, modal: true });

    this.bodyEl.id = this.bodyId;
    this.dialogEl.setAttribute('aria-describedby', this.bodyId);
    this.dialogEl.setAttribute('role', 'alertdialog');

    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.closeDialog('ok', this.inputEl.value);
      }
    });

    this.dialogEl.addEventListener('close', () => {
      this.loop.deactivate({ source: 'programmatic' });
    });

    this.dialogEl.addEventListener('cancel', (event) => {
      if (!this.buttonLabels.cancel) {
        event.preventDefault();
      } else {
        event.preventDefault();
        this.closeDialog('cancel');
      }
    });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  get message(): string {
    return this.getAttribute('message') || '';
  }

  set message(value: string) {
    this.setAttribute('message', value);
  }

  get buttons(): ButtonLabels {
    return this.buttonLabels;
  }

  set buttons(value: ButtonLabels) {
    this.buttonLabels = value;
  }

  private render() {
    this.bodyEl.textContent = this.message;
    this.renderInput();
    this.renderButtons();
  }

  private renderInput() {
    if (!this.showInput) {
      this.inputEl.style.display = 'none';
      return;
    }

    this.inputEl.style.display = 'block';
    this.inputEl.value = this.inputValue;
  }

  private renderButtons() {
    this.buttonsEl.replaceChildren();

    if (this.buttonLabels.cancel) {
      const cancelButton = h('button', { type: 'button' }, this.buttonLabels.cancel);
      cancelButton.addEventListener('click', () => this.closeDialog('cancel'));
      this.buttonsEl.appendChild(cancelButton);
    }

    const okButton = h('button', { type: 'button' }, this.buttonLabels.ok);
    okButton.autofocus = !this.showInput;
    okButton.addEventListener('click', () => {
      this.closeDialog('ok', this.showInput ? this.inputEl.value : undefined);
    });
    this.buttonsEl.appendChild(okButton);
  }

  private closeDialog(action: 'ok' | 'cancel', value?: string) {
    if (!this.dialogEl.open || !this.resolve) {
      return;
    }
    const result: MsgDialogResult = action === 'cancel' 
      ? { action: 'cancel' }
      : { action: 'ok', value };
    const resolve = this.resolve;
    this.resolve = undefined;
    this.dialogEl.close();
    resolve(result);
  }

  open(message?: string, buttons: ButtonLabels = { ok: 'OK' }, input?: string): Promise<MsgDialogResult> {
    if (message !== undefined) {
      this.message = message;
    }
    this.buttons = buttons;
    this.showInput = input !== undefined;
    this.inputValue = input ?? '';
    this.render();

    if (!this.isConnected) {
      document.body.appendChild(this);
    }

    if (!this.dialogEl.open) {
      this.dialogEl.showModal();
      this.innerEl.focus();
    }

    if (this.showInput) {
      this.inputEl.focus();
      this.inputEl.select();
    }

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  static async show(message: string, buttons: ButtonLabels = { ok: 'OK' }, input?: string): Promise<MsgDialogResult> {
    // constructed with new, rather than createElement(), because the
    // constructor populates the element
    let dialog = document.querySelector('msg-dialog') ?? new MsgDialog();
    return dialog.open(message, buttons, input);
  }
}

customElements.define('msg-dialog', MsgDialog);

// Add global backdrop styling for the dialog
const backdropStyle = document.createElement('style');
backdropStyle.textContent = `msg-dialog > dialog::backdrop { background: rgba(0, 0, 0, 0.3); }`;
document.head.appendChild(backdropStyle);
