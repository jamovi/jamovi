
interface SubArgs {

}

declare function _(key: string, formats?: { [key: string]: (string|number) } | (string|number)[] | string, options?: { prefix: string, postfix: string }): string;
declare function n_(key: string, plural: string, count: number, formats?: { [key: string]: (string|number), n?: (string|number) }): string;
