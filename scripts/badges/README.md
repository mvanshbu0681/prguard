# Badges

Images PR Guard puts in GitHub comments. `npm run badges` renders them with the local Chrome into
`assets/badges/img/` and writes their sizes to `apps/api/src/review/badges.json`.

To change one: edit `catalog.ts`, run `npm run badges`, publish `assets/badges/img/` to
`prguard-sandbox/prguard-assets` under a new tag, and move `ASSET_BASE_URL` to that tag.
