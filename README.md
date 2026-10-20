# MVV Oefenapp

Een kleine oefenapp (PWA) voor het Basisexamen Inburgering Buitenland. Eén dagelijkse sessie van 10–15 minuten met drie soorten kaarten: KNS-tracker, Spreken en Woorden. Herhaling via Leitner (5 dozen). Uitleg in het Engels, inhoud in het Nederlands. Lezen zit er bewust niet in; daarvoor verwijst de app naar het officiële DUO-oefenexamen.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | De pagina |
| `style.css` | Opmaak (licht en donker) |
| `app.js` | Alle logica: schermen, Leitner, voorlezen, opnemen, back-up |
| `content.json` | Alle kaarten. Hier pas je de inhoud aan |
| `sw.js` | Service worker voor offline gebruik |
| `manifest.webmanifest`, `icons/` | Installeren op het beginscherm |

## Lokaal draaien

```bash
cd mvv-app
python3 -m http.server 8000
```

Open http://localhost:8000. Opnemen werkt alleen via `localhost` of `https`.

Testen met een andere datum: `http://localhost:8000/?today=2026-11-05`.

## Online zetten (GitHub Pages)

1. Maak een publieke repo, bijvoorbeeld `mvv-oefenapp`, en zet deze bestanden in de hoofdmap.
2. Repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, map `/ (root)`.
3. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/mvv-oefenapp/`.

Alternatief zonder publieke repo: sleep de map naar https://app.netlify.com/drop.

**Na elke wijziging:** verhoog `VERSION` in `sw.js` (bijv. `v1` → `v2`), anders blijft de telefoon de oude bestanden gebruiken. Aanpassingen in `content.json` komen ook zonder versieverhoging door zodra de telefoon online is.

## Op de telefoon zetten

- **iPhone:** open de link in Safari → Deel → *Zet op beginscherm*. Belangrijk: Safari kan de voortgang van een gewone website na 7 dagen zonder bezoek wissen; een app op het beginscherm heeft daar geen last van.
- **Android:** open in Chrome → ⋮ → *App installeren*.
- Check in Instellingen → Sound of er een Nederlandse stem is (*Test voice*). Zo niet: iPhone → Instellingen → Toegankelijkheid → Gesproken materiaal → Stemmen → Nederlands; Android → Tekst-naar-spraak → Nederlands installeren.

## Inhoud aanpassen

Alle kaarten staan in `content.json`. Ik heb ze als concept geschreven; loop ze als Nederlandstalige even na.

- `words`: `nl`, `en`, `ex` (voorbeeldzin), `exEn`
- `speakQuestions`: `nl` (vraag), `en`, `model` (modelantwoord), `modelEn`, `tip`
- `completions`: `nl` (begin van de zin met `...`), `en`, `model` (het aanvullende stuk), `full` (hele zin), `modelEn`
- `knsThemes`: `title`, `prompt`, `body`, `words`
- KNS-tracker: de app maakt zelf kaarten voor fotoboekvragen 1–100. Er staan bewust geen officiële vragen of foto's in.

Houd de `id` van een kaart gelijk als je de tekst aanpast, anders raakt de voortgang van die kaart kwijt. Nieuwe kaarten krijgen een nieuwe id.

### Eigen opnames in plaats van de voorleesstem

Klinkt de telefoonstem niet goed, zet dan MP3's in een map `audio/` en voeg velden toe aan de kaart:

```json
{"id": "q001", "nl": "Hoe heet u?", "audio": "audio/q001.mp3", "model": "Ik heet Emma.", "modelAudio": "audio/q001-model.mp3", ...}
```

Velden: `audio` (voorkant), `modelAudio` (modelantwoord), `exAudio` (voorbeeldzin bij woorden). Zonder die velden gebruikt de app de voorleesstem. Voeg de MP3's eventueel toe aan `SHELL` in `sw.js` zodat ze offline werken.

## Hoe het leren werkt

- **Leitner, 5 dozen.** Nieuwe kaart = doos 1. *Knew it* → volgende doos; terug na 1, 2, 4 en 7 dagen. *Not yet* → terug naar doos 1 en de kaart komt in dezelfde sessie terug (na 3 andere kaarten) tot hij één keer goed is.
- **Nieuwe kaarten:** standaard 15 per dag (instelbaar). KNS en Spreken krijgen voorrang op Woorden. Maximaal 60 herhalingen per sessie; de rest schuift door.
- **Vanaf 3 dagen voor het examen:** geen nieuwe kaarten meer, alleen herhalen.
- **Streak:** dagen achter elkaar met een afgeronde sessie. Eén gemiste dag per week wordt vergeven (hersteldag).
- **Opnames** blijven alleen in het geheugen en worden nergens opgeslagen.
- **Voortgang** staat in `localStorage` op de telefoon. Maak af en toe een back-up via Settings → *Save backup*.
