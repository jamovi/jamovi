import type Instance from '../../instance';
import { h, htmlTrusted, rich, richDescriptionOptions } from '../../../common/htmlelementcreator';
import type { IModuleMeta } from '../../modules';
import Notify from '../../notification';
import Version from '../../utils/version';
import { AuxView } from '../types';
import './style.css';

type ModuleOp = IModuleMeta['ops'][number];

type ModuleInstallState = {
    source: string;
    progress: [number, number];
    percent: number;
    cancelRequested: boolean;
};

type ModuleCardState = {
    module: IModuleMeta;
    installable: boolean;
    installedInLibrary: boolean;
};

type ModuleActionEvent = MouseEvent & { keyboardTriggered?: boolean };

export default class ModulesAuxView extends AuxView {
    model: Instance;
    tabsElement: HTMLDivElement | null = null;
    searchElement: HTMLInputElement | null = null;
    summaryProgressElement: HTMLDivElement | null = null;
    listElement: HTMLDivElement | null = null;
    installStates = new Map<string, ModuleInstallState>();
    cancelledInstallSources = new Set<string>();
    pendingInstalledRemovals = new Set<string>();
    pendingInstalledRemovalFocus = new Map<string, string | null>();
    renderVersion = 0;
    selectedTab: 'installed' | 'available' = 'installed';
    searchTerm = '';

    constructor(model: Instance) {
        super('modules');
        this.model = model;
    }

    getTitle() { return _('Module Library'); }

    getIconSvg() { return `
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="6" height="6" rx="1" />
                <rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" />
                <path d="M17 13v8" />
                <path d="M13 17h8" />
            </svg>
        `; }

    getBody() {
        const body = h('div', { class: 'aux-module-view' });
        const controls = h('div', { class: 'aux-module-controls' });
        const tabs = h('div', { class: 'aux-module-tabs' });

        const installedTab = this.createTabButton(_('Installed'), 'installed');
        const availableTab = this.createTabButton(_('Available'), 'available');
        tabs.append(installedTab, availableTab);

        const searchBox = h('div', { class: 'aux-module-searchbox' });

        const searchIcon = h('div', { class: 'aux-module-search-icon' });

        const search = h('input', {
            type: 'text',
            class: 'aux-module-search-input',
            'aria-label': this.selectedTab === 'available'
                ? _('Search available modules')
                : _('Search installed modules'),
        });
        search.spellcheck = true;
        search.placeholder = _('Search');
        search.addEventListener('input', () => {
            this.searchTerm = search.value;
            void this.update();
        });

        searchBox.append(searchIcon, search);

        const summaryProgress = h('div', {
            class: 'aux-module-summary-progress',
            'aria-hidden': 'true',
        });

        const list = h('div', { class: 'aux-panel-list aux-module-list' });

        controls.append(tabs, searchBox, summaryProgress);
        body.append(controls, list);

        this.tabsElement = tabs;
        this.searchElement = search;
        this.summaryProgressElement = summaryProgress;
        this.listElement = list;

        return body;
    }

    createTabButton(label: string, tab: 'installed' | 'available') {
        const button = h('button', {
            type: 'button',
            class: 'aux-module-tab',
            'aria-pressed': this.selectedTab === tab ? 'true' : 'false',
        }, label);
        button.dataset.tab = tab;
        button.classList.toggle('active', this.selectedTab === tab);
        button.addEventListener('click', () => {
            this.selectedTab = tab;
            this.updateTabState();
            void this.update();
        });
        return button;
    }

    onMount(): void {
        const modules = this.model.modules();
        const available = modules.available();

        modules.on('change:modules', this.update, this);
        modules.on('modulesChanged', this.update, this);
        modules.on('moduleVisibilityChanged', this.update, this);
        available.on('change:modules', this.update, this);
        available.on('change:status', this.update, this);
        available.on('change:progress', this.update, this);

        this.update();
    }

    onShow(): void {
        this.model.modules().available().retrieve();
        this.updateTabState();
        this.update();
    }

    createListItem(text: string) {
        return h('div', { class: 'aux-panel-list-item' }, text);
    }

    createDescriptionContent(text: string, highlightTerm = ''): DocumentFragment {
        const fragment = rich(text, {
            ...richDescriptionOptions,
            linkTarget: '_blank',
        });
        this.highlightTextNodes(fragment, highlightTerm);
        return fragment;
    }

    highlightTextNodes(root: ParentNode, highlightTerm = ''): void {
        const term = highlightTerm.trim();
        if (term === '')
            return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let currentNode = walker.nextNode();
        while (currentNode !== null) {
            if (currentNode instanceof Text)
                textNodes.push(currentNode);
            currentNode = walker.nextNode();
        }

        for (const textNode of textNodes) {
            const parent = textNode.parentNode;
            if (parent === null)
                continue;

            const highlighted = this.createHighlightedTextContent(textNode.textContent || '', term);
            if (highlighted.childNodes.length > 1 || highlighted.firstChild instanceof HTMLElement)
                parent.replaceChild(highlighted, textNode);
        }
    }

    createHighlightedTextContent(text: string, highlightTerm = ''): DocumentFragment {
        const fragment = document.createDocumentFragment();
        const term = highlightTerm.trim();
        if (term === '') {
            fragment.append(text);
            return fragment;
        }

        const lowerText = text.toLocaleLowerCase();
        const lowerTerm = term.toLocaleLowerCase();
        let index = 0;

        while (index < text.length) {
            const matchIndex = lowerText.indexOf(lowerTerm, index);
            if (matchIndex === -1)
                break;

            if (matchIndex > index)
                fragment.append(text.slice(index, matchIndex));

            const highlight = h('span', { class: 'aux-module-search-highlight' }, text.slice(matchIndex, matchIndex + term.length));
            fragment.append(highlight);
            index = matchIndex + term.length;
        }

        if (index < text.length)
            fragment.append(text.slice(index));

        return fragment;
    }

    getSearchHighlightTerm(): string {
        const rawSearch = this.searchTerm.trim();
        const lowerSearch = rawSearch.toLocaleLowerCase();
        if (lowerSearch.startsWith('module::'))
            return rawSearch.substring(8).trim();
        if (lowerSearch.startsWith('plot::'))
            return rawSearch.substring(6).trim();
        return rawSearch;
    }

