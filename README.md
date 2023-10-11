# Web-GME-Player
This branch is broken. I would like help to fix it. Please see Issues.

## How to build `main.c`
Download the source of [game-music-emu](https://github.com/libgme/game-music-emu) (confirmed to work with [commit 87ebe8d](https://github.com/libgme/game-music-emu/commit/87ebe8d2f03f00ef98c4b5673d5234efd0412da7)). Follow their directions for compiling, but use emscripten tools (and you may want to name the build folder "build-emscripten"). Use this command for cmake:
`emcmake cmake ../ -DENABLE_UBSAN=OFF -DBUILD_SHARED_LIBS=OFF`

Then, build the wasm and js with `emcc -O3 -I../game-music-emu/gme ../game-music-emu/build-emscripten/gme/libgme.a main.c -o Web-GME-Player.js -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,getValue`
