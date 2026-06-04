
import type { FSEntryListModel, BackstagePanelView } from './fsentry';

export interface IPlace {
    name: string;
    title: string;
    keyTipKey: string,
    model?: FSEntryListModel;
    view?: BackstagePanelView;
    action?: () => any;
    separator?: boolean;
}

export interface IBackstageExtras {
    init(backstage: any): void;
    getOpenPlaces(): IPlace[];
    getSaveAsPlaces(): IPlace[];
}