    expandDescriptionForHiddenHighlight(meta: HTMLElement): void {
        if (meta.querySelector('.aux-module-search-highlight') === null)
            return;

        requestAnimationFrame(() => {
            if (! meta.isConnected || meta.classList.contains('expanded'))
                return;

            if (meta.scrollHeight <= meta.clientHeight + 1)
                return;

            const metaRect = meta.getBoundingClientRect();
            const highlights = Array.from(meta.querySelectorAll<HTMLElement>('.aux-module-search-highlight'));
            const highlightIsHidden = highlights.some(highlight => {
                const rect = highlight.getBoundingClientRect();
                return rect.top < metaRect.top - 1 || rect.bottom > metaRect.bottom + 1;
            });

            if (! highlightIsHidden)
                return;

            meta.classList.add('expanded');
            meta.setAttribute('aria-expanded', 'true');
        });
    }

    async update(): Promise<void> {
        if (this.listElement === null)
            return;

        const renderVersion = ++this.renderVersion;
        const installedModules = this.getInstalledModules();
        const availableModules = this.getAvailableModules();
        this.updateSummaryProgress(installedModules, availableModules);

        let cards: ModuleCardState[];
        let emptyMessage: string;

        if (this.selectedTab === 'installed') {
            const featuredModules = installedModules
                .filter(module => this.moduleMatchesSearch(module))
                .slice()
                .sort((left, right) => left.title.localeCompare(right.title));

            cards = featuredModules.map(module => ({
                module,
                installable: false,
                installedInLibrary: false,
            }));
            emptyMessage = _('No installed modules found.');
        }
        else {
            const featuredAvailable = availableModules
                .map(module => this.getAvailableListModule(module, installedModules))
                .filter(module => this.moduleMatchesSearch(module))
                .slice()
                .sort((left, right) => left.title.localeCompare(right.title));

            cards = featuredAvailable.map(module => ({
                module,
                installable: true,
                installedInLibrary: installedModules.some(installed => installed.name === module.name),
            }));
            emptyMessage = _('No additional modules available right now.');
        }

        if (renderVersion !== this.renderVersion)
            return;

        await this.updateModuleSection(cards, emptyMessage, renderVersion);
    }

    async updateModuleSection(cards: ModuleCardState[], emptyMessage: string, renderVersion: number): Promise<void> {
        if (this.listElement === null || renderVersion !== this.renderVersion)
            return;

        const existingSection = this.listElement.querySelector<HTMLElement>(':scope > .aux-module-section');
        let section: HTMLElement;
        let scrollAnchor: { moduleName: string; offset: number; scrollTop: number } | null = null;

        if (existingSection !== null && existingSection.dataset.tab === this.selectedTab) {
            section = existingSection;
            scrollAnchor = this.captureListScrollAnchor(section);
        }
        else {
            section = h('div', { class: 'aux-module-section' });
            section.dataset.tab = this.selectedTab;
            this.listElement.replaceChildren(section);
        }

        const currentCards = Array.from(section.querySelectorAll<HTMLElement>(':scope > .aux-module-card[data-module-name]'));
        const nextModuleNames = new Set(cards.map(card => card.module.name));
        const removedCards = currentCards.filter(card => {
            const moduleName = card.dataset.moduleName;
            return moduleName !== undefined
                && this.selectedTab === 'installed'
                && ! nextModuleNames.has(moduleName)
                && this.pendingInstalledRemovals.has(moduleName);
        });

        if (removedCards.length > 0 && ! this.prefersReducedMotion())
            await this.animateCardRemoval(removedCards);

        if (renderVersion !== this.renderVersion)
            return;

        const currentCardsByName = new Map<string, HTMLElement[]>();
        for (const card of currentCards) {
            const moduleName = card.dataset.moduleName;
            if (moduleName === undefined)
                continue;

            const cardsForName = currentCardsByName.get(moduleName) || [];
            cardsForName.push(card);
            currentCardsByName.set(moduleName, cardsForName);
        }

        const emptyItem = section.querySelector<HTMLElement>(':scope > [data-role="module-empty"]');

        if (cards.length === 0) {
            for (const card of currentCards)
                card.remove();

            const item = emptyItem || this.createListItem(emptyMessage);
            item.dataset.role = 'module-empty';
            item.textContent = emptyMessage;
            if (item.parentElement !== section)
                section.append(item);

            this.restoreListScrollAnchor(section, scrollAnchor, renderVersion);
            for (const card of removedCards) {
                if (card.dataset.moduleName !== undefined) {
                    this.pendingInstalledRemovals.delete(card.dataset.moduleName);
                    this.pendingInstalledRemovalFocus.delete(card.dataset.moduleName);
                }
            }
            return;
        }

        emptyItem?.remove();

        const usedCards = new Set<HTMLElement>();
        for (const [ index, state ] of cards.entries()) {
            if (renderVersion !== this.renderVersion)
                return;

            const cardsForName = currentCardsByName.get(state.module.name) || [];
            const reusableCardIndex = cardsForName.findIndex(card => this.canReuseModuleCard(card, state.installable));
            let card: HTMLElement | undefined;
            if (reusableCardIndex !== -1) {
                card = cardsForName[reusableCardIndex];
                cardsForName.splice(reusableCardIndex, 1);
            }

            if (card === undefined)
                card = this.createModuleCardShell(state.module.name, state.installable);

            usedCards.add(card);

            await this.updateModuleCard(card, state.module, state.installable, state.installedInLibrary, renderVersion);
            if (renderVersion !== this.renderVersion)
                return;

            const nextChild = section.children[index] ?? null;
            if (nextChild !== card)
                section.insertBefore(card, nextChild);
        }

        for (const card of currentCards) {
            if (! usedCards.has(card))
                card.remove();
        }
        this.restoreListScrollAnchor(section, scrollAnchor, renderVersion);
        this.restoreInstalledRemovalFocus(section, removedCards);

        for (const card of removedCards) {
            if (card.dataset.moduleName !== undefined) {
                this.pendingInstalledRemovals.delete(card.dataset.moduleName);
                this.pendingInstalledRemovalFocus.delete(card.dataset.moduleName);
            }
        }
    }

