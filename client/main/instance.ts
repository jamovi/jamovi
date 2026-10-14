//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import path from 'path';

import host from './host';
import Notify from './notification';

import Analyses, { Analysis } from './analyses';
import DataSetViewModel from './dataset';
import OptionsPB from './optionspb';
import { IModuleMeta, Modules } from './modules';
import I18ns from '../common/i18n';

import Settings, { Theme } from './settings';
import ProgressStream from './utils/progressstream';

import { UserFacingError } from './errors';
import { CancelledError } from './errors';
import { EventMap } from '../common/eventmap';

class FileExistsError extends Error { }

interface CreateAnalysisOptions {
    readonly name: string;
    readonly ns: string;
    readonly title: string;
    readonly index?: number;
    readonly onlyOne?: boolean;
}

import { parse as parseJsonLines } from './utils/jsonlines';
import { ISaveOptions } from './backstage/fsentry';
import Coms, { QQ } from './coms';
import { ResultsView } from './results';
import MsgDialog from '../common/msgdialog';
import { recentlyRelocated, Relocation } from './relocate';

// a proxy in front of the server gave up waiting for a response (504, or
// cloudflare's 524). if the browser was still sending the file at the time,
// the upload itself took too long; otherwise the server did
function isProxyTimeout(status: number): boolean {
    return status === 504 || status === 524;
}

function timedOut(uploaded: boolean): string {
    if (uploaded)
        return _('The server took too long to respond. Please try again.');
    return _('The upload took too long to complete. Please try again with a faster connection, or a smaller file.');
}

// reads a json lines response, passing on its 'in-progress' lines as
// progress, and resolving with the last line
async function readJsonLines(body: ReadableStream | null, setProgress: (progress: any) => void): Promise<any> {

    if (body === null)
        return undefined;

    const stream = parseJsonLines(body.getReader());
    for await (const message of stream as AsyncIterable<any>) {
        if (message.status === 'in-progress') {
            if ( ! message.title)
                message.title = _('Opening');
            setProgress(message);
        }
    }
    return await stream;
}

// whether a response body says the session has gone
function isNoSession(body: string): boolean {
    try {
        return JSON.parse(body).status === 'no-session';
    }
    catch (e) {
        return false;
    }
}

export interface IInstanceOpenOptions {
    path?: string,
    url?: string,
    file?: File,
    title?: string,
    temp?: boolean,
    authToken?: string,
    accessKey?: string,
    headers?: { [key: string]: string },
}

// signing in (again) is needed to start a session
interface IInstanceOpenRequiresAuth {
    status: 'requires-auth',
}

// no room to start a session just now
interface IInstanceOpenFull {
    status: 'full',
    message?: string,
}

interface IInstanceOpenError {
    status: 'terminated',
    message: string,
    cause: string,
}

interface IInstanceOpenSuccess {
    status: 'OK',
    // the instance opened. absent when there was nothing to open (an
    // instance being reconnected to that already has its data set)
    instanceId?: string,
}

// the page is to be loaded again; see relocate.ts
type IInstanceOpenRelocation = Relocation;

export type IInstanceOpenResult = IInstanceOpenSuccess | IInstanceOpenRequiresAuth | IInstanceOpenFull | IInstanceOpenError | IInstanceOpenRelocation;

export interface IInstanceOpenProgress {
    title: string,
    p: number,
    n: number,
    cancel: () => void,
    'message-src'?: string,
}

export type InstanceOpenStream = ProgressStream<IInstanceOpenProgress, IInstanceOpenResult>;

// a file copied into the session (for a 'File' analysis option). id is its
// name there, derived from its content; filename is the name the user chose
export interface IFileEntry {
    id: string,
    filename: string,
}

export interface IModuleInteractions {
    installModule: (name: string) => QQ.Promise<void>,
    uninstallModule: (name: string) => QQ.Promise<void>,
    setModuleVisibility: (name: string, value: boolean) =>  QQ.Promise<void>,
    retrieveAvailableModules: () => QQ.Promise<void>,
}

export interface ISettingsProvider {
    settings: () => Settings;
}

export interface IInstanceModel {
    coms : Coms,
    selectedAnalysis : Analysis | 'refsTable' | null,
    hasDataSet : boolean,
    path : string,
    title : string,
    blank : boolean,
    resultsSupplier: ResultsView,
    arbitraryCodePresent: boolean,
    editState: boolean,
    saveFormat: string,
    edited: boolean,
    resultsLanguage: string
}

export interface IBackstageResources {
    browse: (filePath: string, extensions: string[]) => any,
    modules: () => Modules,
    open: (options: IInstanceOpenOptions) => InstanceOpenStream,
    dataSetModel: () => DataSetViewModel,
    import: (paths: string[]) => any,
    save: (options: ISaveOptions) => any
}

export type IModulesProvider = IModuleInteractions & ISettingsProvider & EventMap<IInstanceModel>;

export type IBackstageSupport = IBackstageResources & ISettingsProvider & EventMap<IInstanceModel>;

export class Instance extends EventMap<IInstanceModel> implements IBackstageSupport{

    _settings: Settings;
    _modules: Modules;
    _dataSetModel: DataSetViewModel;
    _instanceId: string;
    _onBC: (broadcast) => void;
    _onResume: (event: Event) => void;
    transId: number = 0;
    seqNo: number = 0;
    command: string = '';
    _analyses: Analyses;

