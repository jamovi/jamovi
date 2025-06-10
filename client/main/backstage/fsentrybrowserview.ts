
import pathtools from '../utils/pathtools';
import { s6e } from '../../common/utils';
import focusLoop from '../../common/focusloop';
import * as path from 'path';

import { FSEntryListModel } from './fsentry';
import { FSItemType } from './fsentry';
import { isUrl } from './fsentry';

import host from '../host';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import type { IBrowseType, IBackstagePanelView } from './fsentry';

import { EventDistributor } from '../../common/eventmap';

function crc16(s) {
    if (s.length === 0)
        return 0;
    let crc = 0xFFFF;
    let n = s.length;
    let sum = 0;
    let x = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
        j = s.charCodeAt(i);
        sum += ((i + 1) * j);
        x = ((crc >> 8) ^ j) & 0xFF;
        x ^= x >> 4;
        crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return crc;
}

export class FSEntryBrowserView extends EventDistributor implements IBackstagePanelView {
    model: FSEntryListModel;
    _selectedIndices: number[] = [];
    _baseSelectionIndex = -1;
    multiMode = false;
    _clickedItem: HTMLElement;
    items: HTMLElement[];
    _selected: boolean;
    itemsList: HTMLElement;
    footer: HTMLElement;
    header: HTMLElement;
    filterExtensions: string[];
    shortcutPath: string;
    initialised = false;

    constructor(model: FSEntryListModel) {
        super();

        this.setEventMap({
            'dblclick .silky-bs-fslist-item' : this._itemDoubleClicked,
            'click .silky-bs-fslist-browser-check-button' : this._toggleMultiMode,
            'click .silky-bs-fslist-browser-back-button' : this._backClicked,
            'click .silky-bs-fslist-browser-save-button' : this._saveClicked,
            'keydown .silky-bs-fslist-browser-save-name' : this._nameKeypressHandle,
            'change .silky-bs-fslist-browser-save-filetype' : this._saveTypeChanged,
            'change .silky-bs-fslist-browser-save-name' : this._nameChanged,
            'keyup .silky-bs-fslist-browser-save-name' : this._nameChanged,
            'paste .silky-bs-fslist-browser-save-name' : this._nameChanged,
            'focus .silky-bs-fslist-browser-save-name' : this._nameGotFocus,
            'focus .silky-bs-fslist-browser-save-filetype' : this._focusChanged,
            'click .silky-bs-fslist-browse-button' : this._manualBrowse,
            'keydown .silky-bs-fslist-items' : this._keyPressHandle,
            'focus .silky-bs-fslist-items' : this._listFocus,
            'pointerdown .silky-bs-fslist-items' : this._listPointerDown,
            'keydown .silky-bs-fslist-browser-import-name' : this._importNameKeypressHandle,
            'click .silky-bs-fslist-browser-import-button' : this._importClicked,
            'change .silky-bs-fslist-browser-import-name' : this._importNameChanged,
            'keyup .silky-bs-fslist-browser-import-name' : this._importNameChanged,
            'paste .silky-bs-fslist-browser-import-name' : this._importNameChanged,
            'focus .silky-bs-fslist-browser-import-name' : this._nameGotFocus,
            'focus .silky-bs-fslist-browser-import-filetype' : this._focusChanged,
            'input .search' : this._searchChanged,
            'click .jmv-bs-fslist-checkbox': this._checkclicked
        });

        this.model = model;
    }

    connectedCallback() {
        this.model.on('change:items change:dirInfo change:status', this._render, this);
        this.model.on('change:suggestedPath', this._suggestedChanged, this);

        if ( ! this.initialised) {
            this.classList.add('silky-bs-choices-list');
            this.classList.add('silky-bs-fslist');
            this.initialised = true;
        }

        this.innerHTML = '';
        this._createHeader();
        this._render();
    }

    disconnectedCallback() {
        this.model.off('change:items change:dirInfo change:status', this._render, this);
        this.model.off('change:suggestedPath', this._suggestedChanged, this);
    }

    private _checkclicked(event) {
        event.preventDefault();
    }

    public preferredWidth() {
        return '750px';
    }

    private _suggestedChanged() {
        let saveName = this.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-save-name');
        if (saveName) {
            let filePath = this.model.attributes.suggestedPath;
            if (filePath) {
                let extension = path.extname(filePath);
                filePath = s6e(path.basename(filePath, extension));
            }
            else
                filePath = '';

            saveName.value = filePath;

            const button = this.querySelector('.silky-bs-fslist-browser-save-button');
            if (filePath)
                button.classList.remove('disabled-div');
            else
                button.classList.add('disabled-div');
        }
    }

    private _listPointerDown(event) {
        this._clickedItem = document.elementFromPoint(event.pageX, event.pageY).closest('.silky-bs-fslist-item');
        if (this._clickedItem) {
            let fromChecked = event.target.classList.contains('jmv-bs-fslist-checkbox') && !event.target.getAttribute('checked');
            this.clickItem(this._clickedItem, event.ctrlKey, event.shiftKey, fromChecked);
        }
            
    }

