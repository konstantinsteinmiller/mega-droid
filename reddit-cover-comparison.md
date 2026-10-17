# Reddit post: cover comparison (#176)

Suggested subreddits: r/IndieDev, r/WebGames, r/gamedev (Feedback Friday thread),
r/DestroyMyGame. Attach the twelve covers as an image gallery in the order
below (A–L), or the comparison grid as one image, and link the vote page.

---

**Title:** Which of these 12 covers would make YOU click? Rate them for my robot platformer (½–5 stars)

**Body:**

Hi all! I'm making **Mega Droid**, a free 3D action platformer for the browser:
you play Flux, a tiny white robot with an arm cannon, fighting your way through
ten robot-boss sectors.

The cover is the first thing anyone sees on a game portal, usually as a
thumbnail about 250 px wide between forty other games, so I want to pick the
one that actually gets clicked, not just the one I like. I've got twelve
candidates and I'd love your honest take.

**Rate each one from ½ to 5 stars here (takes about a minute, no sign-up):**
👉 https://konstantinsteinmiller.github.io/mega-droid/cover-vote/

You'll see the overall community ranking as soon as you've rated all of them.

What I'm asking you to judge, for each cover:

1. **Appeal**: does it look good and fun?
2. **Clickability**: shrunk to a small tile in a grid of other games, would it
   make you want to click and play?

If you'd rather answer here, a comment like `A 4, B 2.5, C 5 …` works too. And
I'd especially love to hear *why* your favourite and your least favourite
stand out: is it the character, the colours, the boss, how readable it is
small?

The covers (attached in this order):

- **A**: Flux against the Frost Master: a charged shot crosses an ice hall
- **B**: the original cover, an unpainted in-game render
- **C**: Flux leaping out of the fire with the Blaze Master behind him
- **D**: Flux against the Scrapper, a giant scrap mech, in the Scrapyard
- **E**: the face: Flux close up, charge at the lens, the Neon Master behind (first version)
- **F**: the original in-game render with the game logo
- **G**: tiny Flux against Dr. Vex's huge skull war pod
- **H**: the face, second version, with a bigger Neon Master
- **I**: Flux charging up at the Volt Master in a lightning storm
- **J**: Flux braced against the Magnet Master's pull, firing back
- **K**: the Drill Master bursting from the ground behind a leaping Flux
- **L**: the Rotor Master and its drones diving out of a dusk sky

Thanks a lot. I'll post the results once enough votes are in!

---

## Notes (not part of the post)

- The vote page shuffles the covers per visitor and labels them by position,
  so its letters do NOT match the A–L above; that keeps order and names from
  swaying the vote. The letters above are only for comment answers.
- Images for the gallery: `store-art/covers/1920x1080/<id>.webp`, in this
  order: frost, render, blaze, scrapper, neon-first, render-logo, vex, neon,
  volt, magnet, drill, rotor.
- Totals live in the leaderboard Worker's D1 (`cover_votes`):
  `GET https://mega-adventure-leaderboard.rodent-race.workers.dev/covers`
  gives `{ voters, covers: { <id>: { n, stars } } }`.