    constructor(coms: Coms) {
        super({
            coms : coms,
            selectedAnalysis : null,
            hasDataSet : false,
            path : null,
            title : '',
            blank : false,
            resultsSupplier: null,
            arbitraryCodePresent: false,
            editState: false,
            saveFormat: undefined,
            edited: false,
            resultsLanguage: I18ns.get('app').language
        })

        this._settings = new Settings({ coms: this.attributes.coms });
        this._modules = new Modules({ instance: this });

        this._dataSetModel = new DataSetViewModel(this.attributes.coms);
        this._dataSetModel.on('columnsChanged', this._columnsChanged, this);

        this._analyses = new Analyses(this._dataSetModel, this._modules);

        this._analyses.on('analysisOptionsChanged', this._onOptionsChanged, this);
        this._analyses.on('analysisDeleted', this._onAnalysisDeleted, this);

        this._instanceId = null;

        this._onBC = (bc => this._onReceive(bc));
        this.attributes.coms.on('broadcast', this._onBC);

        // a page coming back from the background may have a dead connection
        // that hasn't noticed (an iPad, in particular)
        this._onResume = (event) => {
            if (event.type === 'pageshow' && ! (event as PageTransitionEvent).persisted)
                return;
            if (document.visibilityState === 'visible')
                this._verifyConnection();
        };
        document.addEventListener('visibilitychange', this._onResume);
        window.addEventListener('pageshow', this._onResume);

        this._modules.on('moduleUninstalled', (meta) => {
            let moduleName = meta.name;
            this._modules.purgeCache(moduleName);

            for (let analysis of this._analyses) {
                if (analysis.ns === moduleName)
                    analysis.reload();
            }

            this.trigger('moduleUninstalled', { name: moduleName });
        });

        this._modules.on('moduleInstalled moduleUpdated moduleChanged', (meta: IModuleMeta) => {
            let moduleName = meta.name;
            this._modules.purgeCache(moduleName);

            for (let analysis of this._analyses) {
                if (analysis.ns === moduleName)
                    analysis.reload();
            }

            this.trigger('moduleInstalled', { name: moduleName });
        });
    }

    // an analysis can be removed by the server (an undo, say), so its
    // options are closed here rather than only where the user deletes it
    _onAnalysisDeleted(analysis: Analysis) {
        if (this.get('selectedAnalysis') === analysis)
            this.set('selectedAnalysis', null);
    }

    _onOptionsChanged(analysis, incoming, noUndo?: boolean) {
        if ( ! incoming)
            this._runAnalysis(analysis, undefined, noUndo);
    }

    destroy() {
        this._dataSetModel.off('columnsChanged', this._columnsChanged, this);
        this._analyses.off('analysisOptionsChanged', this._onOptionsChanged, this);
        this._analyses.off('analysisDeleted', this._onAnalysisDeleted, this);
        this.attributes.coms.off('broadcast', this._onBC);
        document.removeEventListener('visibilitychange', this._onResume);
        window.removeEventListener('pageshow', this._onResume);
        this._settings.destroy();
    }

    instanceId() {
        return this._instanceId;
    }

    dataSetModel() {
        return this._dataSetModel;
    }

    analyses() {
        return this._analyses;
    }

    settings() {
        return this._settings;
    }

    modules() {
        return this._modules;
    }

    connect(instanceId) {

        let coms = this.attributes.coms;

        return coms.connect().then(() => {

            return this._beginInstance(instanceId);

        }).then(() => {

            return this._settings.retrieve(this._instanceId);

        }).then(() => {

            return this._readDataset();

        }).then(() => {

            return this._instanceId;

        });

    }

    import(paths: string[]) {

        let coms = this.attributes.coms;

        let progress = new Notify({
            title: _('Importing'),
            duration: 0,
        });

        let open = new coms.Messages.OpenRequest();
        open.filePaths = paths;
        open.op = coms.Messages.OpenRequest.Op.IMPORT_REPLACE;

        let request = new coms.Messages.ComsMessage();
        request.payload = open.toArrayBuffer();
        request.payloadType = 'OpenRequest';
        request.instanceId = this._instanceId;

        return coms.send(request).then((response) => {
            progress.dismiss();
            this._readDataset(false);
            this._notify({
                message: _('File imported'),
                cause:  _('Import successful'),
            });
        }, (error: { message: string, cause: string }) => {
            progress.dismiss();
            // we still have to retrieveInfo() on failure, because the import
            // may have failed on, say, the second data set, and the data set
            // will still have changed
            this._readDataset(false);
            this._notify(error);
        }, (prog: [number, number]) => {
            progress.set('progress', prog);
            this.trigger('notification', progress);
            return prog;
        });
    }

    // refuses an upload that can't succeed, before any of it is sent. once a
    // browser starts sending a body the server has no way to stop it, so an
    // upload refused by the server is an upload sent in full first
    _checkUpload(files: Iterable<File | string>) {

        if ( ! this.attributes.coms.connected)
            throw new UserFacingError(_('Upload failed'), { cause: _('The connection to the session has been lost') });

        if (host.maxUploadMB === undefined)
            return;

        let size = 0;
        for (const file of files) {
            if (typeof file !== 'string')  // a path (electron) is copied, not sent
                size += file.size;
        }
        if (size > host.maxUploadMB * 1024 * 1024)
            throw new UserFacingError(_('Upload failed'), { cause: _('File size exceeds session limits') });
    }

