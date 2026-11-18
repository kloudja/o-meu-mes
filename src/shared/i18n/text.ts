import { locale } from './pt-PT';
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);
export const matchesText = (text: string, query: string) => normalize(text).includes(normalize(query.trim()));
export const compareNames = new Intl.Collator(locale, { sensitivity: 'base', numeric: true }).compare;