    private _listFocus() {
        if (this._clickedItem) {
            this._clickedItem = null;
            return;
        }
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[0] : ((this.items && this.items.length > 0) ? 0 : -1);
        if (selectedIndex >= 0 && selectedIndex < this.items.length){
            this.clearSelection();
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.items[selectedIndex].classList.add('silky-bs-fslist-selected-item');
            this.items[selectedIndex].setAttribute('aria-selected', 'true');
            const checkbox = this.items[selectedIndex].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
            if (checkbox)
                checkbox.checked = true;
            this._selected = true;

            let item = this.items[selectedIndex];
            let list = this.itemsList;

            const offsetTop = item.offsetTop - list.offsetTop;

            if (offsetTop < 0) {
                list.scrollTo({
                    top: list.scrollTop + offsetTop,
                    behavior: 'smooth'
                });
            }

            this.updateActiveDescendant();
        }
    }

    private _setSelection(target: HTMLElement): void {
        if (this._selectedIndices.length > 0)
            this.clearSelection();

        const indexAttr = target.getAttribute('data-index');
        const index = indexAttr !== null ? parseInt(indexAttr, 10) : NaN;
        if (!isNaN(index))
            this._selectedIndices.push(index);

        target.classList.add('silky-bs-fslist-selected-item');
        target.setAttribute('aria-selected', 'true');

        const checkbox = target.querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
        if (checkbox)
            checkbox.checked = true;

        this.updateActiveDescendant();
    }

    private _searchChanged() {
        this._render();
        this.itemsList.scrollTo({ top: 0, behavior: 'smooth' });
    }

    private _saveTypeChanged() {
        const selected = this.querySelector('option:checked') as HTMLOptionElement | null;
        this.filterExtensions = selected ? JSON.parse(selected.dataset.extensions) ?? null : null;
        this._render();
    }

    private _validExtension(ext: string): number {
        const extOptions = this.querySelectorAll<HTMLElement>(
            '.silky-bs-fslist-browser-save-filetype option'
        );

        for (let i = 0; i < extOptions.length; i++) {
            const option = extOptions[i];
            const exts: string[] = JSON.parse(option.dataset.extensions);

            for (let j = 0; j < exts.length; j++) {
                if (`.${exts[j]}` === ext) {
                    return i;
                }
            }
        }

        return -1;
    }

    private _nameGotFocus() {
        this.clearSelection();
    }

    private _focusChanged() {
        this.clearSelection();
    }

    private _orderItems(orderby: 'type', direction: 0 | 1, items: any[]) {

        if (items.length <= 1)
            return;

        if (orderby === 'type') {
            for (let i = 0; i < items.length - 1; i++) {
                let item1 = items[i];
                let item2 = items[i + 1];
                if ((direction === 0 && item1[orderby] > item2[orderby]) || (direction === 1 && item1[orderby] < item2[orderby])) {
                    items[i] = item2;
                    items[i+1] = item1;
                    if (i > 1)
                        i -= 2;
                }
            }
        }
    }

    public setShortcutPath(path) {
        if (this.shortcutPath !== path) {
            this.shortcutPath = path;
            //let $shortcutKeyElements = this.$el.find('[shortcut-key]');
            let shortcutKeyElements = this.querySelectorAll<HTMLElement>('[shortcut-key]');
            for (let i = 0; i < shortcutKeyElements.length; i++) {
                let element = shortcutKeyElements[i];
                focusLoop.applyShortcutOptions(element, { path: this.shortcutPath });
            }
            focusLoop.updateShortcuts({ silent: true});
        }
    }

    private _manualBrowse() {
        let filename = '';
        let type: IBrowseType = 'open';
        if (this.model.clickProcess === 'save' || this.model.clickProcess === 'export') {
            type = 'save';
            const inputEl = this.header.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-save-name');
            const filename = inputEl?.value.trim() ?? '';
            //filename = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
        }
        else if (this.model.clickProcess === 'import')
            type = 'import';

        this.model.requestBrowse({ list: this.model.fileExtensions, type, filename });
    }

    private _createFileTypeSelector() {
        let html = '';
        html += '           <div class="silky-bs-fslist-browser-save-filetype">';
        html += `               <select class="silky-bs-fslist-browser-save-filetype-inner" aria-label="${ _('File type') }">`;
        for (let i = 0; i < this.model.fileExtensions.length; i++) {
            let exts = this.model.fileExtensions[i].extensions;
            let desc = this.model.fileExtensions[i].description === undefined ? this.model.fileExtensions[i].name : this.model.fileExtensions[i].description;
            let selected = '';
            if (i === 0)
                selected = 'selected';
            html += "                   <option data-extensions='" + JSON.stringify(exts) + "' " + selected + " value=" + i + ">" + desc + "</option>";
        }
        html += '               </select>';
        html += '           </div>';
        return html;
    }

