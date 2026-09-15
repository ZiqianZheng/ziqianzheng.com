# Archive — not deployed

Nothing in this folder is built or published. Astro only routes files under
`src/pages/`, and these sit one level over in `src/archive/`, so they are kept in
version control but produce no URLs.

They were moved here rather than deleted when the site first went live, because
the live site is currently just the tessellation arrival screen and none of this
was ready to be public under Ziqian's own domain.

## What's here

| File | Why it isn't live |
|---|---|
| `about.astro`, `blog/`, `rss.xml.js` | Astro blog-template boilerplate — placeholder copy, not Ziqian's |
| `sample-content/` | The template's five example posts (`first-post.md` etc.) |
| `garden.astro` | Manifold Garden scroll-through homepage — superseded, see `design/manifold-garden.md` |
| `descent.astro`, `[section].astro` | Menger-sponge fractal navigation — superseded, see `design/descent.md` |
| `garden-test.astro`, `descent-test.astro` | Dev scratch pages for posing those scenes for screenshots |

## Bringing something back

Move the file into `src/pages/` and rebuild. Relative imports (`../layouts/…`,
`../scene/…`) already resolve correctly from either location, because both
folders sit at the same depth under `src/`.

The supporting code these depend on is still in the normal tree and still
type-checks — `src/scene/`, `src/layouts/`, `src/components/`, `src/data/`. Only
the routes are parked.

Note that `src/content.config.ts` still declares a `blog` collection. It is empty
while `sample-content/` lives here; put real posts in `src/content/blog/` and
restore `blog/` and `rss.xml.js` to `src/pages/` to turn the blog back on.
