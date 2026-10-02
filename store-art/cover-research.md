# Cover / thumbnail CTR research — web portals and Steam

Compiled 2026-10-02 for "Mega Droid" (bright cartoon 3D robot action game; hero "Flux": small white chibi robot, black visor, amber eyes, arm cannon; colourful robot bosses; all ages, hybrid-casual).

**How to read this file**

- Evidence grades used throughout:
  - **[A] measured** — an A/B test or platform-run experiment with a stated result.
  - **[B] platform rule** — official developer documentation of the platform itself.
  - **[C] case data** — a practitioner's real, named numbers (not a controlled test).
  - **[D] practitioner opinion** — trend observation or advice without numbers.
  - **[E] weak** — vendor/SEO claim without methodology; listed only so it is not mistaken for evidence.
- Quotes were retrieved through a fetch tool that converts pages to text and extracts passages. They are faithful to what the tool returned, but re-check wording against the live page before publishing any of them externally.
- Nothing here was measured on Mega Droid itself. Every number belongs to the cited source's own context.

---

## Findings

### Portal guidance (primary sources)

1. **Poki: the thumbnail is the CTR lever, and text-free wins in Poki's own tests.** "Avoid text. Skip titles and other text and let the visuals carry it. Text quickly becomes unreadable on smaller tiles, and Poki's own tests show players prefer text-free thumbnails: visuals alone drive better performance." — https://developers.poki.com/guide/game-thumbnail — **[A/B]** (platform states a test result, but publishes no numbers or sample size).

2. **Poki: one foreground object, not a collage.** "One clear foreground object, a main character or a key gameplay element, not a collage of everything." and "Less is more: clarity beats complexity at catching the eye." — https://developers.poki.com/guide/game-thumbnail — **[B]**.

3. **Poki: dynamic pose beats static pose.** "A stiff, static pose is easy to scroll past." / "Suggest movement instead: a platformer character mid-jump or running, a shooter character with weapon raised." — same page — **[B]**.

4. **Poki: design for the small tile, mind contrast and the page colour.** "Design for small tiles too. Heavy detail turns to mush at small sizes"; "Contrast makes a thumbnail pop; similar shades fall flat."; "The Poki playground background is `#83FFE7`, so avoid colors too close to it or your thumbnail disappears into the page." — same page — **[B]**.

5. **Poki: hero in default skin, simple background.** "Include your main character in their default skin so players recognize the game and feel they've landed in the right place." / "Keep the background simple and clean so focus stays where it matters." — same page — **[B]**.

6. **Poki: an over-promising thumbnail costs retention.** The results guide lists the pattern "Players arrive and convert, but leave quickly" with the cause "Thumbnail overpromises, or early difficulty wall", and "Good playtime, low CTR in web fit" with the cause "Thumbnail". — https://developers.poki.com/guide/reading-results — **[B]**.

7. **Poki A/B thumbnail tests judge on total playtime, not CTR alone.** The older Poki page (now redirecting to the thumbnail guide; content seen only through a search-engine extract, not fetched directly) described: two thumbnails shown at random, each round at least three days, up to three options submitted with two tested at a time, and "Total Playtime = C2P x Average Playtime" as the most important metric. — https://sdk.poki.com/ab-thumbnail-tests (redirects) — **[B]**, second-hand retrieval.

8. **CrazyGames: three covers, title allowed and encouraged, nothing else.** Landscape 1920x1080, portrait 800x1200, square 800x800. Forbidden: borders, text beyond the game's title (the page names "New", "Updated", "Play Now"), store logos or icons, blurry imagery. "Adding the name of your game to the cover is a great way to make it more memorable!" — https://docs.crazygames.com/requirements/game-covers/ — **[B]**.

9. **CrazyGames: no screenshots, lead with the main character, keep it simple, keep the three formats recognisably the same.** "Users can preview the gameplay by hovering over your game cover anyway."; "Use the main character of your game as the primary visual element"; "Over-cluttered covers are hard to scan, especially on small screens."; "The three covers should feature consistent visuals and aesthetics". — same page — **[B]**.