    // copies files into the session (for a 'File' analysis option), where
    // the engine can read them. files are either File objects (a browser:
    // the bytes are uploaded) or paths (electron: the server, which is on
    // the same machine, does the copy). progress is reported the same way
    // as open(), so it can be shown in the notification area
    uploadFiles(files: FileList | File[] | string[], signal?: AbortSignal): ProgressStream<IInstanceOpenProgress, IFileEntry[]> {

        return new ProgressStream(async (setProgress): Promise<IFileEntry[]> => {

            this._checkUpload(files);

            // fetch doesn't support upload progress, so we need to use xhr
            let xhr = new XMLHttpRequest();
            xhr.responseType = 'json';

            const cancel = () => xhr.abort();
            if (signal)
                signal.addEventListener('abort', cancel, { once: true });

            setProgress({ title: _('Uploading'), p: 0, n: 0, cancel });

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable)
                    setProgress({ title: _('Uploading'), p: event.loaded, n: event.total, cancel });
            });

            let uploaded = false;  // the whole file was sent
            xhr.upload.addEventListener('load', () => uploaded = true);

            const data = new FormData();
            for (const file of files) {
                if (typeof file === 'string') {
                    // the same shape an upload accelerator hands the server
                    data.append('file.path', file);
                    data.append('file.name', path.basename(file));
                }
                else {
                    data.append('file', file, file.name);
                }
            }

            xhr.open('POST', 'upload', true);
            xhr.send(data);

            await new Promise<void>((resolve) => {
                xhr.addEventListener('loadend', () => resolve(), { once: true });
            });

            if (xhr.status === 0) // aborted
                throw new CancelledError();

            if (xhr.status === 413) {
                // the session's file storage is capped; the server says by how much
                let message = xhr.response?.message || _('File size exceeds session limits');
                throw new UserFacingError(_('Upload failed'), { cause: message });
            }

            if (isProxyTimeout(xhr.status))
                throw new UserFacingError(_('Upload failed'), { cause: timedOut(uploaded) });

            if (xhr.status !== 200)
                throw new UserFacingError(_('Upload failed'), { cause: xhr.statusText });

