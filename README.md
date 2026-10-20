# MVV Oefenapp

> **For educational purposes only.** This is an unofficial, non-commercial practice app for the Basisexamen Inburgering Buitenland (civic integration exam abroad). It is not affiliated with or endorsed by DUO, the Ministerie van Sociale Zaken en Werkgelegenheid (SZW), the IND or Naar Nederland. The KNS photos and questions in `assets/` are taken from the official photobook *Naar Nederland – Fotoboek* (herziene editie 2014, © Ministerie van SZW, all rights reserved); all rights stay with the owners. Always check the official material below, as it may have changed. Rights holders who want this material removed can open an issue and it will be taken down.
>
> **Alleen voor educatieve doeleinden.** Onofficiële, niet-commerciële oefenapp. Niet verbonden aan of goedgekeurd door DUO, het Ministerie van SZW, de IND of Naar Nederland. De KNS-foto's en -vragen komen uit het officiële *Fotoboek* (© 2014 Ministerie van SZW, alle rechten voorbehouden). Raadpleeg altijd het officiële materiaal hieronder.

## Officiële bronnen / Official sources

| Bron | Link |
|---|---|
| Fotoboek KNS (PDF), bron van `assets/` | https://www.naarnederland.nl/site/binaries/site-content/collections/documents/2026/zelfstudiepakket/fotoboek-photobook/nn-fotoboek-2014-herzien-omslag-lowres.pdf |
| Zelfstudiepakket Naar Nederland (Engels): film, fotoboek, werkboek, audio | https://www.naarnederland.nl/zelfstudiepakket/engels/zelfstudiepakket-engels/zelfstudiepakket-engels |
| Oefenexamens (KNS, Lezen, Spreken) | https://english.naarnederland.nl/taking-practice-exams · https://www.naarnederland.nl/oefenexamens-maken |
| Alle spreekvragen A1 (PDF) | https://www.naarnederland.nl/site/binaries/site-content/collections/documents/2026/examens/spreken-a1-maart-2024/totaalbestand-items-spreken-a1-maart-2024.pdf |
| Beoordelingsmodel Spreekvaardigheid A1 (PDF) | https://www.naarnederland.nl/site/binaries/site-content/collections/documents/2026/examens/beoordelingsmodel-spreekvaardigheid/beoordelingsmodel-spreekvaardigheid-a1.pdf |
| IND: over het basisexamen | https://ind.nl/nl/basisexamen-inburgering-in-het-buitenland |

De woorden, spreekvragen, modelantwoorden en KNS-thema's in `content.json` zijn zelf geschreven oefenmateriaal, geen officiële examenstof.

## Over de app

Een kleine oefenapp (PWA) voor het Basisexamen Inburgering Buitenland. Eén dagelijkse sessie van 10–15 minuten met drie soorten kaarten: KNS-tracker, Spreken en Woorden. Herhaling via Leitner (5 dozen). Uitleg in het Engels, inhoud in het Nederlands. Lezen zit er bewust niet in; daarvoor verwijst de app naar het officiële DUO-oefenexamen.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | De pagina |
| `style.css` | Opmaak (licht en donker) |
| `app.js` | Alle logica: schermen, Leitner, voorlezen, opnemen, back-up |
| `content.json` | Alle kaarten. Hier pas je de inhoud aan |
| `assets/data/questions.json` | De 100 KNS-vragen (+ 2 voorbeeldvragen) uit het fotoboek, met antwoord en foto |
| `assets/images/` | De foto's uit het fotoboek: `q001.jpg` … `q100.jpg`, `vb01.jpg`, `vb02.jpg` |
| `tools/extract_photobook.py` | Script dat de twee hierboven maakt uit de fotoboek-PDF |
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

1. Maak een repo, bijvoorbeeld `mvv-oefenapp`, en zet deze bestanden in de hoofdmap.
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
- KNS: de kaarten k001–k100 komen uit `assets/data/questions.json`. Elke kaart toont de foto, de vraag (ook voorgelezen) en de keuzes A en B; na het kiezen zie je het goede antwoord. De app heeft de PDF niet meer nodig. Pas deze vragen niet met de hand aan, maar maak ze opnieuw met het script hieronder.

### KNS-vragen en foto's opnieuw maken uit het fotoboek

Nodig: Python 3 en de PDF `nn-fotoboek-2014-herzien-omslag-lowres.pdf` (van naarnederland.nl).

```bash
cd mvv-app
pip install pypdf pdfplumber
python tools/extract_photobook.py ../nn-fotoboek-2014-herzien-omslag-lowres.pdf
```

Het script:

- haalt de foto van elke vraagpagina eruit, byte voor byte (originele JPEG, geen kwaliteitsverlies), en noemt hem naar het nummer dat op de pagina staat;
- leest de tabel "100 examenvragen" achter in het boek: vraag, keuze A, keuze B en het goede antwoord;
- schrijft `assets/images/*.jpg` en `assets/data/questions.json` (oude foto's worden eerst verwijderd);
- stopt met een foutmelding als er een vraag, foto of antwoordletter ontbreekt of niet klopt;
- laat aan het eind zien welke woorden het over een regelafbreking aan elkaar heeft gezet (bijv. `gebombar|deerd`). Kijk die na een nieuwe versie van het boek even na; afbrekingen waarbij het streepje moet blijven staan in `KEEP_HYPHEN` in het script.

Een record in `questions.json`:

```json
{"id": "q007", "number": 7, "example": false, "question": "Kijk naar de foto. Wat is dit?",
 "options": {"A": "een dijk", "B": "een haven"}, "correct": "A", "answer": "een dijk",
 "image": "assets/images/q007.jpg", "page": 13}
```

`page` is de pagina in de PDF waar de foto staat, handig om iets na te kijken. Verhoog na het opnieuw maken `VERSION` in `sw.js`. De service worker leest de lijst met foto's zelf uit `questions.json`, dus `SHELL` hoef je niet aan te passen.

De foto's en vragen blijven © Ministerie van SZW; zie de disclaimer bovenaan. De PDF zelf staat niet in deze repo. Download hem via de link onder *Officiële bronnen*.

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
