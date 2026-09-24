/* Вариант D · The Room — стихи автора на остановке «Автор».
 *
 * Книга-черновик заменена листками: автор писал к роману стихи и выкладывал
 * их (POETRY, 10 июля). Здесь ровно тот текст, слово в слово с её страниц,
 * включая пометки от руки на полях и подпись. Claude не дописал ни строки —
 * на этих листках нет ни одного чужого слова.
 *
 * Разбивка по листкам повторяет её же: на первом заголовок и первое
 * четверостишие, дальше по четверостишию, на последнем посвящение и подпись.
 *
 * «Some stories are meant to find us» у автора попало в кадр дважды — на
 * двух снимках одного разворота. Здесь эта пометка стоит один раз, на
 * втором листке: повторять её на четырёх страницах подряд значило бы
 * сделать из авторской заметки узор.
 *
 * Механика — sheets.js, место и размер — SHEETS в beats.js.
 */
export const POEM = {
  /* На снимке автора заголовок был «What Their Souls Were Made Of» — она
   * сказала, что это опечатка и название должно совпадать с названием
   * романа (правка 22.09). */
  heading: ['What Our Souls', 'Are Made Of'],
  sheets: [
    {
      id: 'spun',
      heading: true,
      lines: [
        'From morning light and silence they were spun,',
        'Two unseen souls awakened with the dawn.',
        "Tessa's was born beneath the rising sun,",
        'Where tenderness could hear fear whisper on.'
      ]
    },
    {
      id: 'stars',
      noteTop: ['Some stories', 'are meant to', 'find us'],
      lines: [
        'From gentle stars and clouds that drifted slow,',
        'From timid words that scarcely found a voice,',
        'From all the dreams that never learned to grow,',
        'Her soul was clear, yet frightened to rejoice.'
      ],
      noteFoot: ['Gentleness', 'is not weakness —', 'it is remembering', 'who you are']
    },
    {
      id: 'agree',
      lines: [
        'Yet something made their separate hearts agree',
        'And turned what once was two into a whole:',
        "They both were born from one spring's melody,",
        'Where love became the language of the soul.'
      ],
      noteFoot: ["Some hearts", "don't just meet —", "they remember", "they've always", 'been one']
    },
    {
      id: 'stream',
      lines: [
        'They intertwined until no line remained,',
        'Like rivers joined, forever unrestrained.',
        'From light and wind, from whispers in the night,',
        'Their souls became one boundless stream of light.'
      ],
      dedication: 'Ethan & Tessa',
      sign: 'Diana Ray'
    }
  ]
};
