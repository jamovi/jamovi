'use strict';

import OptionControl from './optioncontrol';
import { FormatDef } from './formatdef';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { GridActionButtonProperties } from './gridactionbutton';


export type GridRunButtonProperties = GridActionButtonProperties & {
    action: 'run';
}

export function IsGridRunButtonProperties(params: any) : params is GridRunButtonProperties {
    return params && params.typeName === 'ActionButton' && params.action === 'run';
}


const runningSVG = `<svg
  width="64"
  height="64"
  viewBox="0 0 60 60"
  xmlns="http://www.w3.org/2000/svg"
  style="width: 20px; height: 20px"
>
  <style>
    rect.col { fill: #2b4b75; }

    /* Total cycle = 3s
       0–1.5s: left → right
       1.5–3s: right → left */
    .col-0 { animation: pingpong 3s infinite; }
    .col-1 { animation: pingpong 3s infinite 0.5s; }
    .col-2 { animation: pingpong 3s infinite 1s; }

    @keyframes pingpong {
      0%   { opacity: 0.25; }
      16%  { opacity: 1; }
      33%  { opacity: 0.25; }

      /* idle gap */
      50%  { opacity: 0.25; }

      /* reverse direction */
      66%  { opacity: 1; }
      83%  { opacity: 0.25; }
      100% { opacity: 0.25; }
    }
  </style>

  <!-- Column 1 -->
  <rect class="col col-0" x="5"  y="5"  width="10" height="10"/>
  <rect class="col col-0" x="5"  y="25" width="10" height="10"/>
  <rect class="col col-0" x="5"  y="45" width="10" height="10"/>

  <!-- Column 2 -->
  <rect class="col col-1" x="25" y="5"  width="10" height="10"/>
  <rect class="col col-1" x="25" y="25" width="10" height="10"/>
  <rect class="col col-1" x="25" y="45" width="10" height="10"/>

  <!-- Column 3 -->
  <rect class="col col-2" x="45" y="5"  width="10" height="10"/>
  <rect class="col col-2" x="45" y="25" width="10" height="10"/>
  <rect class="col col-2" x="45" y="45" width="10" height="10"/>
</svg>
`;

const playSVG = `<svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    aria-hidden="true"
    class="play"
  >
    <path
      d="M9 6.5L18 12L9 17.5Z"
      fill="green"
    />
  </svg>`;

const stopSVG = `<svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    aria-hidden="true"
    class="stop"
    style="display:none"
  >
    <rect
      x="7"
      y="7"
      width="10"
      height="10"
      fill="red"
    />
  </svg>`;

export class GridRunButton extends OptionControl<GridRunButtonProperties> {
    checkedValue: string;
    svg: SVGElement;
    button: HTMLButtonElement;
    buttonSpan: HTMLSpanElement;
    playIcon: SVGElement;
    stopIcon: SVGElement;

    constructor(params: GridRunButtonProperties, parent) {
        super(params, parent);
        this.setRootElement(HTML.parse(`
            <div class="jmv-run-button">
                ${runningSVG}
                <button class="button"><span></span>${playSVG}${stopSVG}</button>
            </div>`));

        this.svg = this._el!.querySelector('svg');
        this.playIcon = this._el!.querySelector('svg.play');
        this.stopIcon = this._el!.querySelector('svg.stop');

        this.button = this._el!.querySelector('button');
        this.buttonSpan = this._el!.querySelector('button > span');

        let horizontalAlign = this.getPropertyValue("horizontalAlignment");
        this.el.setAttribute('data-horizontal-align', horizontalAlign);
    }

    protected override registerProperties(properties: GridRunButtonProperties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.bool);
    }

    override onPropertyChanged(name) {
        super.onPropertyChanged(name);
        if (name === 'enable')
            this.updateState();
    }

    createItem() {
        this.checkedValue = this.getPropertyValue('optionPart');
 
        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = '';
        label = _('Run {action}', { action: label });

        this.buttonSpan.innerText = label;

        this.button.addEventListener('click', (event) => {
            let enabled = this.getPropertyValue('enable');
            if (enabled)
                this.setValue(true);
        });
    }

    override onOptionValueChanged(key: (string | number)[], data) {
        super.onOptionValueChanged(key, data);
        this.updateState();
    }

    updateState() {
        let value = this.getValue();
        let enabled = this.getPropertyValue('enable');
        if (enabled === false)
            this.el.setAttribute('aria-disabled', 'true');
        else
            this.el.removeAttribute('aria-disabled');

        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = '';

        if (value) {
            this.playIcon.style.display = 'none';
            this.stopIcon.style.display = '';
            label = _('Stop {action}', { action: label });
            this.buttonSpan.innerText = label;
            this.svg.style.opacity = '1';
        }
        else {
            this.playIcon.style.display = '';
            this.stopIcon.style.display = 'none';
            label = _('Run {action}', { action: label });
            this.buttonSpan.innerText = label;
            this.svg.style.opacity = '0';
        }
    }
}

export default GridRunButton;
