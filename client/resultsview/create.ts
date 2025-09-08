'use strict';

import { ITableElementData, Model as TableModel, View as TableView } from './table';
import { GroupElementData, Model as GroupModel, View as GroupView, IGroupElementData } from './group';
import { IImageElementData, Model as ImageModel, View as ImageView } from './image';
import { Model as ArrayModel, View as ArrayView, IArrayElementData } from './array';
import { Model as SyntaxModel, View as SyntaxView } from './syntax';
import { HTMLElementData, Model as HtmlModel, View as HtmlView } from './html';

import { INoticeElementData, Model as NoticeModel, NoticeView } from './notice';
import { ElementData, ElementModel, Model, View } from './element';

export enum AnalysisStatus {
    ANALYSIS_NONE = 0,
    ANALYSIS_INITED = 1,
    ANALYSIS_RUNNING = 2,
    ANALYSIS_COMPLETE = 3,
    ANALYSIS_ERROR = 4,
    ANALYSIS_RENDERING = 5
}

export interface IElement {
    type: 'table' | 'group' | 'image' | 'array' | 'preformatted' | 'html' | 'notice';
    name: string;
    title: string;
    status: AnalysisStatus;
    error: { message: string, cause: string };
    refs: string[];
    visible: 0 | 1 | 2 | 3;
    stale: boolean;
}


export interface ITableElement extends IElement {
    type: 'table';
    table: ITableElementData;
}

const isTable = function(obj: IElement): obj is ITableElement {
    return obj && obj.type === 'table';
}


export interface IImageElement extends IElement {
    type: 'image';
    image: IImageElementData;
}

const isImage = function(obj: IElement): obj is IImageElement {
    return obj && obj.type === 'image';
}


export interface IArrayElement extends IElement {
    type: 'array';
    array: IArrayElementData;
}

export const isArray = function(obj: IElement): obj is IArrayElement {
    return obj && obj.type === 'array';
}


export interface IGroupElement extends IElement {
    type: 'group';
    group: IGroupElementData;
}

export const isGroup = function(obj: IElement): obj is IGroupElement {
    return obj && obj.type === 'group';
}


export interface IPreformattedElement extends IElement {
    type: 'preformatted';
    preformatted: string;
    stale: boolean;
}

export const isPreformatted = function(obj: IElement): obj is IPreformattedElement {
    return obj && obj.type === 'preformatted';
}


export interface IHtmlElement extends IElement {
    type: 'html';
    html: HTMLElementData;
    stale: boolean;
}

export const isHtml = function(obj: IElement): obj is IHtmlElement {
    return obj && obj.type === 'html';
}


export interface INoticeElement extends IElement {
    type: 'notice';
    notice: INoticeElementData;
    stale: boolean;
}

export const isNotice = function(obj: IElement): obj is INoticeElement {
    return obj && obj.type === 'notice';
}


