# Credits

*[Leer en español](translations/es/CREDITS.md)*

## Exercise library (Exercise module)

- Illustrated exercises: [`@bryllim/workout-guide`](https://github.com/bryllim/workout-guide)
  (302 exercises, MIT code).
- Illustrations: Bryl Lim, under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
  with base poses from [Everkinetic](https://github.com/everkinetic/data)
  (CC BY-SA 4.0). See the package's `ATTRIBUTION.md` at
  `frontend/node_modules/@bryllim/workout-guide/ATTRIBUTION.md`.
- Use in NoteVault: metadata and local (offline) search only, in
  `frontend/src/lib/exerciseLibrary.ts` and the view
  `frontend/src/components/exercise/Library.tsx`. No media is redistributed.

## Exercise instructions

The step-by-step instructions (`frontend/src/lib/exerciseInstructions.*.json`)
are **NoteVault's own writing**: 302 exercises, 1797 steps, written for this
project. They do not come from any third-party dataset.

Review: they are correct in general technique, but have not been reviewed by a
health professional. If you are going to train with heavy weight on a new
exercise, check the technique with someone qualified before adding load.

## Other dependencies

Production dependencies use licenses compatible with GPL-3.0 (MIT, BSD, ISC, SIL OFL 1.1, MPL-2.0/Apache-2.0 for DOMPurify, PSF-2.0). Their licenses ship with each package in `node_modules/`.