            return xhr.response as IFileEntry[];
        });
    }

    open(options: IInstanceOpenOptions): InstanceOpenStream {

        if ('url' in options) {
            options.path = options.url;
            delete options.url;
        }

        return new ProgressStream(async (setProgress): Promise<IInstanceOpenResult> => {

            let response;

            let headers = new Headers();
            headers.append('Accept-Language', I18ns.get('app').language);

            if (options.authToken)
                headers.append('Authorization', `Bearer ${ options.authToken }`);

            // tells the server not to ask for a relocation again
            if (recentlyRelocated())
                headers.append('X-Jamovi-Relocated', '1');

            if (options.file)
                this._checkUpload([ options.file ]);

            // 'no-session' means the cookies don't name a live session (and
            // they've been cleared). with an auth token (i.e. at boot) one is
            // started, and the open tried again. without one there's nothing
            // to be done: a data set being reconnected to has gone, and
            // in-app, the session has ended
            let sessionStarted = false;
            const noSession = async (): Promise<IInstanceOpenResult | undefined> => {
                if (options.authToken && ! sessionStarted) {
                    sessionStarted = true;
                    return await this._startSession(headers, setProgress);
                }
                if ( ! options.path && ! options.file) {
                    throw new UserFacingError(_('Sorry'), {
                        cause: _('This data set is no longer available'),
                        status: 'terminated',
                    });
                }
                throw new UserFacingError(_('Unable to open'), {
                    cause: _('Your session has ended. Please refresh the page to continue.'),
                    status: 'disconnected',
                });
            };

            while (true) {

                if (options.file) {

                    const file = options.file;

                    // fetch doesn't support upload progress, so we need to use xhr
                    let xhr = new XMLHttpRequest();
                    xhr.responseType = 'text';  // json lines

                    // create a body stream that's kinda like what the fetch api produces
                    let stream = new ReadableStream({
                        async start(controller) {
                            await new Promise<void>((resolve) => {
                                xhr.addEventListener('progress', (event) => {
                                    let jsonlines = xhr.responseText;
                                    if (jsonlines) {
                                        let pieces = jsonlines.split('\n');
                                        // if the last piece is empty (in jsonlines this will often be the case)
                                        // use the second last piece instead
                                        let lastPiece = pieces[pieces.length - 1] || pieces[pieces.length - 2];
                                        if (lastPiece)
                                            controller.enqueue(lastPiece);
                                    }
                                });
                                xhr.addEventListener('loadend', () => {
                                    if (xhr.readyState === 0)
                                        // aborted
                                        controller.close();
                                    else if (xhr.readyState === 4 && xhr.status === 200)
                                        // great success!
                                        controller.close();
                                    else
                                        // fail
                                        controller.error(new UserFacingError(_('Upload failed'), { cause: xhr.statusText }));
                                    resolve();
                                }, { once: true });
                            });
                        }
                    });

                    setProgress({ title: _('Uploading'), p: 0, n: 0, cancel: () => xhr.abort() });

                    xhr.upload.addEventListener('progress', (event) => {
                        if (event.lengthComputable)
                            setProgress({ title: _('Uploading'), p: event.loaded, n: event.total, cancel: () => xhr.abort() });
                    });

                    let uploaded = false;  // the whole file was sent
                    xhr.upload.addEventListener('load', () => uploaded = true);

                    let url = `${ host.baseUrl }open`;

                    const data = new FormData();
                    data.append('options', JSON.stringify(options));
                    data.append('file', file, file.name);

                    xhr.open('POST', url, true);
                    for (let header of headers.entries())
                        xhr.setRequestHeader(header[0], header[1]);
                    xhr.send(data);

                    // wait till upload completes
                    await new Promise<void>((resolve) => {
                        xhr.addEventListener('readystatechange', (event) => {
                            if (xhr.readyState !== XMLHttpRequest.OPENED)
                                resolve();
                        });
                    });

                    if (xhr.status === 0) // aborted
                        throw new CancelledError();

                    if (xhr.status === 204)
                        return { 'status': 'OK' };

                    if (xhr.status === 401 && isNoSession(xhr.responseText)) {
                        const result = await noSession();
                        if (result)
                            return result;
                        continue;
                    }

                    if (xhr.status === 413)
                        throw new UserFacingError(_('Upload failed'), { cause: _('File size exceeds session limits') });

                    if (isProxyTimeout(xhr.status))
                        throw new UserFacingError(_('Upload failed'), { cause: timedOut(uploaded) });

                    if (xhr.status !== 200)
                        throw new UserFacingError(_('Upload failed'), { cause: xhr.statusText });

                    // if we're here, the upload succeeded, and the opening
                    // process comes next (which may yet fail)
                    // we construct a response something like what the fetch() api returns
                    response = { status: xhr.status, statusText: xhr.statusText, body: stream };
                }
                else {

                    if ('path' in options) {
                        const data = new FormData();
                        data.append('options', JSON.stringify(options));

                        response = await fetch('open', {
                            method: 'POST',
                            headers: headers,
                            body: data,
                        });
                    }
                    else {
                        let url = 'open';

                        if (options.accessKey)
                            url += `?key=${ options.accessKey }`;

                        response = await fetch(url, {
                            method: 'GET',
                            headers: headers,
                        });
                    }

                    if (response.status === 204)
                        return { 'status': 'OK' };

                    if (response.status === 401 && isNoSession(await response.text())) {
                        const result = await noSession();
                        if (result)
                            return result;
                        continue;
                    }

                    if (response.status === 413)
                        throw new UserFacingError(_('Unable to open'), { cause: _('File size exceeds session limits') });

                    if (response.status !== 200)
                        throw new UserFacingError(_('Unable to open'), { cause: response.statusText });
                }

                const message = await readJsonLines(response.body, setProgress);

                if ( ! message) {
                    throw new UserFacingError(_('Unable to open'), {
                        cause: _('Unexpected error'),
                        status: 'error',
                    });
                }
                else if (message.status !== 'OK') {
                    let title = message.title || _('Unable to open');
                    throw new UserFacingError(title, {
                        cause: message.message || _('Unexpected error'),
                        status: message.status || 'error',
                        messageSrc: message['message-src'],
                    });
                }

                return { status: 'OK', instanceId: message.instanceId };
            }
        });
    }

    // starts a session for the signed in user, and takes its cookies: when
    // the session is ready, the server hands over a ticket, which is then
    // exchanged for the cookies. resolves with undefined once the cookies are
    // set, or otherwise with why there's no session
    async _startSession(headers: Headers, setProgress: (progress: any) => void): Promise<IInstanceOpenResult | undefined> {

        let response = await fetch(`${ host.baseUrl }session/start`, {
            method: 'POST',
            headers: headers,
        });

        if (response.status !== 200)
            throw new UserFacingError(_('Unable to open'), { cause: response.statusText });

        const message = await readJsonLines(response.body, setProgress);

        if ( ! message)
            throw new UserFacingError(_('Unable to open'), { cause: _('Unexpected error') });

        switch (message.status) {
            case 'ready':
                break;
            case 'requires-auth':
                return { status: 'requires-auth' };
            case 'full':
                return { status: 'full', message: message.message };
            case 'reload':
            case 'redirect':
                return message;
            default:
                throw new UserFacingError(message.title || _('Unable to open'), {
                    cause: message.message || _('Unexpected error'),
                    status: 'error',
                    messageSrc: message['message-src'],
                });
        }

        const claimHeaders = new Headers(headers);
        claimHeaders.set('Content-Type', 'application/json');

        response = await fetch(`${ host.baseUrl }session/claim`, {
            method: 'POST',
            headers: claimHeaders,
            body: JSON.stringify({ ticket: message.ticket }),
        });

        if (response.status === 401)
            return { status: 'requires-auth' };

        if (response.status !== 204) {
            let cause = response.statusText;
            try {
                cause = JSON.parse(await response.text()).message || cause;
            }
            catch (e) { }
            throw new UserFacingError(_('Unable to open'), { cause });
        }

        return undefined;
    }

    async save(options: ISaveOptions) {

        options = Object.assign({}, options); // clone so we can modify without side-effects

        if ( ! options.path) {
            // no path means a 'save' (rather than a 'save as')
            options.path = this.attributes.path;
            options.format = this.attributes.saveFormat;
            options.overwrite = true;
        }

        let filename = path.basename(options.path);
        let retrying;

        do {

            retrying = false;

            const progress = new Notify({
                title: _('Saving'),
                duration: 0,
            });

            try {
                const stream = this._save(options);

                for await (const message of stream) {
                    progress.set('progress', message);
                    this.trigger('notification', progress);
                }

                const result = await stream;

                filename = result.filename;

                if ( ! options.export) {
                    // a download is written to a temp file (result.path), but
                    // the data set takes the name the user chose
                    this.set('path', result.download ? options.path : result.path);
                    this.set('title', result.title);
                    this.set('saveFormat', result.saveFormat);
                    this._dataSetModel.set('edited', false);

                    if (result.download)
                        return result;

                    this._notify({ message: _('File Saved'), cause: _(`Saved to '{filename}'`, { filename }) });
                }
                else {
                    if (result.download)
                        return result;
                    else
                        this._notify({ message: _('Exported'), cause: _(`Exported to '{filename}'`, { filename }) });
                }

            } catch (e) {

                if (e instanceof FileExistsError && ! options.overwrite) {
                    let msg = _(`The file '{filename}' already exists. Overwrite this file?`, { filename });
                    await MsgDialog.show(msg, {cancel: _('Cancel'), ok: _('OK')}).then((result) => {
                        if (result.action === 'ok') {
                            options.overwrite = true;
                            retrying = true;
                        }
                    });
                }
                else if (e instanceof UserFacingError) {
                    this._notify({ message: e.message, cause: e.cause, type: 'error' });
                    throw e;
                }
                else {
                    this._notify({ message: _('Save failed'), cause: e.message || '', type: 'error' });
                    throw e;
                }
            }
            finally {
                progress.dismiss();
            }
        }
        while (retrying);

        return { };
    }

    _save(options) {

        options = Object.assign({}, options); // clone so we can modify without side-effects

        return new ProgressStream<[number, number], any>(async (setProgress) => {

            const app = await host.nameAndVersion;

            // Generate content if necessary
            let content = null;
            let svgs = null;

            if (options.path.endsWith('.omv') && ! options.export) {
                // an Svg element is stored as the svg it renders to, and only
                // the results view can provide that
                svgs = await this.attributes.resultsSupplier.getSvgs();
            }

            if (options.content) {
                content = options.content;
                delete options.content;
            }
            else if (options.partType === 'image') {
                // images are handled specially below
            }
            else if (options.path.endsWith('.omv')) {
                content = await this.attributes.resultsSupplier.getAsHTML({images:'relative', generator:app});
                // content = await this.attributes.resultsSupplier.getAsHtml2({images:'resources', generator:app, showRefs: false});
                // to follow, once the html export has had more use: the
                // stored results as the same document, with the figures
                // referenced as the resources alongside the analyses
            }
            else if (options.path.endsWith('.html') || options.path.endsWith('.htm')) {
                // the complete document; the server writes it as-is
                content = await this.attributes.resultsSupplier.getAsHtml2({images:'inline', generator:app}, options.part);
            }
            else if (options.path.endsWith('.zip')) {
                content = await this.attributes.resultsSupplier.getAsLatex();
            }
            else if (options.path.endsWith('.docx')) {
                // the complete document; the server writes it as-is
                content = await this.attributes.resultsSupplier.getAsDocx(options.part);
            }
            else if (options.path.endsWith('.odt')) {
                // the complete document; the server writes it as-is
                content = await this.attributes.resultsSupplier.getAsOdt(options.part);
            }
            else if (options.path.endsWith('.pdf')) {
                // the html document, printed
                const html = await this.attributes.resultsSupplier.getAsHtml2({images:'inline', generator:app}, options.part);
                content = await this._requestPDF(html);
            }

            const data = new FormData();
            data.append('options', JSON.stringify(options));
            if (content)
                data.append('content', new Blob([ content ]));
            if (svgs) {
                for (const [ part, svg ] of Object.entries(svgs))
                    data.append(`svg:${ part }`, new Blob([ svg as string ]));
            }

            const response = await fetch('save', {
                method: 'POST',
                body: data,
            });

            if ( ! [200, 204].includes(response.status))
                throw new Error(response.statusText);

            const reader = response.body.getReader();
            const stream = parseJsonLines(reader);

            for await (const message of stream) {
                if (message.status === 'in-progress')
                    setProgress([ message.p, message.n ]);
            }

            const result = await stream;

            if (result.status === 'OK') {
                return result;
            }
            else if (result.code === 'file-exists') {
                throw new FileExistsError();
            }
            else {
                throw new UserFacingError(_('Save failed'), { cause: result.message || '' });
            }
        });

    }

    browse(filePath: string, extensions: string[]) {

        let coms = this.attributes.coms;

        let fs = new coms.Messages.FSRequest();
        fs.path = filePath;
        fs.extensions = extensions;

        let message = new coms.Messages.ComsMessage();
        message.payload = fs.toArrayBuffer();
        message.payloadType = 'FSRequest';
        message.instanceId = this.instanceId();

        let promise = coms.send(message);
        promise = promise.then((response) => {
            return coms.Messages.FSResponse.decode(response.payload);
        });
        return promise;
    }

    restartEngines() {

        let coms = this.attributes.coms;

        let analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.restartEngines = true;

        let request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = 'AnalysisRequest';
        request.instanceId = this._instanceId;

        return coms.sendP(request);
    }

    retrieveAvailableModules() {

        let coms = this.attributes.coms;

        let storeRequest = new coms.Messages.StoreRequest();

        let request = new coms.Messages.ComsMessage();
        request.payload = storeRequest.toArrayBuffer();
        request.payloadType = 'StoreRequest';
        request.instanceId = this._instanceId;

        return coms.send(request)
            .then(response => {
                return coms.Messages.StoreResponse.decode(response.payload);
            }, error => {
                throw error;
            });
    }

    installModule(filePath: string) {

        let coms = this.attributes.coms;

        let moduleRequest = new coms.Messages.ModuleRR();
        moduleRequest.command = coms.Messages.ModuleRR.ModuleCommand.INSTALL;
        moduleRequest.path = filePath;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRR';
        request.instanceId = this._instanceId;

        return coms.send(request);
    }

    uninstallModule(name: string) {

        let coms = this.attributes.coms;

        let moduleRequest = new coms.Messages.ModuleRR();
        moduleRequest.command = coms.Messages.ModuleRR.ModuleCommand.UNINSTALL;
        moduleRequest.name = name;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRR';
        request.instanceId = this._instanceId;

        return coms.send(request);
    }

    setModuleVisibility(name: string, value: boolean) {
        let coms = this.attributes.coms;

        let moduleRequest = new coms.Messages.ModuleRR();
        if (value === false)
            moduleRequest.command = coms.Messages.ModuleRR.ModuleCommand.HIDE;
        else
            moduleRequest.command = coms.Messages.ModuleRR.ModuleCommand.SHOW;

        moduleRequest.name = name;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRR';
        request.instanceId = this._instanceId;

        return coms.send(request);
    }

    trustArbitraryCode() {
        for (let analysis of this.analyses()) {
            if (analysis.arbitraryCode && ! analysis.enabled)
                analysis.enable();
        }
    }

    _notify(error) {
        let notification = new Notify({
            title: error.message,
            message: error.cause,
            duration: 3000,
            type: error.type ? error.type : 'info',
        });
        this.trigger('notification', notification);
    }

    _verifyConnection() {

        // electron's server is local; there's no connection to lose, and a
        // failure there closes jamovi
        if (host.isElectron || ! this._instanceId)
            return;

        let coms = this.attributes.coms;

        let instanceRequest = new coms.Messages.InstanceRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = instanceRequest.toArrayBuffer();
        request.payloadType = 'InstanceRequest';
        request.instanceId = this._instanceId;

        coms.verify(request);
    }

    _beginInstance(instanceId: string) {

        let coms = this.attributes.coms;

        let instanceRequest = new coms.Messages.InstanceRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = instanceRequest.toArrayBuffer();
        request.payloadType = 'InstanceRequest';

        if (instanceId)
            request.instanceId = instanceId;

        return coms.send(request).then(response => {
            this._instanceId = response.instanceId;
        });
    }

    async _readDataset(loadAnalyses: boolean=true) {

        let coms = this.attributes.coms;

        let info = new coms.Messages.InfoRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = info.toArrayBuffer();
        request.payloadType = 'InfoRequest';
        request.instanceId = this._instanceId;

        let response = await coms.send(request);
        info = coms.Messages.InfoResponse.decode(response.payload);

        this._dataSetModel.set('instanceId', this._instanceId);

        if (info.resultsLanguage)
            this.set('resultsLanguage', info.resultsLanguage);

        if (info.hasDataSet) {
            this._dataSetModel.setup(info);
            this.set('hasDataSet', true);
            this.set('title',      info.title);
            this.set('path',       info.path);
            this.set('saveFormat', info.saveFormat);
            this.set('blank',      info.blank);
        }

        if (loadAnalyses) {

            let allAnalysesReady = [ ];

            for (let analysisPB of info.analyses) {

                let options = OptionsPB.fromPB(analysisPB.options, coms.Messages);
                let analysis = await this._analyses.create({
                    name: analysisPB.name,
                    ns: analysisPB.ns,
                    id: analysisPB.analysisId,
                    options: options,
                    results: analysisPB.results,
                    references: analysisPB.references,
                    enabled: analysisPB.enabled,
                    arbitraryCode: analysisPB.arbitraryCode,
                    dependsOn: analysisPB.dependsOn,
                });

                allAnalysesReady.push(analysis.ready);

                // sleep to allow iframes to load, etc. so it can progressively
                // update rather than waiting until the end
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            await Promise.all(allAnalysesReady);

            for (let analysis of this._analyses) {
                if (analysis.arbitraryCode)
                    this.set('arbitraryCodePresent', true);
                else
                    analysis.enabled = true;
            }
        }

        return response;
    }

    async createAnalysis(opts: CreateAnalysisOptions) {

        let analysis: any;

        if (opts.onlyOne) {
            // onlyOne means we reuse an existing analysis (when present)
            for (let existing of this._analyses) {
                if (existing.ns === opts.ns && existing.name === opts.name) {
                    analysis = existing;
                    break;
                }
            }
        }

        if ( ! analysis) {
            analysis = await this._analyses.create({
                name: opts.name,
                ns: opts.ns,
                title: opts.title,
                index: opts.index,
                enabled: true });
            this._sendAnalysis(analysis);
        }
        this.set('selectedAnalysis', analysis);
    }

    async duplicateAnalysis(dupliceeId) {

        let duplicee = this._analyses.get(dupliceeId);
        let index = duplicee.index + 2; //insert after proceeding annotation
        let analysis = await this._analyses.create({
            name: duplicee.name,
            ns: duplicee.ns,
            index: index,
            options: duplicee.options.getValues(),
            results: duplicee.results,
            enabled: duplicee.enabled,
            arbitraryCode: duplicee.arbitraryCode,
            references: duplicee.references,
        });
        this._sendAnalysis(analysis, duplicee);

        return analysis;
    }

    _optionsExtras() {
        let ppi = Math.trunc(72 * (window.devicePixelRatio || 1));
        let theme = this._settings.getSetting('theme', Theme.DEFAULT);
        let palette = this._settings.getSetting('palette', 'jmv');
        const decSymbol = this._settings.getSetting('decSymbol', '.');

        return { '.ppi': ppi, theme, palette, decSymbol };
    }

    async _constructAnalysisRequest(analysis, options?) {

        let coms = this.attributes.coms;

        let request = new coms.Messages.AnalysisRequest();
        request.analysisId = analysis.id;
        request.name = analysis.name;
        request.ns = analysis.ns;
        request.revision = analysis.revision;
        request.enabled = analysis.enabled;
        request.index = analysis.index + 1;
        request.i18n = await analysis.getCurrentI18nCode();

        if (options === undefined) {
            if (analysis.isReady)
                options = analysis.options;
            else
                options = { };
        }

        let extras = {};
        if (analysis.ns !== 'jmv' || analysis.name !== 'empty') {
            extras = this._optionsExtras();
            extras['.lang'] = await analysis.getCurrentI18nCode();
        }

        request.setOptions(OptionsPB.toPB(options, extras, coms.Messages));
        return request;
    }

    _sendAnalysisRequest(request) {

        let coms = this.attributes.coms;

        let message = new coms.Messages.ComsMessage();
        message.payload = request.toArrayBuffer();
        message.payloadType = 'AnalysisRequest';
        message.instanceId = this._instanceId;

        return coms.sendP(message);
    }

    async _runAnalysis(analysis, changed?, noUndo: boolean = false) {
        this._dataSetModel.set('edited', true);

        analysis.revision++;
        let request = await this._constructAnalysisRequest(analysis);
        request.perform = 0; // INIT
        request.noUndo = noUndo;

        if (changed)
            request.changed = changed;

        this._sendAnalysisRequest(request);
    }

    async _sendAnalysis(analysis, duplicee?: Analysis) {
        this._dataSetModel.set('edited', true);

        let request = null;
        if (duplicee !== undefined) {
            request = await this._constructAnalysisRequest(analysis, { duplicate: duplicee.id });
            request.perform = 7; // DUPLICATE
        }
        else {
            request = await this._constructAnalysisRequest(analysis);
            request.perform = 0; // INIT
        }

        this._sendAnalysisRequest(request);
    }

    async deleteAnalysis(analysis) {
        this._dataSetModel.set('edited', true);
        let request = await this._constructAnalysisRequest(analysis);
        request.perform = 6; // DELETE
        this._sendAnalysisRequest(request);
    }

    deleteAll() {
        let coms = this.attributes.coms;
        this._dataSetModel.set('edited', true);
        let request = new coms.Messages.AnalysisRequest();
        request.analysisId = 0;
        request.perform = 6; // DELETE
        this._sendAnalysisRequest(request);
    }

    async _onReceive(payloadType, response?) {

        let coms = this.attributes.coms;
        let complete = false;

        if (response === undefined) {
            let message = payloadType;
            payloadType = message.payloadType;
            if ( ! payloadType)
                return;

            complete = (message.status === coms.Messages.Status.COMPLETE)
            response = coms.Messages[message.payloadType].decode(message.payload);
        }

        if (payloadType === 'AnalysisRequest') {
            if (response.perform === 6)  { // deleted
                if (response.analysisId === 0)
                    this._analyses.onDeleteAll();
                else
                    this._analyses.deleteAnalysis(response.analysisId);
                return;
            }
        }
        else if (payloadType === 'AnalysisResponse') {

            if (complete && response.results) {
                for (const resultsItem of response.results.group.elements) {
                    if ( ! resultsItem.array)
                        continue;

                    for (const child of resultsItem.array.elements) {
                        if ( ! child.action)
                            break;

                        const action = child.action.action;  // i.e. 'open'
                        const result = { };

                        for (let i = 0; i < child.action.result.names.length; i++) {
                            const name = child.action.result.names[i];
                            const value = child.action.result.options[i].s;
                            result[name] = value;
                        }

                        const detail = { action, result };
                        const event = new CustomEvent('resultsAction', { detail });
                        this.trigger('resultsAction', event);
                    }
                }
            }

            let id = response.analysisId;
            let analysis = this._analyses.get(id);

            if ( ! analysis) {
                if (response.analysisId === 0)
                    throw 'Analysis Id can not be 0';

                // the server only creates analyses with odd ids, or puts
                // back ones removed earlier (with an undo)
                if (response.analysisId % 2 === 0 && ! response.restored)
                    throw `Analysis with id ${ response.analysisId } does not exist.`;

                let options = OptionsPB.fromPB(response.options, coms.Messages);
                analysis = await this._analyses.create({
                    name: response.name,
                    title: response.hasTitle ? response.title : undefined,
                    ns: response.ns,
                    id: response.analysisId,
                    options: options,
                    results: response.results,
                    references: response.references,
                    enabled: response.enabled,
                    index: response.index - 1,
                    dependsOn: response.dependsOn,
                });

                if (response.name !== 'empty')
                    this.set('selectedAnalysis', analysis);
            }
            else {
                analysis.results.index = response.index;
                analysis.index = response.index - 1;

                // options restored by an undo or redo replace our own
                if (response.restored)
                    analysis.revision = Math.max(analysis.revision, response.revision);

                let options = {};
                if (response.revision === analysis.revision || response.restored)
                    options = OptionsPB.fromPB(response.options, coms.Messages);

                let optionsApplied = false;
                if (analysis.isReady === false) {
                    optionsApplied = true;
                    analysis.setup(options);
                }

                if (response.results)
                    analysis.setResults({
                        results: response.results,
                        options: !optionsApplied ? options : undefined,
                        references: response.references,
                        enabled: response.enabled,
                        arbitraryCode: response.arbitraryCode,
                    });
            }
        }
        else if (payloadType === 'DataSetRR') {
            this._dataSetModel._processDatasetRR(response);
        }
        /*else if (payloadType === 'ModuleRR') {
            let moduleName = response.name;
            this._modules.purgeCache(moduleName);

            for (let analysis of this._analyses) {
                if (analysis.ns === moduleName)
                    analysis.reload();
            }

            this.trigger('moduleUpdated', { name: moduleName });
        }*/
        else if (payloadType === 'Notification') {

            let n10n = Notify.createFromPB(response);
            this.trigger('notification', n10n);
        }
        else if (payloadType === 'ModuleRR') {
            let moduleName = response.name;
            this._modules.purgeCache(moduleName);

            for (let analysis of this._analyses) {
                if (analysis.ns === moduleName)
                    analysis.reload();
            }

            this.trigger('moduleUpdated', { name: moduleName });
        }
        else if (payloadType === 'LogRR') {
            console.log(response.content);
        }
    }

    _columnsChanged(event) {

        this._dataSetModel.set('edited', true);

        for (let analysis of this._analyses) {
            if (analysis.isReady === false)
                continue;

            let using = analysis.getUsingColumns();

            let columnDataChanged = false;
            let columnDeleted = false;
            let columnRenamed = false;
            let levelsRenamed = false;
            let columnRenames = [];
            let levelRenames = [];
            let columnDeletes = [];

            for (let changes of event.changes) {

                if (changes.deleted) {
                    if (using.includes(changes.name)) {
                        columnDeleted = true;
                        columnDeletes.push(changes.name);
                    }
                }
                else {
                    let column = this._dataSetModel.getColumnById(changes.id);
                    if (using.includes(column.name)) {
                        if (changes.transformChanged ||
                            changes.parentIdChanged ||
                            changes.activeChanged ||
                            changes.columnTypeChanged ||
                            changes.measureTypeChanged ||
                            changes.dataTypeChanged ||
                            changes.levelsChanged ||
                            changes.formulaChanged ||
                            changes.dataChanged ||
                            changes.missingValuesChanged ||
                            changes.descriptionChanged)
                        columnDataChanged = true;
                    }
                    if (changes.nameChanged && using.includes(changes.oldName)) {
                        columnRenamed = true;
                        columnRenames.push({ oldName: changes.oldName, newName: column.name });
                    }
                    if (changes.levelsChanged) {
                        levelsRenamed = changes.levelNameChanges.length > 0;
                        for (let i = 0; i < changes.levelNameChanges.length; i++)
                            levelRenames.push({ variable: column.name, oldLabel: changes.levelNameChanges[i].oldLabel, newLabel: changes.levelNameChanges[i].newLabel });
                    }
                }
            }

            if (columnRenamed)
                analysis.notifyColumnsRenamed(columnRenames);

            if (levelsRenamed)
                analysis.notifyLevelsRenamed(levelRenames);

            if (columnDataChanged || columnRenamed || columnDeleted) {
                let selectedAnalysis = this.get('selectedAnalysis');
                if (selectedAnalysis !== null && selectedAnalysis instanceof Analysis && selectedAnalysis.id === analysis.id)
                    this.trigger("change:selectedAnalysis", { changed: { selectedAnalysis: analysis } });
            }
        }
    }

    _stringifyMeasureType(measureType) {
        switch (measureType) {
            case 2:
                return 'nominal';
            case 3:
                return 'ordinal';
            case 4:
                return 'continuous';
            default:
                return '';
        }
    }

    _requestPDF(html: string) {
        return fetch('../utils/to-pdf', {
                method: 'POST',
                body: html,
            }).then((response) => {
                if (response.status === 200)
                    return response.arrayBuffer();
                else if (response.status === 500)
                    return new Promise((resolve, reject) => response.text().then((text) => reject(text)));
                else
                    throw response.statusText;
            });
    }
}

export default Instance;