    canReuseModuleCard(card: HTMLElement, installable: boolean): boolean {
        return card.classList.contains('available-in-library') === installable;
    }

    captureInstalledRemovalFocusTarget(moduleName: string): string | null {
        if (this.listElement === null || this.selectedTab !== 'installed')
            return null;

        const cards = Array.from(this.listElement.querySelectorAll<HTMLElement>('.aux-module-section > .aux-module-card[data-module-name]'));
        const index = cards.findIndex(card => card.dataset.moduleName === moduleName);
        if (index === -1)
            return null;

        return cards[index + 1]?.dataset.moduleName
            || cards[index - 1]?.dataset.moduleName
            || null;
    }

    restoreInstalledRemovalFocus(section: HTMLElement, removedCards: HTMLElement[]): void {
        for (const removedCard of removedCards) {
            const removedModuleName = removedCard.dataset.moduleName;
            if (removedModuleName === undefined || ! this.pendingInstalledRemovalFocus.has(removedModuleName))
                continue;

            const focusModuleName = this.pendingInstalledRemovalFocus.get(removedModuleName);
            const focusCard = (focusModuleName === null || focusModuleName === undefined)
                ? section.querySelector<HTMLElement>(':scope > .aux-module-card[data-module-name]')
                : section.querySelector<HTMLElement>(`:scope > .aux-module-card[data-module-name="${ CSS.escape(focusModuleName) }"]`);

            focusCard?.focus();
            return;
        }
    }

    captureListScrollAnchor(section: HTMLElement): { moduleName: string; offset: number; scrollTop: number } | null {
        if (this.listElement === null)
            return null;

        const listRect = this.listElement.getBoundingClientRect();
        const cards = Array.from(section.querySelectorAll<HTMLElement>(':scope > .aux-module-card[data-module-name]'));
        for (const card of cards) {
            const cardRect = card.getBoundingClientRect();
            if (cardRect.bottom < listRect.top)
                continue;

            const moduleName = card.dataset.moduleName;
            if (moduleName === undefined)
                continue;

            return {
                moduleName,
                offset: cardRect.top - listRect.top,
                scrollTop: this.listElement.scrollTop,
            };
        }

        return {
            moduleName: '',
            offset: 0,
            scrollTop: this.listElement.scrollTop,
        };
    }

    restoreListScrollAnchor(section: HTMLElement, anchor: { moduleName: string; offset: number; scrollTop: number } | null, renderVersion: number): void {
        if (this.listElement === null || anchor === null || renderVersion !== this.renderVersion)
            return;

        if (anchor.moduleName === '') {
            this.listElement.scrollTop = anchor.scrollTop;
            return;
        }

        const card = section.querySelector<HTMLElement>(`:scope > .aux-module-card[data-module-name="${ CSS.escape(anchor.moduleName) }"]`);
        if (card === null) {
            this.listElement.scrollTop = anchor.scrollTop;
            return;
        }

        const listRect = this.listElement.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        this.listElement.scrollTop += cardRect.top - listRect.top - anchor.offset;
    }

    prefersReducedMotion(): boolean {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    }

    animateCardRemoval(cards: HTMLElement[]): Promise<void> {
        return new Promise(resolve => {
            for (const card of cards) {
                card.style.height = `${ card.offsetHeight }px`;
                card.style.overflow = 'hidden';
                card.style.boxSizing = 'border-box';
            }

            requestAnimationFrame(() => {
                for (const card of cards)
                    card.classList.add('removing');

                window.setTimeout(resolve, 260);
            });
        });
    }

