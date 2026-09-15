# ziqianzheng.com

Personal site of Ziqian Zheng. Built with [Astro](https://astro.build), deployed to
GitHub Pages on every push to `main`.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # production build to dist/
npm run preview  # serve the production build
```

Requires Node 22.12 or newer.

## What's here

The live site is currently a single page: a full-screen run of an iterative
tessellation with infinite zoom.

```
src/pages/index.astro   the whole live site
public/tess/            the tessellation renderer (third-party, see below)
src/archive/            earlier designs, kept but not built — see its README
design/                 design notes and research for each direction tried
scripts/                maintenance scripts (not part of the build)
```

## Third-party code

`public/tess/` vendors [**tessellation-webgl**](https://github.com/piellardj/tessellation-webgl)
by **Jérémie Piellard**, used under the MIT licence (© 2021). The full licence ships
alongside it at `public/tess/LICENSE`.

Those bundles are generated, not hand-written — every modification is an asserted
patch in `scripts/vendor-tessellation.mjs`:

```sh
node scripts/vendor-tessellation.mjs   # re-download upstream, re-apply patches
node scripts/measure-palette.mjs       # report how green the palette is
```

See `design/tessellation.md` for what was changed and why.
