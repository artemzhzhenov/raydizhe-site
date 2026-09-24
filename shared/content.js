/* Данные страницы: эпизоды и аудитория.
 *
 * Новый ролик — одна строка в episodes, сверху. Больше ничего править не надо:
 * разметку рисует shared/page.js.
 * Цифры аудитории округлены вниз и помечены датой — их обновляют руками.
 */
window.SOULS = {
  links: {
    facebook: "https://www.facebook.com/profile.php?id=61592874008419",
    instagram: "https://www.instagram.com/raydizhe",
    /* Ватпад сняли 19.09 по просьбе автора и вернули 22.09: решено, что
       ссылка нужна. Тот же адрес стоит у автора в шапке страницы на
       Facebook. */
    wattpad: "https://www.wattpad.com/story/410771562-what-our-souls-are-made-of",
    /* Письмо автору — один адрес на весь сайт: и «Write to Diana» после
       стихов на «Авторе», и кнопка внизу страницы. Адрес выбран 25.09;
       меняется здесь, страница берёт его отсюда. */
    email: "mailto:diana@raydizhe.com"
  },
  /* Сняты 24.09.2026 с открытых страниц, без входа в аккаунт (прошлый
   * замер — 22.09):
   *   followers — Facebook 12 940 + Instagram 7 330 = 20 270, округлено
   *               вниз (было 12 532 + 7 055 = 19 587);
   *   views — сумма счётчиков просмотров на 31 ролике вкладки Reels на
   *           Facebook, ≈1 937 тыс., округлено вниз (было 29 роликов и
   *           ≈1 777 тыс.). Это нижняя граница дважды: сам Facebook
   *           округляет счётчики до «16K», а просмотры в Instagram без
   *           входа не видны и сюда не вошли.
   * Цифры в разметке вариантов (текст для читателя без JS) держать равными
   * этим. */
  /* Статистика и живые цифры — только на боевом домене (liveHosts):
   * превью не засоряет статистику.
   *   analytics — Umami на своём сервере (/opt/umami на my-server), без
   *               cookies; видит только администратор.
   *   counters  — цифры аудитории, которые сервер снимает раз в две
   *               недели (/opt/souls-counters). Не пришли — на странице
   *               остаются цифры из audience ниже. */
  live: {
    hosts: ["raydizhe.com", "www.raydizhe.com"],
    analytics: {
      src: "https://pulse.raydizhe.com/pulse.js",
      websiteId: "05ea874b-b718-47b1-82bf-b2104059c666"
    },
    counters: "https://pulse.raydizhe.com/counters.json"
  },
  audience: {
    readers: "20,000+",
    views: "1,900,000+",
    asOf: "September 2026"
  },
  episodes: [
    { date: "2026-09-13", line: "One name had already shaken her. Then she saw the one person she could never prepare to lose.", url: "https://www.facebook.com/reel/1558687226003763/" },
    { date: "2026-09-12", line: "The call they had been waiting for finally came. Tessa woke up.", url: "https://www.facebook.com/reel/1828136738545150/" },
    { date: "2026-09-11", line: "Tessa never hid the fact that her feelings for Sam were still real. And when she saw how much he was hurting, she didn’t want to promise him a relationship she wasn’t ready to choose yet.", url: "https://www.facebook.com/reel/2118275972099530/" },
    { date: "2026-09-10", line: "Sometimes you try to do the right thing, but fate seems to have its own plans for you. You run from it, but it catches up with you again.", url: "https://www.facebook.com/reel/4556406657943039/" },
    { date: "2026-09-10", line: "There is no denying it: they are drawn to each other like magnets. It’s more than just attraction.", url: "https://www.facebook.com/reel/1823227252440340/" },
    { date: "2026-09-09", line: "Sam never needed permission to start a war.", url: "https://www.facebook.com/reel/1095366942991180/" },
    { date: "2026-09-09", line: "Sam’s problem isn’t that he feels one thing too deeply. It’s that he’s capable of feeling all of it at once.", url: "https://www.facebook.com/reel/1419034327006818/" },
    { date: "2026-09-08", line: "Sometimes I look at Sam and think how strange it is—to create a person, give him a heart, and know exactly where it will hurt him most.", url: "https://www.facebook.com/reel/1245480391056728/" },
    { date: "2026-09-08", line: "It had been two years since Tessa had last been this close to Sam. They’d both changed, but the pull between them hadn’t gone away—familiar, intense, almost impossible to ignore.", url: "https://www.facebook.com/reel/2331882247362362/" },
    { date: "2026-09-07", line: "He was destroying himself because he had lost not only the person he loved, but a close friend too. Zak was the only one who understood him and stood by him!", url: "https://www.facebook.com/reel/1581554236761325/" }
  ]
};
