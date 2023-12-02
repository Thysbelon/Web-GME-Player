# Web-GME-Player
Play a single chiptune file track in the browser and loop infinitely. Uses the game_music_emu library.

The purpose of this program is to allow web developers to easily embed chiptune into their websites, blogs, and blog posts. For an example of how it can be used, please see [this blog post of mine](https://thysbelon.github.io/2023/10/04/Drawcia-Sorceress-ZX-Spectrum-Beeper-Cover); the "play" button calls the gmeplay() function with a relative url to a chiptune music file as input (absolute url of the file: https://thysbelon.github.io/2023/10/04/DrawciaSorceress.ay).

To add Web-GME-Player to your webpage, download `Web-GME-Player.js`, `Web-GME-Player.wasm`, and `gmeplay-function.js`; then put script tags to `Web-GME-Player.js` and `gmeplay-function.js` in the `<head>` of your html document. If you plan to use worker functionality, you should also download `gme-worker.js`.

The [demo page](https://thysbelon.github.io/Web-GME-Player) allows you to test out the features of the program, but it is not a fully fledged chiptune music webapp; if you are looking for a chiptune webapp, please see [chiptune.app](https://chiptune.app) by Matt Montag (whose code was helpful when I was figuring out how to make Web-GME-Player).

If you want to learn all of the features of this program, or gain a deeper understanding of the program's code, or wish to modify the program, please view the [demo page](https://thysbelon.github.io/Web-GME-Player), its [source code](https://github.com/Thysbelon/Web-GME-Player/blob/main/index.html), and the comments in the [source code of `gmeplay-function.js`](https://github.com/Thysbelon/Web-GME-Player/blob/main/gmeplay-function.js).

## How to build `main.c`
(Instructions have only been tested on WSL Ubuntu)

Download the source of [game-music-emu](https://github.com/libgme/game-music-emu) (confirmed to work with commit 9352952). Follow their directions for compiling, but use emscripten tools (and you may want to name the build folder "build-emscripten"). Use this command for cmake:
`emcmake cmake ../ -DBUILD_SHARED_LIBS=OFF`

Then, build the wasm and js with `emcc -O3 -I../game-music-emu/gme ../game-music-emu/build-emscripten/gme/libgme.a main.c -o Web-GME-Player.js -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,getValue,FS -sMODULARIZE -s 'EXPORT_NAME="createGMEmodule"'`
