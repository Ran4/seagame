# Sea Game — Game Design Document

## Koncept

- **Genre:** Realtids-sim, top-down 2D
- **Tema:** Tidslöst pirat-tema (inga epokregler — 1700-talskläder men nån har telefon? inga problem)
- **Perspektiv:** Rakt ovanifrån, pixel art (SNES Harvest Moon-upplösning)
- **Plattform:** Webb (TypeScript, Canvas, Vite)
- **Spelarroll:** Osynlig gud — klicka för att ge order, besättningen sköter sig själva
- **Inspiration:** Dwarf Fortress till sjöss

## Kärngameplay

Spelaren observerar och styr sitt skepp. Besättningen rör sig autonomt mellan däck och rum, sköter sina egna behov och utför sysslor. Spelaren kan ge order genom att klicka. Fokus ligger på "life on a boat" — att titta på och styra livet ombord. 80% av speltiden spenderas på skeppet.

## Skeppet

- **Ovandäck:** Roder, master/segel, kanoner, reling
- **Underdäck:** Kök, sovutrymmen, lager, fängelsehåla
- Spelaren scrollar/togglar mellan däck (tangent 2/3 eller klick)
- Skeppet är 12 tiles brett, rakt ovanifrån med fören uppåt
- Framtid: upp till 4 däck (mastnivå, ovandäck, underdäck x2)
- Framtid: uppgradera/bygga om skeppet, lägga till rum

## Besättning

- Har namn och enkel visuell identitet (färgad cirkel tills pixel art finns)
- Autonoma behov: hunger, energi (0-255)
  - Hungrig → går till kök → äter → hunger återställd
  - Trött → går till säng → sover → energi återställd
  - Annars: vandrar runt, gör sysslor (swabba däck, stå vid reling, etc.)
- Rör sig med A*-pathfinding på tile-griden, inkl. mellan däck via trappor
- Smooth pixel-rörelse mellan tiles
- Spelaren behöver inte micromanagea — gubbarna klarar sig
- Rekryteras i hamnar, hittas på öde öar, kommer till en av sig själva
- Framtid: personligheter, skills, roller, moral, myteri, skador, död

## Spelarinteraktion

- Klicka på besättningsmedlem → visa info (namn, status, behov)
- Klicka på en tile → ge order till vald besättningsmedlem att gå dit
- Piltangenter/WASD för kamerascroll
- Tangent 2/3 eller klick i panelen för att byta däck

## Världen (framtid)

- Handgjord karta med öar och hamnar
- Segla mellan platser via kartvy (välj mål, chilla på skeppet under resan)
- Random events under segling
- Hamnar: handla, rekrytera, dricka bärs, ta uppdrag
- Uppdrag åt kungadömen (brittiska, franska, etc.)
- Ekonomi: guld, handel, plundring
- Mat, vatten, ammo, virke etc. hanteras av besättningen — spelaren styr inte micro

## Strid (framtid)

- Kanonskott skepp-mot-skepp
- Äntring med svärdstrider
- Occasional pang-pang med vapen
- Papegoja som pickar ögon på motståndare
- Planeras som en "combat update" — håll det enkelt initiellt

## Visuell stil

- Pixel art, SNES Harvest Moon-upplösning och känsla
- 32x32 tiles, canvas 960x540
- Rakt ovanifrån (top-down)
- Vatten-animation runt skeppet
- Dag/natt-cykel (1 sekund = 1 minut → en dag = 24 IRL-minuter)
- Sprites genereras med gpt-image-1.5

## Tidsflöde

- 1 realtidssekund = 1 spelminut
- En hel dag/natt-cykel = 24 IRL-minuter

## Övergripande mål

- Initiellt: fri sandbox — observera och styra livet ombord
- Framtid: uppdrag, handelsrutter, ryktesspridning, storylines (TBD)
