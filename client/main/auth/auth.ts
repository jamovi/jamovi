
'use strict';

import ProgressStream from '../utils/progressstream';

function events() {
    let stream = new ProgressStream();
    stream.resolve();
    return stream;
}

function promptSignIn(opts) {

}

function currentUser() {
    return null;
}

async function getAuthToken(forceRefresh) {
    return null;
}

async function signOut() {

}

async function waitForSignIn() {

}

function init() {

}

export default { init, currentUser, events, getAuthToken, signOut, promptSignIn, waitForSignIn };
