/* Форма «сообщить о выходе» — логика без DOM, чтобы её можно было
 * проверить node --test. Поведение на странице — notify.js.
 *
 * Тексты — черновик до утверждения автором (см. спеку, раздел 1). */

export const STORAGE_KEY = 'souls.notified';

export const MESSAGES = {
  format: "That email doesn't look right.",
  mx: "We couldn't find that mail server — check for typos.",
  busy: 'Something went wrong — please try again in a minute.',
};

/* Мягкая проверка перед отправкой: ловит опечатки вроде пропущенной точки,
 * но не спорит с сервером — он проверяет строже (и почтовый сервер
 * домена). Грубая проверка тут = меньше пустых запросов. */
export function looksLikeEmail(s) {
  if (typeof s !== 'string') return false;
  const v = s.trim();
  if (v.length < 6 || v.length > 254) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  if (/\s/.test(v) || !domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  return true;
}

export function errorText(code) {
  return MESSAGES[code] || MESSAGES.busy;
}

/* Какой набор обоев показать первым: телефон, если экран узкий или
 * сенсорный (планшет вертикально — тоже «телефон»: обои 9:19.5 на нём
 * смотрятся лучше, чем 16:9). Переключатель есть в любом случае. */
export function giftKind(width, coarse) {
  return coarse || width < 900 ? 'phone' : 'desktop';
}

export function giftFile(kind, slug, preview = false) {
  return 'gift/raydizhe-wallpaper-' + kind + '-' + slug + (preview ? '-preview' : '') + '.jpg';
}

/* Набор обоев для вида: в конфиге списки по виду ({phone: [...], desktop: [...]}).
 * Нет конфига или вида — пустой список, страница не падает. */
export function giftList(gift, kind) { const g = gift && gift[kind]; return Array.isArray(g) ? g : []; }
