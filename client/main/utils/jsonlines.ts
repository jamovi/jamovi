
import { ProgressStream } from './progressstream';

export function parse(reader) {

    return new ProgressStream(async (setProgress) => {

        const utf8Decoder = new TextDecoder('utf-8');

        let message;
        for (;;) {
            let { done, value } = await reader.read();

            let pieces;
            if (typeof(value) === 'string')
                pieces = value.split('\n');
            else if ( ! value)
                pieces = [ ];
            else
                pieces = utf8Decoder.decode(value).split('\n');

            // if the last piece is empty (in jsonlines this will often be the case)
            // use the second last piece instead
            let lastPiece = pieces[pieces.length - 1] || pieces[pieces.length - 2];
            if (lastPiece) {
                try {
                    message = JSON.parse(lastPiece);
                }
                catch(e) {
                    message = null;
                }
            }

            if (done) {
                return message;
            }
            else if (message) {
                setProgress(message);
            }
        }
    });
}