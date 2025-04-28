
'use strict';

import ProgressStream from '../utils/progressstream';

export function events() {
    let stream = new ProgressStream();
    stream.resolve(undefined);
    return stream;
}

export function promptSignIn(opts) {

}

export function currentUser() {
    return null;
}

export async function getAuthToken(forceRefresh) {
    return null;
}

export async function signOut() {

}

export async function waitForSignIn() {

}

export function init() {

}

export interface IEmbedOptions {
    channelId: number;
}

export async function embed(options: IEmbedOptions): Promise<{ [x: string]: any }> {
    return { };
}

export default { init, currentUser, events, getAuthToken, signOut, promptSignIn, waitForSignIn, embed };