    updateTabState(): void {
        if (this.tabsElement === null)
            return;

        this.tabsElement.querySelectorAll<HTMLButtonElement>('.aux-module-tab').forEach(button => {
            const active = button.dataset.tab === this.selectedTab;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        if (this.searchElement)
            this.searchElement.setAttribute('aria-label', this.selectedTab === 'available'
                ? _('Search available modules')
                : _('Search installed modules'));
    }

    getInstalledModules(): IModuleMeta[] {
        return this.model.modules().get('modules') || [];
    }

    getAvailableModules(): IModuleMeta[] {
        return this.model.modules().available().get('modules') || [];
    }

    getAvailableListModule(module: IModuleMeta, installedModules: IModuleMeta[]): IModuleMeta {
        const installedModule = installedModules.find(installed => installed.name === module.name);
        if (installedModule === undefined)
            return module;

        const ops: ModuleOp[] = [];
        if (module.ops.includes('old') || module.ops.includes('unavailable')) {
            ops.push(...module.ops.filter(op => op === 'old' || op === 'unavailable'));
        }
        else if (installedModule.incompatible) {
            if (module.url !== '' && module.version >= installedModule.version)
                ops.push('update');
            ops.push('incompatible');
        }
        else if (module.version > installedModule.version && module.url !== '') {
            ops.push('update');
        }
        else {
            ops.push('installed');
        }

        if (installedModule.ops.includes('remove'))
            ops.push('remove');

        return {
            ...module,
            isSystem: installedModule.isSystem,
            visible: installedModule.visible,
            incompatible: installedModule.incompatible,
            ops: [ ...new Set(ops) ],
        };
    }

    getVisibleModules(installedModules = this.getInstalledModules(), availableModules = this.getAvailableModules()): IModuleMeta[] {
        if (this.selectedTab === 'installed')
            return installedModules
                .filter(module => this.moduleMatchesSearch(module))
                .slice()
                .sort((left, right) => left.title.localeCompare(right.title));

        return availableModules
            .map(module => this.getAvailableListModule(module, installedModules))
            .filter(module => this.moduleMatchesSearch(module))
            .slice()
            .sort((left, right) => left.title.localeCompare(right.title));
    }

    updateSummaryProgress(installedModules = this.getInstalledModules(), availableModules = this.getAvailableModules()): void {
        if (this.summaryProgressElement === null)
            return;

        const activeInstalls = [ ...this.installStates.values() ];
        if (activeInstalls.length === 0) {
            const updateableModules = this.getVisibleModules(installedModules, availableModules)
                .filter(module => module.ops.includes('update'))
                .filter(module => ! this.installStates.has(module.name));

            if (updateableModules.length > 0) {
                const button = this.createActionButton(
                    _('Update all ({count})', { count: updateableModules.length.toString() }),
                    () => this.updateAll(updateableModules),
                    false,
                    'primary');
                button.classList.add('aux-module-summary-action');
                this.summaryProgressElement.classList.add('active');
                this.summaryProgressElement.setAttribute('aria-hidden', 'false');
                this.summaryProgressElement.replaceChildren(button);
                return;
            }

            this.summaryProgressElement.classList.remove('active');
            this.summaryProgressElement.setAttribute('aria-hidden', 'true');
            this.summaryProgressElement.replaceChildren();
            return;
        }

        const totalValue = activeInstalls.reduce((sum, state) => sum + state.progress[0], 0);
        const totalMax = activeInstalls.reduce((sum, state) => sum + state.progress[1], 0);
        const percent = totalMax > 0
            ? Math.max(0, Math.min(100, Math.round((100 * totalValue) / totalMax)))
            : 0;
        const allCancelling = activeInstalls.every(state => state.cancelRequested);

        const summaryState: ModuleInstallState = {
            source: '',
            progress: [ totalValue, totalMax ],
            percent,
            cancelRequested: allCancelling,
        };
        const summaryText = activeInstalls.length === 1
            ? _('Installing 1 module')
            : _('Installing {count} modules', { count: activeInstalls.length.toString() });

        this.summaryProgressElement.classList.add('active');
        this.summaryProgressElement.setAttribute('aria-hidden', 'false');
        const existingWrap = this.summaryProgressElement.querySelector<HTMLElement>('.aux-module-progress-wrap-summary');
        if (existingWrap !== null) {
            this.updateInstallProgress(existingWrap, summaryState, summaryText);
            return;
        }

        const wrap = this.createInstallProgress(summaryState, {
            text: summaryText,
            className: 'aux-module-progress-wrap aux-module-progress-wrap-summary',
            cancelAction: () => this.cancelAllInstalls(),
            cancelLabel: _('Cancel all'),
        });

        this.summaryProgressElement.replaceChildren(wrap);
    }

    updateAll(modules: IModuleMeta[]): void {
        for (const module of modules)
            this.installModule(module);
    }

    cancelAllInstalls(): void {
        const modulesBySource = new Map<string, IModuleMeta>();
        const availableModules = this.getAvailableModules();
        const installedModules = this.getInstalledModules();
        for (const module of [ ...availableModules, ...installedModules ]) {
            const source = module.url || module.path;
            if (source)
                modulesBySource.set(source, module);
        }

        for (const [ moduleName, state ] of this.installStates) {
            if (state.cancelRequested)
                continue;

            const module = modulesBySource.get(state.source);
            if (module !== undefined) {
                this.cancelInstallModule(module);
                continue;
            }

            this.installStates.set(moduleName, {
                ...state,
                cancelRequested: true,
            });
            this.cancelledInstallSources.add(state.source);
            this.cancelInstallBySource(state.source, error => {
                this.cancelledInstallSources.delete(state.source);
                const currentState = this.installStates.get(moduleName);
                if (currentState !== undefined) {
                    this.installStates.set(moduleName, {
                        ...currentState,
                        cancelRequested: false,
                    });
                }
                this.updateSummaryProgress();
                this.notifyUnableToCancelInstall(error);
            }, () => {
                this.installStates.delete(moduleName);
                this.updateSummaryProgress();
                void this.update();
            });
        }

        this.updateSummaryProgress();
    }

    moduleMatchesSearch(module: IModuleMeta): boolean {
        const rawSearch = this.searchTerm.trim().toLowerCase();
        if (rawSearch === '')
            return true;

        if (rawSearch.startsWith('module::')) {
            const term = rawSearch.substring(8).trim();
            return term === '' || module.name.toLowerCase().startsWith(term);
        }

        if (rawSearch.startsWith('plot::')) {
            const term = rawSearch.substring(6).trim();
            const hasPlots = module.category === 'plots' || module.analyses.some(analysis => analysis.category === 'plots');
            if (! hasPlots)
                return false;
            return term === '' || module.name.toLowerCase().startsWith(term);
        }

        const haystack = [
            module.name,
            module.title,
            module.description,
            module.category,
            ...module.authors,
            ...module.analyses.map(analysis => analysis.title),
            ...module.analyses.map(analysis => analysis.menuTitle),
            ...module.analyses.map(analysis => analysis.menuSubtitle),
        ]
            .filter(value => value)
            .join('\n')
            .toLowerCase();

        return haystack.includes(rawSearch);
    }

    async createModuleCard(module: IModuleMeta, installable: boolean, installedInLibrary = false): Promise<HTMLElement> {
        const card = this.createModuleCardShell(module.name, installable);
        await this.updateModuleCard(card, module, installable, installedInLibrary, this.renderVersion);
        return card;
    }

    createModuleCardShell(moduleName: string, installable: boolean): HTMLElement {
        const card = h('div', {
            class: 'aux-panel-placeholder aux-module-card',
            role: 'group',
            tabindex: '0',
        });
        card.dataset.moduleName = moduleName;
        card.classList.toggle('available-in-library', installable);
        this.bindModuleCardEntry(card);

        const header = h('div', { class: 'aux-module-header' });

        const icon = h('div', {
            class: 'aux-module-icon',
            'aria-hidden': 'true',
        });

        const titleWrap = h('div', { class: 'aux-module-title-wrap' });

        const title = h('div', { class: 'aux-module-title' });

        const name = h('span', { class: 'aux-module-name' });

        const version = h('span', { class: 'aux-module-version' });

        const packageMeta = h('div', { class: 'aux-module-package-meta' });
        packageMeta.append(name, version);

        titleWrap.append(title, packageMeta);
        header.append(icon, titleWrap);

        const installedBadge = installable
            ? this.createStatusChip(_('Installed'))
            : null;
        if (installedBadge !== null) {
            installedBadge.classList.add('aux-module-installed-badge', 'hidden');
            installedBadge.setAttribute('aria-hidden', 'true');
        }

        const meta = h('div', { class: 'aux-module-meta' });
        this.bindModuleMetaToggle(meta);

        const authors = h('div', { class: 'aux-module-authors' });
        authors.hidden = true;

        const actions = h('div', { class: 'aux-module-actions' });
        actions.hidden = true;

        const analyses = h('div', { class: 'aux-module-analyses-host' });
        analyses.hidden = true;

        card.append(header);
        if (installedBadge !== null)
            card.append(installedBadge);
        card.append(meta, authors, actions, analyses);

        return card;
    }

    bindModuleCardEntry(card: HTMLElement): void {
        card.addEventListener('keydown', event => {
            if (event.target !== card)
                return;

            if (event.key !== 'Enter' && event.key !== ' ')
                return;

            const nextFocus = this.getFirstFocusableCardElement(card);
            if (nextFocus === null)
                return;

            event.preventDefault();
            nextFocus.focus();
        });
    }

    getFirstFocusableCardElement(card: HTMLElement): HTMLElement | null {
        const selectors = [
            '.aux-module-actions button:not(:disabled)',
            '.aux-module-analyses-host summary',
            '.aux-module-analyses-host button:not(:disabled)',
            '.aux-module-meta[tabindex]:not([tabindex="-1"])',
            'a[href]',
            'button:not(:disabled)',
            'summary',
            '[tabindex]:not([tabindex="-1"])',
        ];

        for (const selector of selectors) {
            const focusable = Array.from(card.querySelectorAll<HTMLElement>(selector));
            const element = focusable.find(element => element !== card && this.isVisibleFocusableElement(element));
            if (element !== undefined)
                return element;
        }

        return null;
    }

    isVisibleFocusableElement(element: HTMLElement): boolean {
        if (element.hidden || element.getAttribute('aria-hidden') === 'true')
            return false;

        if (element.closest('[hidden], [aria-hidden="true"]') !== null)
            return false;

        return element.offsetParent !== null || element.getClientRects().length > 0;
    }

    bindModuleMetaToggle(meta: HTMLElement): void {
        const toggleExpanded = () => {
            if (meta.dataset.expandable !== 'true')
                return;

            const expanded = meta.classList.toggle('expanded');
            meta.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        };

        meta.addEventListener('click', event => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('a'))
                return;
            toggleExpanded();
        });
        meta.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            toggleExpanded();
        });
    }

    async updateModuleCard(card: HTMLElement, module: IModuleMeta, installable: boolean, installedInLibrary: boolean, renderVersion: number): Promise<void> {
        const translator = await module.getTranslator;
        if (renderVersion !== this.renderVersion)
            return;

        const highlightTerm = this.getSearchHighlightTerm();

        card.dataset.moduleName = module.name;
        card.className = 'aux-panel-placeholder aux-module-card';
        card.classList.toggle('available-in-library', installable);
        card.classList.toggle('installed-in-library', installedInLibrary);
        card.setAttribute('aria-label', _('{title} module', {
            title: translator(module.title),
        }));

        this.updateModuleCardHeader(card, module, translator, highlightTerm);
        this.updateInstalledBadge(card, module, installable, installedInLibrary);
        this.updateModuleCardDescription(card, module, translator, highlightTerm);
        this.updateModuleCardAuthors(card, module, highlightTerm);
        this.updateModuleCardActions(card, module, installable, installedInLibrary);
        this.updateModuleCardAnalyses(card, module, installable, installedInLibrary, translator, highlightTerm);
    }

    updateModuleCardHeader(card: HTMLElement, module: IModuleMeta, translator: (value: string) => string, highlightTerm: string): void {
        const icon = card.querySelector<HTMLElement>('.aux-module-icon');
        if (icon !== null)
            icon.textContent = this.getModuleInitials(module);

        const title = card.querySelector<HTMLElement>('.aux-module-title');
        if (title !== null)
            title.replaceChildren(this.createHighlightedTextContent(translator(module.title), highlightTerm));

        const name = card.querySelector<HTMLElement>('.aux-module-name');
        if (name !== null)
            name.replaceChildren(this.createHighlightedTextContent(module.name, highlightTerm));

        const version = card.querySelector<HTMLElement>('.aux-module-version');
        if (version !== null)
            version.textContent = `v${ Version.stringify(module.version, 3) }`;
    }

    updateInstalledBadge(card: HTMLElement, module: IModuleMeta, installable: boolean, installedInLibrary: boolean): void {
        let installedBadge = card.querySelector<HTMLElement>('.aux-module-installed-badge');
        if (! installable) {
            installedBadge?.remove();
            return;
        }

        if (installedBadge === null) {
            installedBadge = this.createStatusChip(_('Installed'));
            installedBadge.classList.add('aux-module-installed-badge', 'hidden');
            const header = card.querySelector<HTMLElement>('.aux-module-header');
            if (header !== null)
                header.after(installedBadge);
            else
                card.prepend(installedBadge);
        }

        const showInstalledBadge = installedInLibrary && module.ops.includes('installed');
        installedBadge.classList.toggle('hidden', ! showInstalledBadge);
        installedBadge.setAttribute('aria-hidden', showInstalledBadge ? 'false' : 'true');
    }

    updateModuleCardDescription(card: HTMLElement, module: IModuleMeta, translator: (value: string) => string, highlightTerm: string): void {
        const meta = card.querySelector<HTMLElement>('.aux-module-meta');
        if (meta === null)
            return;

        const description = translator(module.description).trim();
        meta.replaceChildren();
        meta.classList.remove('expanded');

        if (description) {
            meta.append(this.createDescriptionContent(description, highlightTerm));
            meta.title = description;
            meta.tabIndex = 0;
            meta.dataset.expandable = 'true';
            meta.setAttribute('role', 'button');
            meta.setAttribute('aria-expanded', 'false');
            this.expandDescriptionForHiddenHighlight(meta);
            return;
        }

        meta.textContent = _('{analysisCount} analyses', {
            analysisCount: module.analyses.length.toLocaleString(),
        });
        meta.removeAttribute('title');
        meta.removeAttribute('role');
        meta.removeAttribute('aria-expanded');
        delete meta.dataset.expandable;
        meta.removeAttribute('tabindex');
    }

    updateModuleCardAuthors(card: HTMLElement, module: IModuleMeta, highlightTerm: string): void {
        const authors = card.querySelector<HTMLElement>('.aux-module-authors');
        if (authors === null)
            return;

        const authorList = module.authors.filter(author => author && author.trim() !== '');
        authors.replaceChildren();
        authors.hidden = authorList.length === 0;
        if (authorList.length > 0)
            authors.append(this.createHighlightedTextContent(authorList.join(', '), highlightTerm));
    }

    updateModuleCardActions(card: HTMLElement, module: IModuleMeta, installable: boolean, installedInLibrary: boolean): void {
        const actions = card.querySelector<HTMLElement>('.aux-module-actions');
        if (actions === null)
            return;

        const actionFocusKey = this.captureActionFocusKey(card);
        const installState = this.installStates.get(module.name);
        const isInstalling = installState !== undefined;
        const canInstall = module.ops.includes('install') || module.ops.includes('update');
        if (canInstall)
            actions.dataset.role = 'module-actions';
        else
            delete actions.dataset.role;

        const signature = [
            installable ? 'installable' : 'installed',
            installedInLibrary ? 'library-installed' : 'direct-list',
            isInstalling ? 'installing' : 'idle',
            module.ops.join(','),
            module.visible ? 'visible' : 'hidden',
        ].join('|');

        if (actions.dataset.signature === signature) {
            if (isInstalling && installState !== undefined) {
                const progressElement = actions.querySelector<HTMLElement>('[data-role="install-progress"]');
                if (progressElement !== null) {
                    this.updateInstallProgress(progressElement, installState);
                    this.restoreActionFocus(card, actionFocusKey);
                }
            }
            return;
        }

        actions.dataset.signature = signature;
        actions.replaceChildren();

        if (isInstalling && canInstall) {
            actions.append(this.createInstallProgress(installState, {
                cancelAction: () => this.cancelInstallModule(module),
            }));
        }
        else if (installable && module.ops.includes('install')) {
            const button = this.createActionButton(
                _('Install'),
                () => this.installModule(module), false, 'primary');
            button.dataset.installAction = 'install';
            actions.append(button);
        }

        if (! isInstalling && module.ops.includes('update')) {
            const button = this.createActionButton(
                _('Update'),
                () => this.installModule(module), false, 'primary');
            button.dataset.installAction = 'update';
            actions.append(button);
        }

        if (module.ops.includes('remove'))
            actions.append(this.createActionButton(_('Remove'), event => this.uninstallModule(module, event), false, 'subtle'));

        if (! installedInLibrary && (module.ops.includes('show') || module.ops.includes('hide'))) {
            const label = module.visible ? _('Hide') : _('Show');
            actions.append(this.createActionButton(label, () => this.toggleVisibility(module), false, 'subtle'));
        }

        if (! isInstalling) {
            if (module.ops.includes('installed') && ! installedInLibrary)
                actions.append(this.createStatusChip(_('Installed')));
            if (module.ops.includes('unavailable'))
                actions.append(this.createStatusChip(_('Unavailable'), 'warning'));
            if (module.ops.includes('old'))
                actions.append(this.createStatusChip(_('Requires newer jamovi'), 'warning'));
            if (module.ops.includes('incompatible'))
                actions.append(this.createStatusChip(_('Needs update'), 'warning'));
        }

        actions.hidden = actions.childElementCount === 0;
        this.restoreActionFocus(card, actionFocusKey);
    }

    updateModuleCardAnalyses(card: HTMLElement, module: IModuleMeta, installable: boolean, installedInLibrary: boolean, translator: (value: string) => string, highlightTerm: string): void {
        const analysesHost = card.querySelector<HTMLElement>('.aux-module-analyses-host');
        if (analysesHost === null)
            return;

        analysesHost.replaceChildren();

        const analyses = installedInLibrary
            ? null
            : installable
            ? this.createAvailableAnalyses(module, translator, highlightTerm)
            : this.createInstalledAnalyses(module, translator, highlightTerm);

        analysesHost.hidden = analyses === null || analyses.childElementCount === 0;
        if (analyses !== null && analyses.childElementCount > 0)
            analysesHost.append(analyses);
    }

    getModuleInitials(module: IModuleMeta): string {
        const source = module.name.trim();
        const words = source
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(/[\s:_-]+/)
            .filter(word => /[A-Za-z0-9]/.test(word));

        if (words.length >= 2)
            return `${ words[0][0] }${ words[1][0] }`.toUpperCase();

        return source.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'J';
    }

    createAvailableAnalyses(module: IModuleMeta, translator: (value: string) => string, highlightTerm = ''): HTMLDivElement {
        const analyses = h('div', { class: 'aux-module-analyses' });
        for (const analysis of module.analyses.slice(0, 4)) {
            const label = translator(analysis.menuTitle || analysis.title);
            analyses.append(this.createActionButton(label, () => this.runAnalysis(module, analysis.name, analysis.title), true, 'default', highlightTerm));
        }
        return analyses;
    }

    createInstalledAnalyses(module: IModuleMeta, translator: (value: string) => string, highlightTerm = ''): HTMLElement {
        const details = h('details', { class: 'aux-module-analyses-list' });

        const summary = h('summary', { class: 'aux-module-analyses-summary' }, _('Analyses ({count})', {
            count: module.analyses.length.toLocaleString(),
        }));

        const list = h('div', { class: 'aux-module-analyses-items' });

        for (const analysis of module.analyses) {
            const button = h('button', {
                type: 'button',
                class: 'aux-module-analysis-link',
            });
            button.append(this.createHighlightedTextContent(translator(analysis.menuTitle || analysis.title), highlightTerm));
            button.addEventListener('click', () => this.runAnalysis(module, analysis.name, analysis.title));
            list.append(button);
        }

        details.append(summary, list);
        return details;
    }

    createActionButton(label: string, action: (event: ModuleActionEvent) => void, secondary = false, emphasis: 'default' | 'primary' | 'subtle' = 'default', highlightTerm = ''): HTMLButtonElement {
        const button = h('button', {
            type: 'button',
            class: secondary ? 'aux-module-analysis-button' : 'aux-module-action-button',
        });
        button.dataset.emphasis = emphasis;
        button.dataset.actionFocusKey = label;
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ')
                button.dataset.keyboardTriggered = 'true';
        });
        const icon = this.createActionIcon(label, secondary);
        if (icon)
            button.append(icon);

        const text = h('span', { class: 'aux-module-action-label' });
        text.append(this.createHighlightedTextContent(label, highlightTerm));
        button.append(text);
        button.addEventListener('click', event => {
            const keyboardTriggered = button.dataset.keyboardTriggered === 'true' || event.detail === 0;
            delete button.dataset.keyboardTriggered;
            action(Object.assign(event, { keyboardTriggered }));
        });
        return button;
    }

    captureActionFocusKey(card: HTMLElement): string | null {
        const activeElement = document.activeElement;
        if (! (activeElement instanceof HTMLElement) || ! card.contains(activeElement))
            return null;

        const action = activeElement.closest<HTMLElement>('[data-action-focus-key]');
        if (action === null || ! card.contains(action))
            return null;

        return action.dataset.actionFocusKey || '';
    }

    restoreActionFocus(card: HTMLElement, actionFocusKey: string | null): void {
        if (actionFocusKey === null)
            return;

        const focusTarget = this.findActionFocusTarget(card, actionFocusKey);
        focusTarget?.focus();
    }

    findActionFocusTarget(card: HTMLElement, actionFocusKey: string): HTMLElement | null {
        const escapedFocusKey = CSS.escape(actionFocusKey);
        const matchingAction = card.querySelector<HTMLElement>(`.aux-module-actions [data-action-focus-key="${ escapedFocusKey }"]:not(:disabled)`);
        if (matchingAction !== null && this.isVisibleFocusableElement(matchingAction))
            return matchingAction;

        const fallbackActions = Array.from(card.querySelectorAll<HTMLElement>('.aux-module-actions [data-action-focus-key]:not(:disabled)'));
        return fallbackActions.find(action => this.isVisibleFocusableElement(action)) || null;
    }

    createActionIcon(label: string, secondary: boolean): HTMLSpanElement | null {
        if (secondary)
            return null;

        const icon = h('span', { class: 'aux-module-action-icon' });

        let svg = '';
        switch (label) {
            case _('Install'):
            case _('Update'):
                svg = `
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M8 3v6" />
                        <path d="M5.5 6.5 8 9l2.5-2.5" />
                        <path d="M3.5 12.5h9" />
                    </svg>`;
                break;
            case _('Remove'):
                svg = `
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3.5 4.5h9" />
                        <path d="M6.5 2.5h3" />
                        <path d="M5 4.5v8" />
                        <path d="M11 4.5v8" />
                        <path d="M4.5 4.5l.5 8h6l.5-8" />
                    </svg>`;
                break;
            case _('Hide'):
                svg = `
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M2 8s2.2-3 6-3 6 3 6 3-2.2 3-6 3-6-3-6-3Z" />
                        <path d="M6.8 7.9a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0Z" />
                        <path d="M3 13 13 3" />
                    </svg>`;
                break;
            case _('Show'):
                svg = `
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M2 8s2.2-3 6-3 6 3 6 3-2.2 3-6 3-6-3-6-3Z" />
                        <path d="M6.8 7.9a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 0 0-2.4 0Z" />
                    </svg>`;
                break;
        }

        if (svg === '')
            return null;

        icon.append(htmlTrusted<SVGElement>(svg));
        return icon;
    }

    createStatusChip(label: string, tone: 'default' | 'warning' = 'default'): HTMLSpanElement {
        const chip = h('span', { class: 'aux-module-status-chip' });
        chip.dataset.tone = tone;

        if (tone === 'default') {
            const icon = h('span', {
                class: 'aux-module-status-icon',
                'aria-hidden': 'true',
            });
            icon.textContent = '✓';
            chip.append(icon);
        }

        const text = h('span', {}, label);
        chip.append(text);
        return chip;
    }

    createInstallProgress(state: ModuleInstallState, options?: { text?: string; className?: string; cancelAction?: () => void; cancelLabel?: string }): HTMLDivElement {
        const wrap = h('div', { class: options?.className || 'aux-module-progress-wrap' });
        wrap.dataset.role = 'install-progress';

        const progressText = h('div', { class: 'aux-module-progress-text' }, options?.text || (state.cancelRequested ? _('Cancelling') : _('Installing')));

        const progressBar = h('div', {
            class: 'aux-module-progress',
            role: 'progressbar',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': state.percent.toString(),
        });

        const progressBarFill = h('div', { class: 'aux-module-progress-bar' });
        progressBarFill.style.width = `${ state.percent }%`;

        const progressLabel = h('div', { class: 'aux-module-progress-label' }, _('{percent}%', { percent: state.percent.toString() }));

        progressBar.append(progressBarFill);
        wrap.append(progressText, progressBar, progressLabel);

        if (options?.cancelAction !== undefined) {
            const cancelButton = this.createActionButton(
                options.cancelLabel || _('Cancel'),
                options.cancelAction,
                false,
                'subtle');
            cancelButton.classList.add('aux-module-progress-cancel');
            cancelButton.disabled = state.cancelRequested;
            wrap.append(cancelButton);
        }

        return wrap;
    }

    updateInstallProgress(progressElement: HTMLElement, state: ModuleInstallState, text?: string): void {
        const progressText = progressElement.querySelector<HTMLElement>('.aux-module-progress-text');
        if (progressText !== null)
            progressText.textContent = text || (state.cancelRequested ? _('Cancelling') : _('Installing'));

        const progressBar = progressElement.querySelector<HTMLElement>('.aux-module-progress');
        if (progressBar !== null)
            progressBar.setAttribute('aria-valuenow', state.percent.toString());

        const progressBarFill = progressElement.querySelector<HTMLElement>('.aux-module-progress-bar');
        if (progressBarFill !== null)
            progressBarFill.style.width = `${ state.percent }%`;

        const progressLabel = progressElement.querySelector<HTMLElement>('.aux-module-progress-label');
        if (progressLabel !== null)
            progressLabel.textContent = _('{percent}%', { percent: state.percent.toString() });

        const cancelButton = progressElement.querySelector<HTMLButtonElement>('.aux-module-progress-cancel');
        if (cancelButton !== null)
            cancelButton.disabled = state.cancelRequested;
    }

    updateInstallCard(module: IModuleMeta): void {
        if (this.listElement === null)
            return;

        const card = this.listElement.querySelector<HTMLElement>(`.aux-module-card[data-module-name="${ module.name }"]`);
        if (card === null)
            return;

        const installState = this.installStates.get(module.name);
        const isInstalling = installState !== undefined;
        const actions = card.querySelector<HTMLElement>('[data-role="module-actions"]');
        if (actions === null)
            return;

        const actionFocusKey = this.captureActionFocusKey(card);
        if (isInstalling) {
            const progressElement = actions.querySelector<HTMLElement>('[data-role="install-progress"]');
            if (progressElement !== null) {
                this.updateInstallProgress(progressElement, installState);
                this.restoreActionFocus(card, actionFocusKey);
                return;
            }

            actions.replaceChildren(this.createInstallProgress(installState, {
                cancelAction: () => this.cancelInstallModule(module),
            }));
            this.restoreActionFocus(card, actionFocusKey);
            return;
        }

        const source = module.url || module.path;
        if (! source)
            return;

        actions.replaceChildren();

        if (module.ops.includes('install')) {
            const button = this.createActionButton(_('Install'), () => this.installModule(module), false, 'primary');
            button.dataset.installAction = 'install';
            actions.append(button);
        }

        if (module.ops.includes('update')) {
            const button = this.createActionButton(_('Update'), () => this.installModule(module), false, 'primary');
            button.dataset.installAction = 'update';
            actions.append(button);
        }

        this.restoreActionFocus(card, actionFocusKey);
    }

    installModule(module: IModuleMeta): void {
        const source = module.url || module.path;
        if (! source)
            return;

        this.cancelledInstallSources.delete(source);
        this.installStates.set(module.name, {
            source,
            progress: [ 0, 1 ],
            percent: 0,
            cancelRequested: false,
        });
        this.updateSummaryProgress();
        this.updateInstallCard(module);

        void this.model.installModule(source).then(() => {
            this.cancelledInstallSources.delete(source);
            this.installStates.delete(module.name);
            this.updateSummaryProgress();
            this.model.modules().available().retrieve();
            this.model.trigger('notification', new Notify({
                title: _('Module installed'),
                message: _('{module} was installed successfully', { module: module.title }),
                duration: 3000,
                type: 'success'
            }));
            this.update();
        }, error => {
            const wasCancelled = this.installStates.get(module.name)?.cancelRequested === true
                || this.cancelledInstallSources.delete(source);
            this.installStates.delete(module.name);
            this.updateSummaryProgress();
            if (! wasCancelled) {
                this.model.trigger('notification', new Notify({
                    title: _('Unable to install module'),
                    message: error.cause || error.message || '',
                    duration: 4000,
                    type: 'error'
                }));
            }
            this.update();
        }, progress => {
            const previousState = this.installStates.get(module.name);
            if (previousState === undefined && this.cancelledInstallSources.has(source))
                return;

            const value = progress?.[0] || 0;
            const total = progress?.[1] || 1;
            const percent = Math.max(0, Math.min(100, Math.round((100 * value) / total)));
            this.installStates.set(module.name, {
                source,
                progress: [ value, total ],
                percent,
                cancelRequested: previousState?.cancelRequested === true,
            });
            this.updateSummaryProgress();
            this.updateInstallCard(module);
        });
    }

    cancelInstallModule(module: IModuleMeta): void {
        const installState = this.installStates.get(module.name);
        if (installState === undefined || installState.cancelRequested)
            return;

        this.installStates.set(module.name, {
            ...installState,
            cancelRequested: true,
        });
        this.cancelledInstallSources.add(installState.source);
        this.updateSummaryProgress();
        this.updateInstallCard(module);

        this.cancelInstallBySource(installState.source, error => {
            this.cancelledInstallSources.delete(installState.source);
            const currentState = this.installStates.get(module.name);
            if (currentState !== undefined) {
                this.installStates.set(module.name, {
                    ...currentState,
                    cancelRequested: false,
                });
            }
            this.updateSummaryProgress();
            this.updateInstallCard(module);
            this.notifyUnableToCancelInstall(error);
        }, () => {
            this.installStates.delete(module.name);
            this.updateSummaryProgress();
            this.updateInstallCard(module);
            void this.update();
        });
    }

    cancelInstallBySource(source: string, onError?: (error: any) => void, onSuccess?: () => void): void {
        void this.model.cancelInstallModule(source).then(() => {
            onSuccess?.();
        }, error => {
            if (onError !== undefined) {
                onError(error);
                return;
            }

            this.notifyUnableToCancelInstall(error);
        });
    }

    notifyUnableToCancelInstall(error: any): void {
        this.model.trigger('notification', new Notify({
            title: _('Unable to cancel install'),
            message: error.cause || error.message || '',
            duration: 4000,
            type: 'error'
        }));
    }

    uninstallModule(module: IModuleMeta, event?: ModuleActionEvent): void {
        if (this.selectedTab === 'installed') {
            this.pendingInstalledRemovals.add(module.name);
            if (event?.keyboardTriggered)
                this.pendingInstalledRemovalFocus.set(module.name, this.captureInstalledRemovalFocusTarget(module.name));
        }

        void this.model.modules().uninstall(module.name).then(() => {
            this.model.trigger('notification', new Notify({
                title: _('Module uninstalled'),
                message: _('{module} was uninstalled successfully', { module: module.title }),
                duration: 3000,
                type: 'success'
            }));
            this.update();
        }, error => {
            this.pendingInstalledRemovals.delete(module.name);
            this.pendingInstalledRemovalFocus.delete(module.name);
            this.model.trigger('notification', new Notify({
                title: _('Unable to uninstall module'),
                message: error.message || '',
                duration: 4000,
                type: 'error'
            }));
        });
    }

    toggleVisibility(module: IModuleMeta): void {
        this.model.modules().toggleModuleVisibility(module.name);
        void this.update();
    }

    runAnalysis(module: IModuleMeta, analysisName: string, analysisTitle: string): void {
        void module.getTranslator.then(translator => {
            this.model.createAnalysis({
                name: analysisName,
                ns: module.name,
                title: translator(analysisTitle),
            });
        });
    }

    describeModule(module: IModuleMeta): string {
        const hiddenState = module.visible ? _('visible') : _('hidden');
        return _('{title} ({analysisCount} analyses, {hiddenState})', {
            title: module.title,
            analysisCount: module.analyses.length.toLocaleString(),
            hiddenState,
        });
    }

}