10. **CrazyGames: a hover video replaces the cover, and its first frame should be the cover.** Preview video max 20 s, 50 MB, 1080p landscape and portrait, opening frame = the static cover; no logo transitions, cursors, promo text or audio. — same page — **[B]**. Implication: the static cover and the first video frame must be the same composition.

11. **GamePix: assets must represent the game, and any title on them must match.** "The game's assets (icon and cover) must be representative of the game. These assets are the first contact with users and should be of good quality." / "The title on the assets must match the game's title". No pixel sizes are published in the guidelines. — https://partners.gamepix.com/guidelines/submission — **[B]**.

12. **YouTube Playables (reached through Playgama distribution): no branding or logos in thumbnails.** "Developer MUST NOT include any branding or logos in the thumbnails, description, or title." — https://developers.google.com/youtube/gaming/playables/certification/requirements_design — **[B]**. Whether a game's own title logo counts as "branding" is not spelled out; the safe reading is a text-free thumbnail for this channel.

13. **Meta Instant Games: no text in icons, restrained text on covers, a centred safe zone.** "Do not include text in the icon. Text (including the game name) is nearly illegible at small sizes and clutters the icon."; "Use a single, recognizable focal element"; "Icons with high color contrast stand out in lists and grids"; covers: keep important elements "within a roughly 1000 x 500 pixel 'safe zone' centered in the image" (of 1200x630); no call-to-action text. — https://developers.facebook.com/documentation/games/launch/reviews/asset-design-guidelines — **[B]** (adjacent platform, same tile-in-a-grid problem).

14. **Roblox: the bottom edge of a thumbnail is an overlay zone.** "Avoid placing any essential text or elements at the bottom of the thumbnail, as it may potentially be covered by metadata like the player count." — https://create.roblox.com/docs/production/publishing/thumbnails — **[B]** (adjacent platform; the only official statement found that names a specific covered region).

15. **Roblox: picking the right thumbnail per viewer moves play-through measurably.** "During testing, games using thumbnail personalization had an average increase of +8.5% in their qualified play through rate. Some games had an increase of +50%." — same page — **[A]** (platform-run test; shows the size of effect a thumbnail change can have: single-digit percent typical, large outliers possible).

16. **Epic / Fortnite Discover: front-most character, movement, background chosen for separation.** "Keep the most relevant characters at the front of the scene"; "Draw your viewer's eye with movement"; "Choose a lighter background so your character stands out more". Epic's native A/B test splits 50/50 and decides on CTR. — https://dev.epicgames.com/documentation/en-us/fortnite/making-thumbnails-and-videos-in-fortnite-creative and https://dev.epicgames.com/documentation/fortnite/ab-thumbnail-testing-in-fortnite-creative — **[B]**. Note the "lighter background" advice assumes darker characters; for a white hero the same principle (separation) means a darker or saturated background.

### Steam (primary sources and practitioners)

17. **Valve: capsules carry artwork, the name and an official subtitle — nothing else — and the logo is mandatory.** "Content on base graphical asset capsules on Steam is limited to game artwork, the game name, and any official subtitle." Forbidden: review scores, award names or logos, discount copy, calls to action, other products, "No other miscellaneous text." "Capsule images must contain a readable product logo/name". — https://partner.steamgames.com/doc/store/assets/rules — **[B]**.

18. **Valve: at small size the logo is the capsule.** "Small Capsule should contain readable logo, even at smallest size. In most cases, this means your logo should nearly fill the small capsule." Small capsule 462x174, auto-scaled to 184x69 and 120x45. — https://partner.steamgames.com/doc/store/assets/standard — **[B]**. This is the opposite of Poki's rule.

