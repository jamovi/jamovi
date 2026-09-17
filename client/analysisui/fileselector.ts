'use strict';

import GetRequestDataSupport, { RequestDataSupport } from './requestdatasupport';
import { FileFormat, FormatDef, FileEntry } from './formatdef';
import interactionManager from '../common/interactionmanager';
import { h, rich }  from '../common/htmlelementcreator';
import type LayoutGrid from './layoutgrid';
import { VerticalAlignment } from './layoutcell';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';

export type FileSelectorProperties = GridOptionControlProperties<FileEntry[]> & {
    multiple: boolean;
    extensions: string[];
    format: FileFormat;
}

// a browse button and the file(s) selected with it. the value is always an
// array of { id, filename } (even when not multiple) -- see OptionFile in
// jmvcore for the R side. the file dialog and the upload into the session are
// handled by the main window, so this just asks for files and shows a busy
// state until they arrive
export class FileSelector extends OptionControl<FileSelectorProperties> {

    label: HTMLElement = null;
    body: HTMLElement;
    button: HTMLButtonElement;
    list: HTMLElement;
    dataSupport: RequestDataSupport;
    busy = false;

    constructor(params: FileSelectorProperties, parent) {
        super(params, parent);

        this.dataSupport = GetRequestDataSupport(this);

        this.setRootElement(h('div'));
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.file);
        this.registerOptionProperty('multiple');
        this.registerOptionProperty('extensions');
    }

    override onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'enable')
            this.updateEnabled();
    }

    override onRenderToGrid(grid: LayoutGrid, row, column, owner) {

        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = '';

        let columnUsed = 0;
        let cell = null;
        let id = interactionManager.nextAriaId('ctrl');
        if (label !== '') {
            this.label = h('label', { for: id, class: `silky-option-combo-label silky-control-margin-${this.getPropertyValue('margin')}`, style: 'display: inline; white-space: nowrap;' }, rich(label));
            cell = grid.addCell(column, row, this.label);
            cell.setAlignment('left', 'center');
            columnUsed += 1;
        }

        this.button = h('button', { id: id, class: `jmv-file-selector-button silky-control-margin-${this.getPropertyValue('margin')}` }, s_('Browse…'));
        this.button.addEventListener('click', () => this.browse());

        this.list = h('div', { class: 'jmv-file-selector-list' });

        this.body = h('div', { class: 'jmv-file-selector' }, this.button, this.list);

        let spans = { rows: 1, columns: 1 };
        let vAlign: VerticalAlignment = 'top';
        if (columnUsed === 0 && this.hasProperty('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }

        cell = grid.addCell(column + columnUsed, row, this.body, { spans, vAlign });
        cell.setAlignment('left', 'center');

        columnUsed += 1;

        this.update();

        return { height: 1, width: columnUsed };
    }

    async browse() {
        if (this.busy || this.getPropertyValue('enable') === false)
            return;

        let multiple = this.getPropertyValue('multiple') === true;
        let extensions = this.getPropertyValue('extensions');

        this.setBusy(true);
        let files: FileEntry[] | undefined;
        try {
            files = await this.dataSupport.requestAction('selectFiles', { multiple, extensions });
        }
        catch (e) {
            files = undefined;  // aborted (i.e. the user navigated away)
        }
        finally {
            if ( ! this.isDisposed)
                this.setBusy(false);
        }

        if (this.isDisposed || files === undefined)
            return;  // cancelled

        if (multiple) {
            // the id is derived from the content, so this is by content too
            let current = this.getValue() || [];
            let ids = new Set(current.map(f => f.id));
            files = current.concat(files.filter(f => f.id === null || ! ids.has(f.id)));
        }

        this.setValue(files);
    }

    remove(index: number) {
        let current = this.getValue() || [];
        current = current.slice(0);
        current.splice(index, 1);
        this.setValue(current);
    }

    setBusy(busy: boolean) {
        this.busy = busy;
        if (this.body)
            this.body.classList.toggle('busy', busy);
        this.updateEnabled();
    }

    updateEnabled() {
        let enabled = this.getPropertyValue('enable') !== false;
        if (this.button)
            this.button.disabled = enabled === false || this.busy;
        if (this.list) {
            for (let button of this.list.querySelectorAll('button'))
                button.disabled = enabled === false || this.busy;
        }
        if (this.label !== null) {
            if (enabled)
                this.label.classList.remove('disabled-text');
            else
                this.label.classList.add('disabled-text');
        }
    }

    update() {
        if ( ! this.list)
            return;

        let files = this.getValue() || [];
        let items = files.map((file, index) => {
            let name = file.filename;
            let remove = h('button', { class: 'jmv-file-selector-remove', 'aria-label': s_('Remove {name}', { name }), title: s_('Remove') }, '×');
            remove.addEventListener('click', () => this.remove(index));
            let item = h('div', { class: 'jmv-file-selector-item' }, h('span', { class: 'jmv-file-selector-name' }, name), remove);
            // a file with no id isn't in the session (it was restored from
            // a saved file without it), and can't be used until it's browsed
            // for again
            if ( ! file.id) {
                item.classList.add('unavailable');
                item.title = s_('This file needs to be re-selected');
            }
            return item;
        });

        this.list.replaceChildren(...items);
        this.updateEnabled();
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        this.update();
    }
}

export default FileSelector;
