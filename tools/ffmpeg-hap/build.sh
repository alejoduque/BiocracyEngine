#!/bin/bash
# build.sh — a minimal ffmpeg that can write HAP (.mov), for dome-render.js
# ===========================================================================
# The planetarium plays pre-rendered dome clips as .MOV with the HAP codec.
# ffmpeg's HAP encoder needs libsnappy, which Homebrew's ffmpeg is not built
# with. This builds a small ffmpeg of its own — HAP, MOV, raw video in, the
# few filters dome-render uses — into ./bin, without touching the system's.
#
#   brew install snappy        (once)
#   ./build.sh                 → ./bin/ffmpeg
#
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VER=8.1
PREFIX=$(brew --prefix)
cd "$HERE"
if [ ! -d "ffmpeg-$VER" ]; then
  curl -fL -o "ffmpeg-$VER.tar.xz" "https://ffmpeg.org/releases/ffmpeg-$VER.tar.xz"
  tar xf "ffmpeg-$VER.tar.xz"
fi
cd "ffmpeg-$VER"
./configure --prefix="$HERE" \
  --disable-everything --disable-doc --disable-debug --disable-ffplay \
  --enable-libsnappy \
  --enable-encoder=hap,png,rawvideo --enable-decoder=hap,rawvideo,png \
  --enable-muxer=mov,image2,rawvideo --enable-demuxer=rawvideo,mov,image2 \
  --enable-protocol=file,pipe,fd \
  --enable-filter=vflip,scale,format,null,copy,fps \
  --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib"
make -j"$(sysctl -n hw.ncpu)"
make install
"$HERE/bin/ffmpeg" -hide_banner -encoders | grep -i hap
