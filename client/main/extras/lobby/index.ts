
export class Lobby {
    async show(location, query): Promise<{ action: 'open', data: { [ name: string ]: any} }> {
        throw new Error('Not implemented');
    }
}

export const hasLobby = false;

const _lobby = new Lobby();

export default _lobby;