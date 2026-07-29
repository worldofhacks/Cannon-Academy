# Screen boards — the seven designed screens

`Cannon Academy Design Boards.dc.html` contains SEVEN full phone screens, each marked with a
`data-screen-label` attribute. Enumerate them with:

```js
[...document.querySelectorAll('[data-screen-label]')].map((e) => e.getAttribute('data-screen-label'));
// → Splash, Duel intro, Gun deck, Sea chart, Gunnery range, Name and flag, Guided first duel
```

**This was missed until 2026-07-29.** The splash was transcribed from board 4a and the grade picker
from 1a, but nobody enumerated `data-screen-label`, so the sea chart and gunnery range were
IMPROVISED and the remaining four were stubbed. Every screen ticket must start here.

Extract one screen's resolved geometry with:

```js
[...document.querySelectorAll('[data-screen-label]')].find(
  (e) => e.getAttribute('data-screen-label') === 'Sea chart',
).outerHTML;
```

The renderer resolves inline styles to computed values, so what comes back is measured, not
authored — `rgb(223, 241, 251)` and `top: 26px`, not a token name.
