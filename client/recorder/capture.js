
'use strict';

const capturer = window.require('electron').desktopCapturer;

function takeScreenshot(windw) {
    if (navigator.platform === 'Win32')
        return _captureWin(windw);
    else
        return _capture(windw, 'screenshot');
}

function _captureWin(windw) {

    return new Promise((resolve, reject) => {
        windw.capturePage((image) => {
            resolve(image.toPNG());
        });
    });
}

function _capture(windw, type) {

    return new Promise((resolve, reject) => {

        let handleSSStream = (stream) => {
            let video = document.createElement('video');
            video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';

            video.onloadedmetadata = function () {

                // Set video ORIGINAL height (screenshot)
                video.style.height = this.videoHeight + 'px'; // videoHeight
                video.style.width = this.videoWidth + 'px'; // videoWidth

                // Create canvas
                let canvas = document.createElement('canvas');
                canvas.width = this.videoWidth;
                canvas.height = this.videoHeight;
                let ctx = canvas.getContext('2d');
                // Draw video on canvas
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => resolve(blob));

                // Remove hidden video tag
                video.remove();
                try {
                    // Destroy connect to stream
                    stream.getTracks()[0].stop();
                } catch (e) {}
            };

            video.src = URL.createObjectURL(stream);
            document.body.appendChild(video);
        };

        // let handleVideoStream = (stream) => {
        //     let recorder = new MediaRecorder(stream);
        //     recorder.ondataavailable = (event) => {
        //         console.log(event);
        //         resolve({ blob: event.data });
        //     }
        //     recorder.start();
        //
        //     stop.then(() => {
        //         recorder.stop();
        //     }, () => {
        //         reject('cancelled');
        //         recorder.stop();
        //     });
        // };

        let origTitle = windw.getTitle();
        let key = 'Taking Screenshot ...';
        windw.setTitle(key);

        capturer.getSources({ types : [ 'window' ] }, (error, sources) => {
            windw.setTitle(origTitle);
            if (error) {
                console.log(error);
                return;
            }

            let id;
            for (let source of sources) {
                if (source.name === key) {
                    id = source.id;
                    break;
                }
            }

            if ( ! id)
                reject('Could not take screenshot');

            navigator.webkitGetUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: id,
                        minWidth: 800,
                        maxWidth: 4000,
                        minHeight: 600,
                        maxHeight: 4000,
                    },
                },
            },
            handleSSStream,
            reject);
        });

    }).then(blob => {
        return new Promise((resolve, reject) => {
            let reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsArrayBuffer(blob);
        });
    }).then(arraybuffer => {
        return new Buffer(arraybuffer);
    });
}

module.exports = { takeScreenshot };