19. **Valve: store-page traffic is not a ranking input.** "The traffic landing on your store page is not a factor in your Steam store visibility." — https://partner.steamgames.com/doc/marketing/visibility — **[B]**. This contradicts the widespread blog claim that capsule CTR "drives the algorithm". CTR still matters directly (more visits per impression), just not as a hidden ranking signal according to Valve.

20. **Zukowski: CTR alone is a poor target on Steam.** From a survey of "over 100 games": "stop worrying about Clickthrough rate"; "the less traffic a game has, the better click-through-rate is"; impressions and page views are what track wishlists. — https://howtomarketagame.com/2022/09/14/what-is-a-normal-click-through-rate-or-wishlist-rate-on-steam/ — **[C]**.

21. **Zukowski: a capsule redesign changed how much a streamer's video was watched.** Clanfolk: the first SplatterCat video with the old capsule got about 74,000 views (about half his monthly average); after a professionally painted capsule the next video got 176k. The article calls this a "230% increase"; 74k to 176k is about 2.4x. The article also relays "the best thumbnails include an object and a person… viewers engage with thumbnails that have people in them." — https://howtomarketagame.com/2022/07/18/how-do-you-get-streamers-to-cover-your-game-get-a-better-capsule/ — **[C]** (one game, two videos at different stages of development; confounded, but real numbers).

22. **Zukowski: the capsule must say the genre instantly.** "You wanna make your Steam page look like your type of game so that at an instant somebody shopping goes, 'Ah, it's that type of game—I'm gonna buy it.'" and "The only thing I really recommend spending money on is hiring a capsule artist." — https://unity.com/blog/tips-strategies-for-marketing-indie-games — **[D]**.

23. **Zukowski: observed layout and colour conventions among top sellers.** Two dominant layouts — "Left-Text-Right-Character" ("a single, well rendered character, very clear text, and very simple background") and "Center-Text-Center-Character"; "Red and blue continue to be the hot trend in capsule images"; shooters use "Full-bodied shots of the protagonist but with a strong diagonal element to them." — https://howtomarketagame.com/2020/10/28/trends-for-steam-capsule-design/ and https://howtomarketagame.com/2020/07/27/five-trends-in-steam-capsule-art/ — **[D]** (trend-spotting from top-seller lists, no performance data; 2020).

### General thumbnail evidence that transfers

24. **Netflix: artwork dominates browsing attention.** Artwork "constituted over 82% of their focus while browsing Netflix"; members "spent an average of 1.8 seconds considering each title". — https://about.netflix.com/en/news/the-power-of-a-picture — **[A]** (platform research; method not detailed in the post).

25. **Netflix: expressive faces win, crowds lose, villains work.** "faces with complex emotions outperform stoic or benign expressions"; "an image's tendency to win dramatically dropped when it contained more than 3 people"; members "respond to villainous characters surprisingly well in both kids and action genres in particular." — same page — **[A]** (large-scale platform A/B testing; film/TV artwork, not games; human faces, not robots).

26. **YouTube (official): custom, simple, readable.** "90% of the best-performing videos have custom thumbnails"; "Try not to make the design too complex. Dynamic use of color and composition can help catch the eye, but too much can overwhelm it."; for casual viewers lean on "actions and emotions that are more universally relatable". — https://support.google.com/youtube/answer/12340300 — **[B]** (correlational statistic plus platform advice).

27. **YouTube's own A/B tool does not optimise for CTR.** "we optimize tests for overall watch time over other metrics, like click-through-rate." — https://support.google.com/youtube/answer/13861714 — **[B]**. Same lesson as Poki's finding 6–7: the winning image is the one that brings players who stay.

28. **Google Play: a background-colour change alone moved conversion.** SGN's Cookie Jam "saw an 8 percent increase in conversions simply by changing the background color of their app icon"; character changes in two other icons also raised installs. — https://android-developers.googleblog.com/2015/12/android-developer-story-sgn-game-cookie.html — **[A]** (store-listing experiment published by Google; 2015; install conversion, not tile CTR).

