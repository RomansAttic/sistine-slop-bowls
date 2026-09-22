# Sistine Slop Bowls

A shared ledger of which fast-casual "slop bowl" each of us has eaten the most —
Chipotle, Noodle Lab, Cava, Naya, Life Alive, Sweetgreen, Dig Inn, Eastern Edge —
painted as a badly restored Renaissance altarpiece.

- Make a profile (pick one of the nine cursed likenesses, or upload your own photo — it gets varnished to match).
- Tap a bowl to log it. Change the date to confess an older one. Undo from the toast, or delete from the Chronicle.
- Everyone's counts compare in the fresco (heads grow with devotion; last place hangs upside down as Heretic) and in The Reckoning table.

## How it runs

Static site (`index.html`, `app.js`, images) served by GitHub Pages. Shared data lives in a
Firebase Firestore database, addressed by the public config in `firebase-config.js`;
what anyone may write is enforced by `firestore.rules` (friends-only trust model: anyone with
the link can add well-formed profiles and entries, nobody can delete a profile).

Uploaded portraits are shrunk in the browser to a 400px square JPEG and stored inside the
profile document, so no file-storage bucket is needed.

Data model: `profiles/{id}` = `{name, motto, portrait: 0-8 | null, image: dataURL | null, createdAt}`;
`entries/{id}` = `{profileId, place, ts}`.

## Deploying changes

```
git push                      # GitHub Pages redeploys the site
firebase deploy --only firestore:rules   # after editing firestore.rules
```

## Credits

Images generated with ChatGPT. Hands approximate.
