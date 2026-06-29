# Proton Prefix Browser

A [Millennium](https://steambrew.app/) plugin for Linux. It adds a "Browse
Proton Prefix" entry to a game's menu, right under the usual "Browse local
files", and opens that game's Proton prefix
(`steamapps/compatdata/<appid>/pfx`) in your file manager.

It only shows up for games that actually have a prefix, so your native Linux
titles are left alone.

## Why I made this

"Browse local files" takes you to where a game is installed. But on Linux, a lot
of what you actually want to poke at lives in the Proton prefix instead: configs,
saves, the fake `C:` drive, the registry, all of it. Normally you have to go dig
through `steamapps/compatdata/<appid>/pfx` by hand to get there. This just puts a
shortcut where you'd already look for it.

## What it does

- Adds a "Browse Proton Prefix" item right below "Browse local files" in a
  game's right-click menu and its gear (Manage) menu.
- Opens the folder through Steam itself, using the same call "Browse local files"
  uses. So it respects whatever file manager you've set and doesn't care how
  Steam was started (native, Flatpak, extra library drives, and so on).
- Stays hidden for games that don't have a prefix.
- Also drops a small "PP" button next to the gear on a game's page, if you'd
  rather grab it without opening a menu.

## Installing

Once it's accepted into the [Millennium plugin browser](https://steambrew.app/plugins),
you can install it from there, switch it on in Millennium's settings, and restart
Steam.

To run it from source instead:

```bash
git clone https://github.com/EvilNick2/proton-prefix-browser
cd proton-prefix-browser
bun install
bun run build

ln -s "$PWD" ~/.local/share/millennium/plugins/proton-prefix-browser
```

Then enable it in Millennium's settings and restart Steam. If you're running
Steam with `-dev`, you can reload frontend changes with F5; backend changes need
a full restart.

## How it works

There's a Lua backend and a TypeScript frontend.

The backend (`backend/main.lua`) reads `libraryfolders.vdf` to find all your
Steam libraries, looks for the one holding `compatdata/<appid>`, and hands back
the `pfx` path. That's the whole job, exposed as one function, `has_prefix`.

The frontend (`frontend/index.tsx`) is where the fiddly part lives. Steam doesn't
fire any event when the game menu opens, so it watches `#popup_target` with a
`MutationObserver`, finds the "Browse local files" row by its text, and slots a
copy of that row in right after it. The appid gets worked out from the page path,
the card you right-clicked, or the card's name, and prefix lookups are cached and
warmed up ahead of time so the new item shows up instantly instead of popping in
a moment later.

Injecting into the DOM like this isn't elegant, but the game menu isn't exposed
through any public React API, so there's no cleaner way in. The approach borrows
from the [steam-librarian](https://github.com/luthor112/steam-librarian) menu
patterns.

## Things to know

- Right now it only matches the English "Browse local files". The label it looks
  for lives in `BROWSE_LOCAL_LABELS` at the top of `frontend/index.tsx`, so adding
  other languages is just a matter of dropping them in there.
- Like anything that patches Steam's UI, a future client update could shuffle
  things around and need a small fix.

## License

[MIT](./LICENSE)