export const createItem = function(element: IElement, options, level: number, parent: View, mode: string = 'rich', devMode, fmt, refTable ) {

    if (level === undefined)
        level = 1;
    if (mode === undefined)
        mode = 'rich';

    let model;
    let view: View = null;

    let viewParams: ElementData = {
        update: updateItem,
        level: level,
        parent: parent,
        mode: mode,
        fmt: fmt,
        devMode: devMode,
        create: createItem
    };

    let modelParams: ElementModel = {
        name : element.name,
        title : element.title,
        status: element.status,
        error: element.error,
        stale: element.stale,
        refs: element.refs,
        options: options,
        refTable: refTable,
        element: undefined
    };

    if (isTable(element)) {
        modelParams.element = element.table;
        model = new TableModel(modelParams);
        view = new TableView(model, viewParams);
    }
    else if (isGroup(element)) {

        let visible;

        if (element.visible === 2) {
            visible = true;
        }
        else {
            visible = false;
            for (let child of element.group.elements) {
                if (child.visible === 0 || child.visible === 2) {
                    visible = true;
                    break;
                }
            }
        }

        if (visible) {
            modelParams.element = element.group;
            model = new GroupModel(modelParams);
            
            let params: GroupElementData = { ...viewParams, isEmptyAnalysis: parent.isEmptyAnalysis === undefined ? false : parent.isEmptyAnalysis, hasTitle: parent.hasTitle === undefined ? true : parent.hasTitle };
            view = new GroupView(model, params);
        }
        else {
            view = null;
        }
    }
    else if (isImage(element)) {
        modelParams.element = element.image;
        model = new ImageModel(modelParams);
        view = new ImageView(model, viewParams);
    }
    else if (isArray(element)) {

        let visible = false;

        if (element.array.hasHeader)
            visible = true;

        for (let child of element.array.elements) {
            if (child.visible === 0 || child.visible === 2)
                visible = true;
        }

        if (visible) {
            modelParams.element = element.array;
            model = new ArrayModel(modelParams);
            view = new ArrayView(model, viewParams);
        }
        else {
            view = null;
        }
    }
    else if (isPreformatted(element)) {
        modelParams.element = element.preformatted;
        model = new SyntaxModel(modelParams);
        view = new SyntaxView(model, viewParams);
    }
    else if (isHtml(element)) {
        modelParams.element = element.html;
        model = new HtmlModel(modelParams);
        view = new HtmlView(model, viewParams);
    }
    else if (isNotice(element)) {
        modelParams.element = element.notice;
        model = new NoticeModel(modelParams);
        view = new NoticeView(model, viewParams);
    }

    return view;
};
type InferType<T> = T extends Model<infer A> ? A : never;
const updateItem = function<V extends View<M, T>, M extends Model<T>, T extends ElementModel = InferType<M>> (item: V, element: IElement, options, level: number, mode: string, devMode, fmt, refTable ) {

    if (level === undefined)
        level = 1;
    if (mode === undefined)
        mode = 'rich';

    let view = item;

    if (isTable(element) && view instanceof TableView) {
        let model = view.model;
        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.table;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;


        model.initialize();

        view.level = level;
        view.mode = mode;
        view.fmt = fmt;
    }
    else if (isGroup(element)) {

        let visible;

        if (element.visible === 2) {
            visible = true;
        }
        else {
            visible = false;
            for (let child of element.group.elements) {
                if (child.visible === 0 || child.visible === 2) {
                    visible = true;
                    break;
                }
            }
        }

        if (visible && view instanceof GroupView) {
            let model = view.model;
            model.attributes.name = element.name;
            model.attributes.title = element.title;
            model.attributes.element = element.group;
            model.attributes.status = element.status;
            model.attributes.error = element.error;
            model.attributes.refs = element.refs;
            model.attributes.options = options;
            model.attributes.refTable = refTable;

            view.level = level;
            view.mode = mode;
            view.devMode = devMode;
            view.fmt = fmt;
        }
        else
            return false;
    }
    else if (isImage(element) && view instanceof ImageView) {
        let model = view.model;
        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.image;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }
    else if (isArray(element)) {

        let visible = false;

        if (element.array.hasHeader)
            visible = true;

        for (let child of element.array.elements) {
            if (child.visible === 0 || child.visible === 2)
                visible = true;
        }

        if (visible && view instanceof ArrayView) {
            let model = view.model;
            model.attributes.name = element.name;
            model.attributes.title = element.title;
            model.attributes.element = element.array;
            model.attributes.status = element.status;
            model.attributes.error = element.error;
            model.attributes.refs = element.refs;
            model.attributes.options = options;
            model.attributes.refTable = refTable;

            view.level = level;
            view.mode = mode;
            view.fmt = fmt;
        }
        else {
            return false;
        }
    }
    else if (isPreformatted(element) && view instanceof SyntaxView) {
        let model = view.model;
        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.preformatted;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.stale = element.stale;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }
    else if (isHtml(element) && view instanceof HtmlView) {
        let model = view.model;
        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.html;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.stale = element.stale;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }
    else if (isNotice(element) && view instanceof NoticeView) {
        let model = view.model;
        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.notice;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.stale = element.stale;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }

    return true;
};


export default createItem;
