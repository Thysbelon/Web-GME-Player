# Web-GME-Player
Play a single chiptune file track in the browser and loop infinitely.

Please view the [demo page](https://thysbelon.github.io/Web-GME-Player), its [source code](https://github.com/Thysbelon/Web-GME-Player/blob/main/index.html), and the comments in the [source code of `gmeplay-function.js`](https://github.com/Thysbelon/Web-GME-Player/blob/main/gmeplay-function.js).

## How to build `main.c`
(Instructions have only been tested on WSL Ubuntu)

Download the source of [game-music-emu](https://github.com/libgme/game-music-emu) (confirmed to work with commit 9352952). Follow their directions for compiling, but use emscripten tools (and you may want to name the build folder "build-emscripten"). Use this command for cmake:
`emcmake cmake ../ -DBUILD_SHARED_LIBS=OFF`

Then, build the wasm and js with `emcc -O3 -I../game-music-emu/gme ../game-music-emu/build-emscripten/gme/libgme.a main.c -o Web-GME-Player.js -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,getValue,FS -sMODULARIZE -s 'EXPORT_NAME="createGMEmodule"'`