    private _createFooter() {
        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';
        let multiSelect = this.model.get('multiselect');

        let html = '';
        html += '<div class="silky-bs-fslist-footer">';

        if (isSaving === false) {
            html += this._createFileTypeSelector();
            let extension = null;

            if (multiSelect) {
                html += '   <div class="silky-bs-fslist-import-options hidden" style="display: flex; flex-flow: row nowrap;">';
                html += `       <input class="silky-bs-fslist-browser-import-name" type="text" spellcheck="false" placeholder="${_('Enter file name here')}" />`;
                html += '       <div class="silky-bs-fslist-browser-import-button" style="display: flex; flex: 0 0 auto;">';
                html += '           <div class="silky-bs-flist-import-icon"></div>';
                html += `           <span>${_('Import')}</span>`;
                html += '       </div>';
                html += '   </div>';
            }
        }

        html += '</div>';
        this.footer = HTML.parse(html);

        this.append(this.footer);
    }

    private _createBody() {

        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';

        let itemListId = focusLoop.getNextAriaElementId('list');

        if ( ! isSaving) {
            let searchHtml = `<div class="searchbox">
                            <div class="image"></div>
                            <input class="search" type="search" aria-label="${_('Search files')}" aria-controls="${itemListId}"></input>
                        </div>`;
            this.append(HTML.parse(searchHtml));

            //let $search = this.$el.find('.searchbox > .search');
            let search = this.querySelector('.searchbox > .search');
            if (search)
                focusLoop.applyShortcutOptions(search, { key: 'S', position: { x: '5%', y: '50%' } });
        }

        this.itemsList = HTML.create('div', { id: itemListId, role: 'list', 'aria-multiselectable': false, class:"silky-bs-fslist-items", style:"flex: 1 1 auto; overflow: auto; height:100%", tabindex:"0"});//`<div id="${itemListId}" role="list" aria-multiselectable="false" class="silky-bs-fslist-items" style="flex: 1 1 auto; overflow: auto; height:100%" tabindex="0"></div>`);
        this.append(this.itemsList);
    }

    private _createHeader() {
        let html = '';
        if ( ! host.isElectron) {
            html = `<div class="title-bar"><div class="place-title">${ this.model.attributes.title }</div></div>`;
            this.append(HTML.parse(html));
        }

        html = '<div class="silky-bs-fslist-header">';

        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';

        /////////////////////////////////////////////////////
        let extension = null;

        if (isSaving) {
            html += '   <div class="silky-bs-fslist-save-options" style="display: flex; flex-flow: row nowrap;">';
            html += '       <div style="flex: 1 1 auto;">';

            let filePath = this.model.attributes.suggestedPath;
            let insert = '';
            if (filePath) {
                extension = path.extname(filePath);
                insert = ' value="' + s6e(path.basename(filePath, extension)) + '"';
            }

            html += `           <input class="silky-bs-fslist-browser-save-name" type="text" spellcheck="false" placeholder="${_('Enter file name here')}" ${insert} />`;

            html += this._createFileTypeSelector();
            html += '       </div>';
            html += '       <button class="silky-bs-fslist-browser-save-button' + s6e(filePath ? '' : " disabled-div") + '" style="display: flex; flex: 0 0 auto;">';
            html += '           <div class="silky-bs-flist-save-icon"></div>';
            if (this.model.clickProcess === 'save')
                html += `           <span>${_('Save')}</span>`;
            else if (this.model.clickProcess === 'export')
                html += `           <span>${_('Export')}</span>`;
            html += '       </button>';
            html += '   </div>';
        }

        ////////////////////////////////////////////////

        if ( ! this.model.writeOnly) {
            html += '   <div class="silky-bs-fslist-path-browser">';
            if (this.model.get('multiselect'))
                html += '       <button class="silky-bs-fslist-browser-check-button"></button>';
            html += `       <button class="silky-bs-fslist-browser-back-button" aria-label="${_('Move back directory')}"><span class="mif-arrow-up"></span></button>`;
            html += '       <div class="silky-bs-fslist-browser-location" style="flex: 1 1 auto;"></div>';

            if (this.model.attributes.browseable) {

                html += '       <button class="silky-bs-fslist-browse-button">';
                html += '           <div class="silky-bs-fslist-browser-location-icon silky-bs-flist-item-folder-browse-icon"></div>';
                html += `           <span>${_('Browse')}</span>`;
                html += '       </button>';
            }

            html += '   </div>';
        }

        html += '</div>';
        this.header = HTML.parse(html);

        let multiMode = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browser-check-button');
        if (multiMode)
            focusLoop.applyShortcutOptions(multiMode, { key: 'C', action: this._toggleMultiMode.bind(this) });

        let back = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browser-back-button');
        if (back)
            focusLoop.applyShortcutOptions(back, { key: 'B', position: { x: '20%', y: '25%' }, action: this._backClicked.bind(this), blocking: true });

        let browse = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browse-button');
        if (browse)
            focusLoop.applyShortcutOptions(browse, { key: 'E', action: this._manualBrowse.bind(this) });

        let saveName = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browser-save-name');
        if (saveName)
            focusLoop.applyShortcutOptions(saveName, { key: 'F' });

        if (focusLoop.inAccessibilityMode() === false) {
            const input = this.header.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-save-name');
            if (input) {
                input.addEventListener('focus', () => {
                    input.select();
                });
            }
        }

        this.append(this.header);

        this._createBody();

        if (focusLoop.inAccessibilityMode() === false && (this.model.clickProcess === 'save' || this.model.clickProcess === 'export')) {
            setTimeout(() => {
                saveName.focus();
            }, 400);
        }

        if (this.model.attributes.extensions) {
            this.filterExtensions = this.model.fileExtensions[0].extensions;

            this._createFooter();

            let extValue = this._validExtension(extension);
            if (extValue != -1) {
                const select = this.querySelector<HTMLSelectElement>('.silky-bs-fslist-browser-save-filetype-inner');
                if (select)
                    select.value = extValue.toString();
            }
        }
    }

