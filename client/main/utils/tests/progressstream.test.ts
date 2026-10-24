import { describe, expect, it } from 'vitest';

import ProgressStream from '../progressstream';

async function collect<P>(stream: AsyncIterable<P>): Promise<P[]> {
    const seen: P[] = [];
    for await (const progress of stream)
        seen.push(progress);
    return seen;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ProgressStream', () => {

    it('yields each progress, then resolves with the result', async () => {
        const stream = new ProgressStream<number, string>(async (progress) => {
            for (let i = 0; i < 3; i++) {
                progress(i);
                await tick();
            }
            return 'done';
        });
        expect(await collect(stream)).toEqual([ 0, 1, 2 ]);
        expect(await stream).toBe('done');
    });

    it('conflates progress the consumer has not read yet', async () => {
        const stream = new ProgressStream<number, string>(async (progress) => {
            for (let i = 0; i < 5; i++)
                progress(i);
            return 'done';
        });
        expect(await collect(stream)).toEqual([ 4 ]);
        expect(await stream).toBe('done');
    });

    it('ends iteration when resolved, with progress unread', async () => {
        const { stream, progress, resolve } = ProgressStream.withResolvers<number, string>();
        const seen = collect(stream);
        await tick();
        progress(1);
        resolve('done');
        expect(await seen).toEqual([ ]);
        expect(await stream).toBe('done');
    });

    it('ends iteration when rejected, and rejects the result', async () => {
        const stream = new ProgressStream<number, string>(async (progress) => {
            progress(1);
            await tick();
            throw new Error('boom');
        });
        expect(await collect(stream)).toEqual([ 1 ]);
        await expect(stream).rejects.toThrow('boom');
    });

    it('rejects the result with a falsy error', async () => {
        const stream = new ProgressStream<number, string>(async () => {
            await tick();
            throw undefined;
        });
        expect(await collect(stream)).toEqual([ ]);
        await expect(stream).rejects.toBeUndefined();
    });

    it('shares progress between consumers, and ends them all', async () => {
        const { stream, progress, resolve } = ProgressStream.withResolvers<number, string>();
        const seen = Promise.all([ collect(stream), collect(stream) ]);
        await tick();
        progress(1);
        await tick();
        await tick();
        resolve('done');
        expect((await seen).flat()).toEqual([ 1 ]);
    });

    it('ignores anything after it has settled', async () => {
        const { stream, progress, resolve, reject } = ProgressStream.withResolvers<number, string>();
        resolve('done');
        progress(1);
        reject('error');
        expect(await collect(stream)).toEqual([ ]);
        expect(await stream).toBe('done');
    });

    it('supports catch and finally', async () => {
        let finished = false;
        const stream = new ProgressStream<number, string>(async () => { throw 'error'; });
        const caught = await stream.finally(() => finished = true).catch((e) => `caught ${ e }`);
        expect(caught).toBe('caught error');
        expect(finished).toBe(true);
    });
});
