/* Содержание: стихи автора для шёлка на остановке «Автор».
 *
 * Единственный источник — d-room/poem.js, слово в слово. Здесь стихи только
 * разбиваются на фрагменты сцены: по строфе на фрагмент, заголовок на
 * первом, посвящение и подпись на последнем. Ни одного чужого слова. */
import { POEM } from '../poem.js';

export const TITLE = POEM.heading.join(' ');

/* Путь к подписи — от этого модуля, а не от страницы: модуль один, а
 * страниц, которые его подключают, может быть несколько. */
const SIGNATURE = new URL('../../shared/img/signature.png', import.meta.url).href;

export const FRAGMENTS = POEM.sheets.map(function (sheet) {
  return {
    id: sheet.id,
    heading: sheet.heading ? POEM.heading : null,
    lines: sheet.lines,
    dedication: sheet.dedication || null,
    signature: sheet.sign ? SIGNATURE : null
  };
});