    private _nameKeypressHandle(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Enter':
                this._saveClicked();
                event.preventDefault();
                break;
        }
    }

    private _importNameKeypressHandle(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Enter':
                this._importClicked();
                event.preventDefault();
                break;
        }
    }

    private createAlphaNumericTag(prefix, id) {
        if (id <= 9) {
            return prefix + id;
        }

        id -= 9;

        let s = '', t;
        while (id > 0) {
            t = (id - 1) % 26;
            s = String.fromCharCode(65 + t) + s;
            id = (id - t)/26 | 0;
        }
        return prefix + s;

    }

    private _render() {

        if (this.model.writeOnly) {
            this.itemsList.innerHTML = '';
            this.clearSelection();
            return;
        }

        let items = this.model.get('items');
        let dirInfo = this.model.get('dirInfo');
        let status = this.model.get('status');

        let filePath = null;
        if (dirInfo !== undefined)
            filePath = pathtools.normalise(dirInfo.path).replace(/\//g, ' \uFE65 ');

        //this.$header.find('.silky-bs-fslist-browser-location').text(filePath);
        const locationEl = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browser-location');
        if (locationEl)
            locationEl.textContent = filePath;

        let searchValue = '';
        let search = this.querySelector<HTMLInputElement>('.searchbox > input');

        if (search) {
            search.setAttribute('aria-label', _('Search for file in directory {0}', [filePath]));

            searchValue = search.value.trim();

            if (focusLoop.inAccessibilityMode() === false) {
                setTimeout(() => {
                    search.focus();
                }, 250);
            }
        }

        let backbutton = this.querySelector<HTMLElement>('.silky-bs-fslist-browser-back-button');
        if (backbutton)
            backbutton.setAttribute('aria-label', _('Move back from directory {0}', [filePath]));

        this.itemsList.setAttribute('aria-label', _('{0} directory contents', [filePath]));

        let html = '';
        this._orderItems('type', 1, items);
        this.items = [];
        this.itemsList.innerHTML = '';

        if (status === 'error') {
            let errorMessage = this.model.get('error');
            this.itemsList.append(HTML.parse(`<span>${ s6e(errorMessage) }</span>`));
        }
        else if (status === 'loading') {
            this.itemsList.append(HTML.parse(`
                <div class="indicator-box">
                    <div class="loading-indicator"></div>
                    <span>Loading directory information...</span>
                </div>
            `));
        }
        else if (status === 'ok') {

            if (searchValue !== '') {
                if (isUrl(searchValue)) {
                    try {
                        let url = new URL(searchValue);
                        let name = path.basename(decodeURIComponent(url.pathname));
                        let description = _('An online data set hosted by {hostname}', { hostname : decodeURIComponent(url.hostname) });

                        items = [{
                            name: name,
                            path: searchValue,
                            type: FSItemType.File,
                            isExample: false,
                            tags: [_('Online data set')],
                            description: description,
                            isUrl: true,
                            skipExtensionCheck: true,
                        }];

                    } catch (e) {
                        // do nothing
                    }
                }
            }

            let itemIndex = 0;
            for (let i = 0; i < items.length; i++) {
                html = '';
                let item = items[i];

                let name = item.name;
                let lname = name.toLowerCase();
                let itemPath = item.path;
                let itemType = item.type;

                if ( ! item.isUrl && searchValue !== '') {
                    let lsearchValue = searchValue.toLowerCase();
                    if (lname.includes(lsearchValue) === false) {
                        if ( ! item.description || item.description.toLowerCase().includes(lsearchValue) === false) {
                            let found = false;
                            for (let tag of item.tags) {
                                if (tag.toLowerCase().startsWith(lsearchValue)) {
                                    found = true;
                                    break;
                                }
                            }
                            if ( ! found)
                                continue;
                        }
                    }
                }

                if (itemType === FSItemType.File
                        && ! item.isExample
                        && ! (item.skipExtensionCheck || this._hasValidExtension(name)))
                    continue;


                let itemId = focusLoop.getNextAriaElementId('listitem');
                let labelId = focusLoop.getNextAriaElementId('label');
                html += `<div id="${itemId}" aria-labelledby="${labelId}" class="silky-bs-fslist-item" role="listitem">`;
                if (itemType === FSItemType.File)
                    html += '<input class="jmv-bs-fslist-checkbox' + (this.multiMode ? '' : ' hidden') + '" type="checkbox" tabindex="-1">';
                html += '   <div class="silky-bs-flist-item-icon">';
                if (itemType === FSItemType.File) { //file
                    if (item.isExample) // examples don't have extensions
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                    else if (lname.endsWith('.omv'))
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-omv-icon"></div>';
                    else if (lname.endsWith('.omt'))
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-omt-icon"></div>';
                    else if (lname.endsWith('.pdf'))
                        html += '       <span class="mif-file-pdf"></span>';
                    else if (lname.endsWith('.htm') || name.endsWith('.html'))
                        html += '       <span class="mif-file-empty"></span>';
                    else
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                }
                else if (itemType === FSItemType.Folder) //folder
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-icon"></div>';
                else if (itemType === FSItemType.SpecialFolder) //special folder
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-special-icon"></div>';
                else if (itemType === FSItemType.Drive) //drive
                    html += '       <span class="mif-drive"></span>';
                html += '   </div>';

                if (item.description || item.tags || item.license) {
                    html += `   <div id="${labelId}" class="silky-bs-fslist-entry-group">`;
                    html += '       <div class="silky-bs-fslist-entry-name">' + name + '</div>';
                    html += '       <div class="silky-bs-fslist-entry-meta">';
                    if (item.description) {
                        html += `<span class="description">${ s6e(item.description) }</span>`;
                    }
                    if (item.tags) {
                        html += '<div class="tags">';
                        for (let tag of item.tags) {
                            let hue = crc16(tag) % 360;
                            html += `<div class="tag" style="background-color: hsl(${ hue }, 70%, 45%); border-color: hsl(${ hue }, 70%, 45%);">${ s6e(tag) }</div>`;
                        }
                        html += '</div>';
                    }
                    if (item.license) {
                        html += `<div class="license">Licensed ${ s6e(item.license) }</div>`;
                    }
                    html += '       </div>';
                    html += '   </div>';
                }
                else {
                    html += `   <div class="silky-bs-fslist-entry-name">${ s6e(name) }</div>`;
                }

                html += '</div>';

                let itemElement = HTML.parse(html);
                let sct = this.createAlphaNumericTag('Q', ++itemIndex);
                focusLoop.applyShortcutOptions(itemElement, {
                    key: sct,
                    path: this.shortcutPath,
                    action: this._itemClicked.bind(this),
                    blocking: itemType !== FSItemType.File,
                    position: { x: '0%', y: '0%', internal: true }
                });

                itemElement.dataset.name = name;
                itemElement.dataset.path = itemPath;
                itemElement.dataset.type = itemType.toString();
                itemElement.dataset.index = this.items.length.toString();

                this.itemsList.append(itemElement);
                this.items.push(itemElement);
            }

            if (this.items.length === 0) {
                this.clearSelection();
                this.itemsList.append(HTML.parse(`<span>${_('No recognised data files were found.')}</span>`));
            }
            else
                this._setSelection(this.items[0]);
        }
        focusLoop.updateShortcuts({ shortcutPath: this.shortcutPath, silent: true});
    }

    private _getSelectedPaths() {
        let paths = [];
        for (let i of this._selectedIndices) {
            paths.push(this.items[i].dataset.path);
        }
        return paths;
    }

    private _setMultiMode(value: boolean) {
        if (value !== this.multiMode) {
            const button = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browser-check-button');
            if (this.multiMode) {
                this.multiMode = false;
                button.classList.remove('on');
                this.itemsList.setAttribute('aria-multiselectable', 'false');
                const checkboxes = this.itemsList.querySelectorAll<HTMLElement>('.jmv-bs-fslist-checkbox');
                checkboxes.forEach(el => el.classList.add('hidden'));

                const importOptions = this.footer.querySelector<HTMLElement>('.silky-bs-fslist-import-options');
                if (importOptions)
                    importOptions.classList.add('hidden');

                this.clearSelection();
            }
            else {
                this.multiMode = true;
                this.itemsList.setAttribute('aria-multiselectable', 'true');
                const checkboxes = this.itemsList.querySelectorAll<HTMLElement>('.jmv-bs-fslist-checkbox');
                checkboxes.forEach(el => el.classList.remove('hidden'));

                const importOptions = this.footer.querySelector<HTMLElement>('.silky-bs-fslist-import-options');
                if (importOptions)
                    importOptions.classList.remove('hidden');
                button.classList.add('on');
            }
        }
    }

    private _toggleMultiMode() {
        this._setMultiMode( ! this.multiMode);
    }

    private updateActiveDescendant() {
        if (this._selectedIndices.length > 0) {
            let activeItem = this.items[this._selectedIndices[this._selectedIndices.length - 1]];
            this.itemsList.setAttribute('aria-activedescendant', activeItem.getAttribute('id'));
        }
        else
            this.itemsList.setAttribute('aria-activedescendant', '');
    }

    private removeNonFileItemsFromSelection() {
        let filtered = [];
        for (let i of this._selectedIndices) {
            const itemTypeStr = this.items[i].dataset.type;
            let itemType = itemTypeStr !== undefined ? parseInt(itemTypeStr, 10) as FSItemType : undefined;
            if (itemType === FSItemType.File)
                filtered.push(i);
            else {
                this.items[i].classList.remove('silky-bs-fslist-selected-item');
                this.items[i].setAttribute('aria-selected', 'false');
                const checkbox = this.items[i].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                if (checkbox)
                    checkbox.checked = false;
            }
        }
        this._selectedIndices = filtered;
    }

    private clickItem(target: HTMLElement, ctrlKey: boolean, shiftKey: boolean, fromChecked: boolean) {
        let multiSelect = this.model.get('multiselect');
        let modifier = ctrlKey || shiftKey || fromChecked;

        const itemTypeStr = target.dataset.type;
        let itemType = itemTypeStr !== undefined ? parseInt(itemTypeStr, 10) as FSItemType : undefined;
        let itemPath = target.dataset.path;
        let itemTitle = target.dataset.name;
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open') {
            this.clearSelection();
            this.model.requestOpen({ path: itemPath, title: itemTitle, type: itemType });
            focusLoop.updateShortcuts({ shortcutPath: this.shortcutPath });
        }
        else if (itemType === FSItemType.File && this.model.clickProcess === 'import') {
            let index = target.dataset.index !== undefined ? parseInt(target.dataset.index, 10) : -1;
            if (multiSelect && this._selectedIndices.length > 0 && modifier) {
                this.removeNonFileItemsFromSelection();
                //let index = target.dataset.index !== undefined ? parseInt(target.dataset.index, 10) : -1;
                //let index = $target.data('index');
                if (ctrlKey || fromChecked) {
                    let ii = this._selectedIndices.indexOf(index);
                    if (ii != -1) {
                        this.items[index].classList.remove('silky-bs-fslist-selected-item');
                        this.items[index].setAttribute('aria-selected', 'false');
                        let checkbox = this.items[index].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                        if (checkbox) 
                            checkbox.checked = false;
                        this._selectedIndices.splice(ii, 1);
                    }
                    else {
                        this._selectedIndices.push(index);
                        target.classList.add('silky-bs-fslist-selected-item');
                        target.setAttribute('aria-selected', 'true');
                        let checkbox = target.querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                        if (checkbox) 
                            checkbox.checked = false;
                    }
                    this._baseSelectionIndex = -1;
                }
                else if (shiftKey) {
                    for (let i of this._selectedIndices) {
                        this.items[i].classList.remove('silky-bs-fslist-selected-item');
                        this.items[i].setAttribute('aria-selected', 'false');
                        let checkbox = this.items[i].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                        if (checkbox) 
                            checkbox.checked = false;
                    }

                    let indices = [];
                    let start = this._baseSelectionIndex == -1 ? this._selectedIndices[this._selectedIndices.length - 1] : this._baseSelectionIndex;
                    for (let i = start; i !== index; i = i + ((index > start) ? 1 : -1)) {
                        indices.push(i);
                        this.items[i].classList.add('silky-bs-fslist-selected-item');
                        this.items[i].setAttribute('aria-selected', 'true');
                        let checkbox = this.items[i].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                        if (checkbox) 
                            checkbox.checked = true;
                    }
                    indices.push(index);
                    target.classList.add('silky-bs-fslist-selected-item');
                    target.setAttribute('aria-selected', 'true');
                    let checkbox = target.querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                    if (checkbox) 
                        checkbox.checked = true;
                    this._selectedIndices = indices;
                    this._baseSelectionIndex = this._selectedIndices[0];
                }
            }
            else {
                if (this._selectedIndices.length > 0)
                    this.clearSelection();
                this._selectedIndices.push(index);
                target.classList.add('silky-bs-fslist-selected-item');
                target.setAttribute('aria-selected', 'true');
                let checkbox = target.querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                if (checkbox) 
                    checkbox.checked = true;
            }

            if ((multiSelect === false || modifier === false) && this.multiMode === false) {
                let paths = this._getSelectedPaths();
                this.model.requestImport({ paths });
                const importOptions = this.footer.querySelector<HTMLElement>('.silky-bs-fslist-import-options');
                if (importOptions)
                    importOptions.classList.add('hidden');
                
                this._setMultiMode(false);
                const checkboxes = this.itemsList.querySelectorAll<HTMLElement>('.jmv-bs-fslist-checkbox');
                checkboxes.forEach(el => {
                    el.classList.add('hidden');
                });
            }
            else {
                let name = '';
                if (this._selectedIndices.length > 0) {
                    name = this.items[this._selectedIndices[0]].dataset.name;
                    if (this._selectedIndices.length > 1) {
                        name = '"' + name + '"';
                        for (let i = 1; i < this._selectedIndices.length; i++)
                            name = name + ' "' + this.items[this._selectedIndices[i]].dataset.name + '"';
                    }
                }
                const input = this.footer.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-import-name');
                if (input)
                    input.value = name;
                //this.$footer.find('.silky-bs-fslist-browser-import-name').val(name);
                this._importNameChanged();
                this._selected = true;
                this._setMultiMode(true);
            }
        }
        else {
            if (this._selectedIndices.length > 0) {
                for (let i of this._selectedIndices) {
                    this.items[i].classList.remove('silky-bs-fslist-selected-item');
                    this.items[i].setAttribute('aria-selected', 'false');
                    let checkbox = this.items[i].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                    if (checkbox) 
                        checkbox.checked = false;
                }
            }

            this._selectedIndices = [parseInt(target.dataset.index)];
            this._baseSelectionIndex = -1;
            let name = target.dataset.name;
            target.classList.add('silky-bs-fslist-selected-item');
            target.setAttribute('aria-selected', 'true');
            let checkbox = target.querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
            if (checkbox) 
                checkbox.checked = true;

            const input = this.header.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-save-name');
            if (input)
                input.value = name;
            this._nameChanged();
            this._selected = true;
        }
        this.updateActiveDescendant();
    }

    private _itemClicked(event) {
        this.clickItem(event.currentTarget, event.ctrlKey || event.metaKey, event.shiftKey, false);
    }

    private _keyPressHandle(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'ArrowUp':
                this.decrementSelection();
                event.preventDefault();
                event.stopPropagation();
                break;
            case 'ArrowDown':
                this.incrementSelection();
                event.preventDefault();
                event.stopPropagation();
                break;
            case 'Enter':
                if (this._selectedIndices.length > 0) {
                    let target = this.items[this._selectedIndices[0]];
                    const itemTypeStr = target.dataset.type;
                    let itemType = itemTypeStr !== undefined ? parseInt(itemTypeStr, 10) as FSItemType : undefined;
                    let itemPath = target.dataset.path;
                    let itemTitle = target.dataset.name;
                    if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
                        this.model.requestOpen({ path: itemPath, title: itemTitle, type: itemType });
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'import')
                        this.model.requestImport({ paths: this._getSelectedPaths() });
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
                        this.model.requestSave({ path: itemPath });
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
                        this.model.requestExport({ path: itemPath });
                }
                event.preventDefault();
                event.stopPropagation();
                break;
        }
    }

    private clearSelection() {
        for (let i of this._selectedIndices) {
            if (this.items[i]) {
                this.items[i].classList.remove('silky-bs-fslist-selected-item');
                let checkbox = this.items[i].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
                if (checkbox) 
                    checkbox.checked = false;
                this.items[i].setAttribute('aria-selected', 'false');
            }
        }
        this._selectedIndices = [];
        this._baseSelectionIndex = -1;
        if (this.footer) {
            const input = this.footer.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-import-name');
            if (input)
                input.value = '';
        }
        this._selected = false;
        this.updateActiveDescendant();
    }

    private incrementSelection() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[this._selectedIndices.length - 1] : (this.items.length > 0 ? 0 : -1);
        if (selectedIndex !== -1 && selectedIndex !== this.items.length - 1){
            this.clearSelection();
            selectedIndex += 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.items[selectedIndex].classList.add('silky-bs-fslist-selected-item');
            this.items[selectedIndex].setAttribute('aria-selected', 'true');
            let checkbox = this.items[selectedIndex].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
            if (checkbox) 
                checkbox.checked = true;
            this._selected = true;

            let offset = { top: this.items[selectedIndex].offsetTop };
            let height = this.items[selectedIndex].offsetHeight;
            if (offset.top + height > this.itemsList.offsetHeight) {
                let r = this.itemsList.scrollTop + (offset.top + height - this.itemsList.offsetHeight + 1);
                this.itemsList.scrollTo({ top: r, behavior: 'smooth' });
            }

            this.updateActiveDescendant();
        }
    }

    private decrementSelection() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[this._selectedIndices.length - 1] : (this.items.length > 0 ? 0 : -1);
        if (selectedIndex > 0){
            this.clearSelection();
            selectedIndex -= 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.items[selectedIndex].classList.add('silky-bs-fslist-selected-item');
            this.items[selectedIndex].setAttribute('aria-selected', 'true');
            let checkbox = this.items[selectedIndex].querySelector<HTMLInputElement>('.jmv-bs-fslist-checkbox');
            if (checkbox) 
                checkbox.checked = true;
            this._selected = true;

            let offset = { top: this.items[selectedIndex].offsetTop };
            if (offset.top < 0)
                this.itemsList.scrollTo({ top: this.itemsList.scrollTop + offset.top, behavior: 'smooth' });
            this.updateActiveDescendant();
        }
    }

    private _itemDoubleClicked(event: MouseEvent) {
        let target = event.currentTarget as HTMLElement;
        const itemTypeStr = target.dataset.type;
        let itemType = itemTypeStr !== undefined ? parseInt(itemTypeStr, 10) as FSItemType : undefined;
        let itemPath = target.dataset.path;
        let itemTitle = target.dataset.name;
        if (itemType === FSItemType.File)
            this._setMultiMode(false);
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
            this.model.requestOpen({ path: itemPath, title: itemTitle, type: itemType });
        else if (itemType === FSItemType.File && this.model.clickProcess === 'import')
            this.model.requestImport({ paths: [itemPath] });
        else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
            this.model.requestSave({ path: itemPath });
        else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
            this.model.requestExport({ path: itemPath });
    }

    private _nameChanged() {
        const button = this.header.querySelector<HTMLElement>('.silky-bs-fslist-browser-save-button');
        const input = this.header.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-save-name');
        const name = input ? input.value.trim() : '';
        if (name === '')
            button.classList.add('disabled-div');
        else
            button.classList.remove('disabled-div');

    }

    private _importNameChanged() {
        const button = this.footer.querySelector<HTMLElement>('.silky-bs-fslist-browser-import-button');
        const input = this.footer.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-import-name');
        const name = input ? input.value.trim() : '';
        if (name === '')
            button.classList.add('disabled-div');
        else
            button.classList.remove('disabled-div');
    }

    private _hasValidExtension(name: string) {
        let found = true;
        if (this.filterExtensions) {
            found = false;
            for (let extIndex = 0; extIndex < this.filterExtensions.length; extIndex++) {
                if (name.toLowerCase().endsWith('.' + this.filterExtensions[extIndex])) {
                    found = true;
                    break;
                }
            }
        }
        return found;
    }

   private  _saveClicked() {
        let dirInfo = this.model.get('dirInfo');
        let writeOnly = this.model.writeOnly;
        if (dirInfo !== undefined) {
            const input = this.header.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-save-name');
            let name = input ? input.value.trim() : '';
            if (name === '')
                return;

            if (this._hasValidExtension(name) === false)
                name = name + '.' + this.filterExtensions[0];

            const filePath = dirInfo.path + '/' + name;
            const options = { path: filePath };

            if (this.model.clickProcess === 'save')
                this.model.requestSave(options);
            else if (this.model.clickProcess === 'export')
                this.model.requestExport(options);
        }
    }

    private _importClicked() {
        if (this._selectedIndices.length > 0)
            this.model.requestImport({ paths: this._getSelectedPaths() });
        else {
            let dirInfo = this.model.get('dirInfo');
            if (dirInfo !== undefined) {
                const input = this.footer.querySelector<HTMLInputElement>('.silky-bs-fslist-browser-import-name');
                let name = input ? input.value.trim() : '';
                if (name === '')
                    return;

                this.model.requestImport({ paths: [ dirInfo.path + '/' + name ] });
            }
        }
    }

    private _backClicked() {
        let dirInfo = this.model.get('dirInfo');
        if (dirInfo !== undefined) {
            let filePath = dirInfo.path;
            filePath = this._calcBackDirectory(filePath);
            this._goToFolder(filePath);
            this.clearSelection();
        }
        focusLoop.updateShortcuts({ shortcutPath: this.shortcutPath });
    }

    private _goToFolder(dirPath: string) {
        this.model.requestOpen({ path: dirPath, type: FSItemType.Folder });
    }

    private _calcBackDirectory(filePath: string) {
        let index = -1;
        if (filePath.length > 0 && filePath !== '/') {
            index = filePath.lastIndexOf("/");
            if (index !== -1 && index === filePath.length - 1)
                index = filePath.lastIndexOf("/", filePath.length - 2);
        }

        if (index <= 0) {
            if (this.model.attributes.wdType === 'temp')
                return '{{Temp}}';

            if (this.model.attributes.wdType === 'examples')
                return '{{Examples}}';

            return '{{Root}}';
        }

        return filePath.substring(0, index);
    }
}

customElements.define('jmv-browser', FSEntryBrowserView);
