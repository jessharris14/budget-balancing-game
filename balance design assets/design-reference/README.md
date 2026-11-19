# Design reference (mockups)

These files are the approved visual mockups for Let's Balance!. They are REFERENCE ONLY: copy the look, do not ship them.

- `lb.css`: design tokens (colors, fonts) and the component styles used in the mockups.
- `Main.dc.html` home and join, `Role.dc.html` role picker, `Player.dc.html` Commissioner phone view,
  `PopupMotion.dc.html`, `PopupChallenge.dc.html`, `PopupChair.dc.html` pop-ups,
  `Facilitator.dc.html` and `PublicView.dc.html` (laptop and projector, built in a later step).
- The HTML uses a custom wrapper (`<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`). Treat those as pseudo-templating: read the markup and CSS classes for structure and styling.
- Images in the mockups point at `/_blob/<id>`. Map them to the real files using the table below.
- Mockup text is sample content. Real data comes from the app.

| blob id | file |
|---|---|
| /_blob/20bebcb301e3e494d675c4db884e4189 | public/assets/logo.png |
| /_blob/d9d6158e490b0488768b3d19dbcc7c00 | public/assets/icons/revenue.svg |
| /_blob/5daad98f8840fb689376e6fc2a1de15b | public/assets/icons/expenditures.svg |
| /_blob/db96ad8b33ee211473cc05ca4c899c3d | public/assets/icons/budget-gap.svg |
| /_blob/9bc3f7d4d43cb058eba342d5e1d1f06d | public/assets/icons/public-sentiment.svg |
| /_blob/ef938f62b32be7f564aa8b4ed7d06a26 | public/assets/icons/reserves.svg |
| /_blob/552dbad59f02d5fe4ab27bd5637f067c | public/assets/icons/revenue-cards.svg |
| /_blob/b48dbd06ac4b355ba2576e6090b98c0a | public/assets/icons/expenditure-cards.svg |
| /_blob/0c402231b8765b8e6a7b7e6502a9d7c8 | public/assets/icons/challenge.svg |
| /_blob/ad0807d46fb21d9abb29cf14683f8747 | public/assets/icons/commissioner.svg |
| /_blob/c16cfa6ad48cef3786c949dbebfe68a0 | public/assets/icons/administrator.svg |
| /_blob/2da48e900e4b09c0aec048904deba2b1 | public/assets/icons/community-member.svg |
| /_blob/ecb73c1aa77c142ec054118bc8701afb | public/assets/icons/previous.svg |
| /_blob/b0cd4ac63ccb122289657f6860f5637c | public/assets/icons/next.svg |
| /_blob/40c0cb0952bf9cee88d93e312ef1df52 | public/assets/icons/players.svg |
| /_blob/1aa262a416d8a739cf29f6f0638dbca2 | public/assets/icons/players-white.svg |
| /_blob/852b93db17b469f51c1650fd04c4249f | public/assets/icons/card-swipe.svg |
| /_blob/d93d440ec7f1f117a7dd59230fe3fb6f | public/assets/icons/info.svg |
| /_blob/1dcae830db270c02ccebbdc63bbf86d4 | public/assets/cards/R1.svg |
| /_blob/9e8c0eea6de405a182f938451c090269 | public/assets/cards/R2.svg |
| /_blob/4f766d065c589a469af78279ba81c78a | public/assets/cards/R3.svg |
| /_blob/96b756b1caa3234929345f52914d4e9b | public/assets/cards/R4.svg |
| /_blob/3356903ffcea4ed91849fc59032e79d5 | public/assets/cards/R5.svg |
| /_blob/47a7f4ae99d2fef7640fa27f90c51f2f | public/assets/cards/R6.svg |
| /_blob/3db84c186751b4597494d31a0c5eab0a | public/assets/cards/R9.svg |
| /_blob/20f2f1b869b980f42524c8ae6fef808b | public/assets/cards/E5.svg |
| /_blob/e074600b7c1cdba8848f7d3fb88b072d | public/assets/cards/E8.svg |
| /_blob/79f7e037ab93e6c63661a7db1fcdbdf6 | public/assets/cards/E12.svg |
| /_blob/d010037fd869dcdac7847ea1fe51437c | public/assets/cards/C1.svg |
| /_blob/87904b6361b5957da813f164ed56c22c | public/assets/cards/C2.svg |
| /_blob/0084c13b845bba00d8c782d8658a0dd2 | public/assets/cards/C3.svg |
| /_blob/4e83cc62717e3b6246e2a7ed319b1d79 | public/assets/cards/C4.svg |
| /_blob/73fe181b48200a8b67baffdc8d032953 | public/assets/cards/C5.svg |
| /_blob/591267d619de26b6fcdc99f3df02b171 | public/assets/cards/C6.svg |
| /_blob/002ccdc1a109f194e949521bb9185d06 | public/assets/cards/C7.svg |
| /_blob/23f63b99b1ab1cd389a955bc384885ea | public/assets/cards/C8.svg |
| /_blob/f104d05470e4a5b7005f998442bd4476 | public/assets/cards/C9.svg |
| /_blob/09096dbe3aca253ae6c4a58f2f1f1cb8 | public/assets/cards/C10.svg |
| /_blob/15492217574a3d5128a71a671f4ac629 | public/assets/cards/C11.svg |
| /_blob/277be2fcde0dd49fe704604a5e8ac8cd | public/assets/cards/P2.svg |
| /_blob/a5d63f1ee5fdf67233d27dde62a18ba2 | design-reference/lb.css |