29. **App icon test: bigger subject, more vivid contrast won.** SplitMetrics/Ciliz: conversion rose from 20.46% to 24.42% (+19.4%) with an icon whose subjects "occupy the most part of the icon", enlarged elements and "more vivid, contrasting colors" (the variant also carried a "New" sticker, which portals forbid). — https://splitmetrics.com/cases/ciliz-improves-conversion-with-splitmetrics-agency/ — **[A]** (vendor-published single test; a dating-style app, several things changed at once).

30. **Weak claims seen and not used as evidence.** "Face in thumbnail +35–50% CTR", "<4 words +30% CTR", "red/yellow highlights up to +20%" (1of10: "real metrics we've seen internally", no sample or method — https://1of10.com/blog/the-psychology-behind-high-ctr-thumbnails/); "character capsules beat environment capsules by ~35% CTR" (gamosy.com: its case studies are stated to be anonymised and approximate — https://gamosy.com/blog/steam-capsule-design); Steam tiers "below 2% poor … 7%+ excellent" (steampageanalyzer.com: "aggregated data", no sample — https://www.steampageanalyzer.com/blog/steam-ctr-benchmarks); "boost their CTR from 8% to 24% in just one week" (forgivengames.com: unnamed team, no method). Per-game CTR figures for famous titles that appear on content-farm pages were not traceable to any developer statement. — **[E]**. They agree in direction with findings 1–5 and 25 but their numbers should not enter a rubric.

### CTR levels — is "20%+" realistic?

31. **Poki's own worked example uses 1.5% as a category average.** "if action and adventure games average 1.5% CTR, 4 minutes on page, and 70% C2P, matching those numbers scores you a 3 on each." Scores run 0–5 against the category average. — https://developers.poki.com/guide/web-fit-test — **[B]**. It is phrased as an example ("if"), not a published benchmark, but it is the only order-of-magnitude figure a portal states for action games.

32. **itch.io browse CTR reported by creators is roughly 0.3%–3.5%.** Community threads report popular games at about 0.6–1%, others between 0.3% and about 3.5%, falling as impressions rise. — https://itch.io/t/278399/whats-your-ctr-whats-a-good-ctr (page returned 403 to the fetch tool; figures come from the search-engine extract of this and neighbouring threads) — **[C]**, anecdotal.

33. **YouTube: half of everything sits between 2% and 10%.** "Half of all channels and videos on YouTube have an impressions CTR that can range between 2% and 10%."; "If a video gets a lot of impressions (such as if it appears on the Home Page), it's natural for the CTR to be lower." — https://support.google.com/youtube/answer/7628154 — **[B]**.

34. **Steam: real named data points run from 0.33% to 9.6%.** Sale-page feature: nearly 2 million impressions, 27,482 visits, 1.4%; an Early Access page in the same event: 1.3M impressions, 4.3k visits, 0.33%; a broadcast slot: 0.5% (https://newsletter.gamediscover.co/p/the-anatomy-of-a-steam-sale, https://newsletter.gamediscover.co/p/running-a-steam-sales-promotion-real). Low-traffic pre-release pages: 9.6% and 6.7% for two small games (https://howtomarketagame.com/2020/11/23/why-your-steam-page-matters/). — **[C]**.

35. **Conclusion on 20%.** No source found reports a blended tile or capsule CTR near 20%. Every platform that states a typical level puts it at low single digits for broad surfaces, and both YouTube and Zukowski note that CTR falls as impressions rise. A 20% figure is plausible only on narrow, high-intent surfaces (a search for the game's name, a short "more like this" rail, a developer's own page) and should not be a target for a home-grid tile. Use relative targets instead: beat the category average (Poki scores exactly this way) and win a head-to-head test.

**What the top performers have in common, across sources:** a single dominant subject that reads at postage-stamp size (2, 9, 13, 18); a character rather than a screenshot (5, 9, 21); expression or motion rather than a neutral stance (3, 16, 25); strong separation from the background and from the page (4, 13, 28, 29); few elements (2, 9, 25, 26); an honest promise of what the game is (6, 11, 22, 27).

---

## Rubric

Score each cover **at about 250 px wide, inside a mock grid of real competitor tiles**, never at full size. 0–10 per criterion, multiplied by the weight, divided by 10; total out of 100. The "portal" weights are for CrazyGames, Poki, GamePix, Playgama, GameMonetize, Y8 and itch.io grids; the "Steam" weights replace them for capsules.

| # | Criterion | Portal weight | Steam weight | 0 | 5 | 10 | Derived from |
|---|---|---|---|---|---|---|---|
| 1 | **Single focal subject, instant read** | 18 | 15 | No dominant subject; a collage or a wide scene | Hero is identifiable but competes with one or two other elements | One subject owns the tile; identifiable in under a second with the image blurred or squinted at | 2, 9, 13, 24, 25 |
| 2 | **Face and eyes readable, with expression** | 12 | 8 | Face absent, turned away, or smaller than a few pixels | Visor and eyes visible but neutral or small | Visor and amber eyes are the brightest, sharpest point of the image and carry a clear emotion (determined, excited, alarmed) | 21, 25, 26 |
| 3 | **Action and implied conflict** | 10 | 8 | Stiff standing pose, nothing happening | Some motion (tilt, raised cannon) but no opponent or stakes | Mid-action pose on a diagonal, cannon firing or charging, a threat visibly answered | 3, 16, 23, 25 |
| 4 | **Figure–ground contrast** | 12 | 12 | Hero merges with the background in value (white on pale) | Separated by hue only, or only in parts of the silhouette | Whole silhouette separates cleanly in greyscale; a rim or glow is not needed to find it | 4, 13, 16, 29 |
| 5 | **Colour pop against the grid** | 8 | 7 | Muted, or the same dominant hue as the portal page or the neighbouring tiles | Saturated but generic; blends with similar tiles | A distinct dominant hue plus one accent; stands out in the mock grid; clear of the portal's page colour | 4, 13, 28 |
| 6 | **Genre and promise, truthfully** | 12 | 15 | Could be any game; or promises something the game does not deliver | Robot theme is clear, shooting or boss-fighting is not | "Cartoon robot blaster fights big robot bosses" is obvious, and it is what the first minute of play delivers | 6, 11, 22, 27 |
| 7 | **Simplicity** | 8 | 7 | More than three characters, busy background, many effects | Hero plus boss plus a noticeable amount of scenery or debris | At most hero, one boss and one effect; background is a simple shape or gradient | 2, 9, 25, 26 |
| 8 | **Text and logo handled as the platform wants** | 8 | 16 | Portal: extra words, badges, or a title crossing the face. Steam: no logo, or unreadable at 184x69 | Portal: title present but small or crowding the subject. Steam: logo readable at header size only | Portal: text-free, or (where allowed) the exact game title only, away from face and corners. Steam: logo readable at 120x45 and not fighting the hero | 1, 8, 11, 12, 13, 17, 18 |
| 9 | **Safe zones and crop robustness** | 6 | 5 | Face, cannon or title touches an edge or a corner; breaks when cropped to another aspect | Survives one aspect; tight elsewhere | Key content inside the central ~80%; all four corners and the bottom strip expendable; recomposed (not cropped) for each aspect | 10, 13, 14 |
| 10 | **Craft and consistency** | 6 | 7 | Blurry, off-model, mismatched between formats | Clean but generic; formats differ in pose or palette | Sharp at every size; hero in default look; the same pose, palette and lighting in every format and in the hover video's first frame | 5, 9, 10, 22 |
| | **Total** | **100** | **100** | | | | |

**Where portals and Steam differ**

- **Text.** Poki: none (stated test result). Playgama's YouTube channel: no branding or logos. CrazyGames and GamePix: the exact title is allowed (CrazyGames encourages it). Steam: a readable logo is mandatory and should nearly fill the small capsule. One artwork cannot satisfy all of these; plan a text-free master and a titled derivative.
- **What the image is judged on.** Poki's A/B test and YouTube's both pick on time played or watched, not raw clicks. A cover that scores high on criteria 1–5 but low on 6 can win clicks and still lose the test.
- **Steam weights genre and logo more, expression and action less**, because a capsule competes among games a buyer is evaluating to purchase, and Valve's rules make the logo part of the image.
- **Hover behaviour.** CrazyGames and Poki swap the tile for a video on hover; the cover should be the video's first frame. Steam shows screenshots or a micro-trailer on hover, independent of the capsule.
- **Tie-breakers.** If two covers land within three points, prefer the one with the higher criterion-6 score (finding 6), then run a live test rather than trusting the rubric.

---

## Platform specs

| Platform | Cover sizes asked for | Text / logo rule | Overlay zones and safe areas | Source and status |
|---|---|---|---|---|
| **CrazyGames** | 1920x1080 (16:9), 800x1200 (2:3), 800x800 (1:1); hover video up to 20 s, 1080p landscape and portrait, first frame = cover | Game title allowed and encouraged; no other text ("New", "Updated", "Play Now"), no borders, no store logos, no screenshots | **Not documented.** The site has New / Hot / Updated / Originals sections, but the docs say nothing about where a label sits on a tile | https://docs.crazygames.com/requirements/game-covers/ — verified |
| **Poki** | Square, at least 628x628, full-bleed, no padding or borders; animated thumbnail 1:1, 1080x1080 or larger, 4–6 s, mp4, muted | Avoid all text and titles | Corners are rounded by Poki; avoid colours near page background `#83FFE7`; no badge zones documented | https://developers.poki.com/guide/game-thumbnail , https://developers.poki.com/guide/your-game-page — verified |
| **GamePix** | Not published in the public guidelines | Any title on the assets must match the game's title; assets must represent the game | Not documented | https://partners.gamepix.com/guidelines/submission — rule verified, sizes unknown |
| **Playgama** | 800x800 (square), 1080x1920 (portrait), 1920x1080 (landscape); PNG or JPEG; exact dimensions; up to 10 MB each | Nothing stated in the Playgama wiki. Downstream YouTube Playables: no branding or logos in thumbnails | Not documented | https://wiki.playgama.com/playgama/mcp.md , https://developers.google.com/youtube/gaming/playables/certification/requirements_design — verified |
| **GameMonetize** | "default image (512x384)" at upload; other sizes not confirmed | Nothing stated | Not documented | https://gamemonetize.com/blog/game-zip-upload-to-gamemonetize-com-and-test-ads — one size verified |
| **Y8** | Not found | Not found | Not found | https://developer.y8.com (upload form sits behind login) — unknown |
| **itch.io** | 630x500 recommended (5:4 family), minimum 315x250 | No rule found; creator's choice | Not documented | Community posts; the official docs page (https://itch.io/docs/creators/design) returned 403 — secondary |
| **Steam** | Header 920x430; small 462x174 (scaled to 184x69 and 120x45); main 1232x706; vertical 748x896 | Readable logo/name **required**; only artwork, name and official subtitle; no scores, awards, discount or call-to-action text | Sale and discount badges are added by Steam outside or alongside the capsule; no in-image overlay zone documented | https://partner.steamgames.com/doc/store/assets/standard , https://partner.steamgames.com/doc/store/assets/rules — verified |
| *Adjacent: Meta Instant Games* | Icon square; covers 1200x630 and 1080x1080 | No text in the icon; no call-to-action text; text must not dominate | Keep key content inside a centred ~1000x500 zone of the landscape cover | https://developers.facebook.com/documentation/games/launch/reviews/asset-design-guidelines — verified |
| *Adjacent: Google GameSnacks* | Icon 512x512 minimum; banners 1920x1080 and 1080x1920 | Nothing stated | Nothing stated | https://developers.google.com/gamesnacks/developer/config/marketing — verified |
| *Adjacent: Yandex Games* | Icon 512x512 PNG; cover 800x470 PNG (from a search extract of the draft-form doc) | No game UI on icons or covers; no platform badges or ratings painted in | Nothing stated | https://yandex.com/dev/games/doc/en/requirements/8/3/4 — rule verified, sizes second-hand |
| *Adjacent: Roblox* | Icon 512x512; thumbnail 1920x1080 | No rule against text | **Bottom edge may be covered by metadata such as the player count** | https://create.roblox.com/docs/production/publishing/thumbnails — verified |

Note on the existing promotion pipeline: its own notes state that a cover "carries no text, no UI and no logo" because portals typeset the name themselves. That agrees with Poki, Meta and YouTube Playables, and is stricter than CrazyGames and GamePix, which permit the title. It conflicts with Steam, which requires the logo.

---

## Scenario implications (Mega Droid: Flux + a boss)

1. **Do make Flux the one subject and his visor the one focal point.** A black visor with amber eyes on a white head is a ready-made high-contrast target; let it be the sharpest, brightest spot in the image. As a working heuristic (not from a source), Flux's head should span at least a quarter of the tile's height at 250 px so the eyes survive downscaling — check it at 120 px as well.

2. **Do show exactly one boss, and make it the threat, not a co-star.** Netflix's data says images lose sharply above three figures and that villains work in kids and action genres. One boss, larger than Flux, pushed behind him, lower in contrast or partly cropped by the frame, reads as "small hero versus big enemy". Don't line up the boss roster.

3. **Do put Flux mid-action on a diagonal with the cannon in use.** Poki's wording — "a shooter character with weapon raised" — and Zukowski's shooter convention both point to a leaning, firing or charging pose. Don't use a front-on idle stance or a T-pose turnaround.

4. **Do give Flux an expression.** Eye shape, brow line of the visor, head tilt and body lean can carry determined, excited or alarmed. A neutral robot face is the "stoic or benign" case Netflix found weaker. (The Netflix data is about human faces; treat the transfer to a robot as a reasoned assumption.)

5. **Don't put a white robot on a pale background.** Use a saturated or dark mid-tone behind him (deep blue, violet, purple, or a warm orange with a cool rim light on the hero) so the full silhouette separates in greyscale. On Poki, stay clear of mint/cyan near `#83FFE7`. Epic's "lighter background" advice is written for darker characters and inverts here.

6. **Do tie one accent colour to the gameplay.** An amber muzzle flash or charge glow echoes the eyes and names the mechanic; a single complementary background hue does the rest. A background-colour change alone was worth 8% in Google's published icon test, so test at least two background hues with the same pose.

7. **Don't use a screenshot, HUD, speech bubbles, "New"/"Play now" stickers, borders or store badges.** These are rule violations on CrazyGames, Yandex and Meta, and Steam bans all miscellaneous text.

8. **Logo — where it should sit.**
   - *Poki, Playgama's YouTube channel, any icon-sized square:* no logo at all.
   - *CrazyGames, GamePix, GameMonetize, itch.io (title permitted):* build the text-free master first, then a titled variant with the exact game title only, as a compact block in the lower third or upper third, centred or opposite Flux's gaze, on the simplest part of the background, inside a margin of about 10% of the shorter side.
   - *Steam:* mandatory. Header, main and vertical capsules: Left-Text-Right-Character or Center-Text layouts with Flux large on one side. Small capsule: the logo nearly fills it, with only Flux's head or visor beside it.

9. **Logo — where it should not sit.** Never across the visor, eyes or cannon muzzle; never in any of the four corners (badge positions are undocumented on every portal checked, and corners are rounded on Poki); never hard against the bottom edge (the only documented overlay zone on any comparable platform — Roblox — is the bottom strip, and portals that show a title on hover commonly place it there); never so large that it becomes the focal subject on a portal tile.

10. **Do recompose per aspect, and keep them recognisably one image.** Square, 16:9 and 2:3 each need their own framing (the boss leaves the frame in a naive crop), but the same pose, palette and lighting — CrazyGames asks for this explicitly — and the same frame should open the hover video.

11. **Do keep the promise honest.** If the first minute is played in first person, a third-person hero cover is still the right call (portals ask for the main character, not a screenshot), but the cannon, the bright cartoon look and a boss of the kind actually fought should match what the player sees quickly. Poki names an over-promising thumbnail as a cause of early drop-off, and both Poki's and YouTube's tests reward time played over clicks.

12. **Do plan the four scenarios as a test set, not four guesses.** Vary one thing at a time across them (background hue; boss present versus absent; close-up face versus full-body action; eyes to camera versus eyes on the boss) so a Poki A/B round (two at a time, up to three submitted) or a CrazyGames cover swap tells you which variable mattered.

---

## Unknowns

- **Badge and label positions on portal tiles.** No portal documents where "New", "Hot", "Top rated", "Updated" or video-preview icons sit on a tile, or whether a title bar is drawn over the image on hover. The CrazyGames cover docs do not mention overlays at all. The recommendation to keep corners and the bottom strip expendable is a precaution inferred from Roblox's documented bottom overlay and Meta's centred safe zone, not a verified portal rule. A direct look at each live grid (desktop and mobile) is needed to settle it.
- **Poki's A/B test page.** The dedicated page now redirects to the thumbnail guide; its details (two at a time, three-day rounds, total-playtime metric) were read only from a search-engine extract. The archive copy could not be fetched.
- **Poki's test numbers.** Poki states that text-free thumbnails performed better in its own tests but publishes no effect size, sample or date. No Poki talk or blog post with thumbnail test numbers was found.
- **Real portal CTR levels.** No published average tile CTR for CrazyGames, GamePix, Playgama, GameMonetize or Y8 was found. Poki's 1.5% is an illustrative example in its docs. The itch.io figures are forum anecdotes read through a search extract (the thread itself returned 403).
- **GamePix, GameMonetize and Y8 asset specs.** GamePix publishes rules but not sizes; GameMonetize's 512x384 comes from one blog post and other required sizes were not confirmed; Y8's requirements sit behind its developer login. Each submission form should be read directly.
- **itch.io official cover guidance.** The docs page returned 403; 630x500 / 315x250 comes from community posts.
- **YouTube Playables "branding or logos".** The rule is verified; whether the game's own title treatment counts is not stated.
- **Steam capsule A/B evidence.** Steam has no native capsule A/B test and no controlled, published before/after capsule CTR test with a named game was found. The Clanfolk case measures YouTube views across two different points in development. Several blog posts quote precise CTR lifts for famous games or unnamed teams without any traceable source; they were excluded.
- **Faces: humans versus robots.** All face and emotion evidence (Netflix, YouTube) concerns human faces. No study was found on stylised or robot characters.
- **Academic work on thumbnails.** Two papers were located (IEEE TCSS 2023, doi 10.1109/TCSS.2023.3289410, 16,278 thumbnails from 137 brand channels; a Decision Support Systems 2022 study of 3,745 brand videos) reporting that thumbnail visual attributes help predict views. Their per-attribute results (colourfulness, brightness, complexity) could not be read — only abstracts were accessible — so no direction of effect is claimed here.
- **Epic's Discover thumbnail guideline page** (https://dev.epicgames.com/documentation/en-us/fortnite/thumbnail-image-guidelines-for-discover) returned only its header; its rules are not reflected above beyond the sibling page that did load.
- **Age.** Several transferable sources are old (Netflix 2016, Google Play 2015, Zukowski's capsule trends 2020). Grid layouts and tile sizes have changed since.
