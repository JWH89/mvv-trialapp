# Grammatica

De zus-app van de MVV Oefenapp: Nederlandse grammatica, uitgelegd in het Engels, met oefeningen die zichzelf nakijken. Zelfde techniek als de MVV-app: gewone HTML/CSS/JavaScript zonder build-stap, inhoud in JSON, voortgang in `localStorage`, Leitner-herhaling, voorleesstem, offline via een service worker, gehost op GitHub Pages.

Online (na het mergen): `https://jwh89.github.io/mvv-trialapp/grammatica/`

## Wat zit erin

- **59 lessen** van A1 tot B1 in 11 groepen: spelling, zelfstandige naamwoorden en lidwoorden, voornaamwoorden, werkwoorden (tegenwoordige tijd, verleden tijd, meer vormen), bijvoeglijke naamwoorden, zinsbouw, ontkenning, kleine woorden, getallen en tijd. Elke les: uitleg, tabellen, voorbeeldzinnen (voorgelezen), veelgemaakte fouten.
- **236 oefeningen** bij de lessen: kiezen, invullen, woorden in de goede volgorde zetten, zin herschrijven, vertalen.
- **48 zinnen voor *Make sentences*:** vertaal een Engelse zin; de app accepteert alle gangbare goede versies en laat per woord zien wat er anders is.
- **Leervolgorde:** *Next lesson* volgt een vaste route (`path` in `data/index.json`), A1 eerst.
- **Herhaling:** dezelfde 5 Leitner-dozen als de MVV-app (terug na 1, 2, 4, 7 dagen). Fout = terug naar doos 1 en later in dezelfde ronde nog een keer.

### Nakijken: vaste antwoorden, geen AI

Alle oefeningen en *Make sentences* hebben **vooraf geschreven antwoorden** in de JSON-bestanden. De app vergelijkt je antwoord daarmee, ook offline. Er gaat niets naar een AI.

- Hoofdletters, spaties en de punt aan het eind tellen niet mee.
- Bij hele zinnen tellen *je/jij, we/wij, ze/zij, me/mij* als hetzelfde.
- Was je antwoord toch goed maar staat het er niet bij? Tik op *My answer was also right*. Voeg het daarna toe aan de lijst `a` van die oefening.

### Free writing (optioneel)

Alleen *Free writing* gebruikt Claude: een zelfbedachte zin kun je niet met een vaste lijst nakijken. Het staat uit tot je in Settings een eigen Claude API-sleutel invult (via https://platform.claude.com, zet daar een maandlimiet). De sleutel blijft op de telefoon en zit niet in de back-up. Een controle kost ongeveer 1–2 cent met Sonnet. Fouten uit je eigen zinnen kun je met *Practise this sentence later* in je herhaling zetten.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html`, `style.css`, `app.js` | De app (stijl gekopieerd van de MVV-app) |
| `data/index.json` | Lijst van lesbestanden, de leervolgorde (`path`) en extra links |
| `data/01-spelling.json` … `data/11-everyday.json` | De lessen en oefeningen, één bestand per groep |
| `data/sentences.json` | De zinnen voor *Make sentences* |
| `tools/check_content.mjs` | Controleert alle inhoud (zie hieronder) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline en installeren op het beginscherm |

## Lokaal draaien

Vanuit de hoofdmap van de repo:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000/grammatica/. Testen met een andere datum: `?today=2026-11-05`.

## Inhoud aanpassen

Een les in `data/NN-*.json`:

```json
{"id": "modals", "title": "Modal verbs", "nl": "Modale werkwoorden", "level": "A1",
 "summary": "…", "body": [ … ], "mistakes": [ … ], "exercises": [ … ], "write": [ … ]}
```

- `body`: blokken `{"p": tekst}`, `{"h": kopje}`, `{"list": [..]}`, `{"table": {"head": [..], "rows": [[..]]}}`, `{"ex": [["nl", "en"], …]}`, `{"tip": tekst}`. In tekst: `**vet**` en `==markering==`.
- `mistakes`: `{"wrong", "right", "why"}`.
- `write`: schrijfopdrachten voor *Free writing*.

Oefeningen (`t` = soort):

```json
{"id": "mo-2", "t": "choice", "q": "Je ___ hier niet roken.", "en": "…", "opts": ["mag", "kan", "wil"], "a": "mag", "why": "…"}
{"id": "pr-1", "t": "type", "q": "Hij ___ in Amsterdam. (wonen)", "a": ["woont"], "why": "…"}
{"id": "mo-1", "t": "order", "en": "I want to learn Dutch.", "a": ["Ik wil Nederlands leren."], "why": "…"}
{"id": "se-4", "t": "rewrite", "q": "Ik ruim mijn kamer op.", "task": "Start with: Ik moet …", "a": ["Ik moet mijn kamer opruimen."], "why": "…"}
{"id": "mo-4", "t": "translate", "q": "I have to work tomorrow.", "a": ["Ik moet morgen werken.", "Morgen moet ik werken."], "why": "…"}
```

- `___` is het open plekje. Twee plekjes: zet de antwoorddelen met ` … ` ertussen (`"komt … aan"`).
- `order`: de woordblokjes komen uit het eerste antwoord. Begin dat antwoord niet met een naam (het eerste woord krijgt een kleine letter).
- Zet bij `order`, `rewrite` en `translate` **alle** goede versies in `a`.
- Houd de `id` gelijk als je de tekst aanpast, anders raakt de voortgang kwijt.

**Na elke wijziging:**

```bash
node grammatica/tools/check_content.mjs
```

Het script stopt met een lijst fouten als er iets niet klopt (dubbele id's, een antwoord dat niet bij de keuzes staat, woordblokjes die de zin niet vormen, een les die niet in de leervolgorde staat, enz.). Lesbestanden komen zonder versieverhoging door; verhoog `VERSION` in `grammatica/sw.js` als je `app.js`, `style.css` of `index.html` aanpast.

## Bronnen

De uitleg, voorbeelden en oefeningen zijn voor deze app geschreven. Extra (gratis) oefenen: de Lagelands-oefeningen van UCL, de e-ANS (volledige grammatica, Nederlandstalig) en de Woordenlijst voor de/het en meervouden. Links staan op het startscherm.
