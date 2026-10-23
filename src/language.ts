export type MessageCatalogues = Record<string, Record<string, string>>;

/** Extension-owned translations; exact locale, base language, then fallback. */
export function createTranslator(catalogues: MessageCatalogues, initialLocale = 'en', fallback = 'en') {
    let locale = initialLocale;
    return {
        setLocale(value: string) { locale = value; },
        get locale() { return locale; },
        t(key: string, params: Record<string, string | number> = {}): string {
            const normalized = locale.replaceAll('_', '-');
            const find = (name: string) => Object.keys(catalogues).find(candidate => candidate.toLowerCase() === name.toLowerCase());
            const exact = find(normalized), base = find(normalized.split('-')[0]), defaultLocale = find(fallback);
            const own = (name: string | undefined) => name && Object.hasOwn(catalogues[name], key) ? catalogues[name][key] : undefined;
            const message = own(exact) ?? own(base) ?? own(defaultLocale) ?? key;
            return message.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => Object.hasOwn(params, name) ? String(params[name]) : placeholder);
        },
    };
}
