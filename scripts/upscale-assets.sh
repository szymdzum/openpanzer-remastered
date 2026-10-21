#!/bin/zsh
# Generates the @2x game assets into public/hd/ (served at /hd/, gitignored).
#   maps:  Real-ESRGAN x4plus, scaled back down to 2x, WebP q85  -> public/hd/maps/images/map_N.webp
#   units: xBR 2x on the colour, the alpha scaled separately     -> public/hd/units/images/NAME.png
# Already generated files are skipped, so a stopped run can be restarted.
#
# usage: scripts/upscale-assets.sh [maps|units|all]
# needs: ffmpeg, cwebp, and for maps realesrgan-ncnn-vulkan (set REALESRGAN to its path; its
#        models/ folder must sit next to it)
set -e
SELF=${0:A} #inside a function $0 is the function's name
cd "${0:A:h}/.."
RES=game/resources
OUT=public/hd
REALESRGAN=${REALESRGAN:-realesrgan-ncnn-vulkan}
what=${1:-all}

maps() {
	mkdir -p $OUT/maps/images
	local tmp=$(mktemp -d) n=0 total=$(ls $RES/maps/images/*.png | wc -l | tr -d ' ')
	for f in $RES/maps/images/*.png; do
		n=$((n + 1))
		local name=${f:t:r} out=$OUT/maps/images/${f:t:r}.webp
		[[ -s $out ]] && continue
		echo "map $n/$total $name"
		"$REALESRGAN" -i $f -o $tmp/x4.png -n realesrgan-x4plus -s 4 -m "${REALESRGAN:A:h}/models" >/dev/null 2>&1
		ffmpeg -loglevel error -y -i $tmp/x4.png -vf "scale=iw/2:ih/2:flags=lanczos" $tmp/x2.png
		cwebp -quiet -q 85 $tmp/x2.png -o $out
	done
	rm -rf $tmp
}

# one unit sprite strip: colour with transparent pixels filled dark (no light halo), xBR 2x,
# alpha xBR 2x, merged back
unit() {
	local f=$1 out=$OUT/units/images/${1:t}
	[[ -s $out ]] && return
	local tmp=$(mktemp -d)
	local w=$(ffprobe -v error -show_entries stream=width -of csv=p=0 $f) h=$(ffprobe -v error -show_entries stream=height -of csv=p=0 $f)
	ffmpeg -loglevel error -y -f lavfi -i color=c=0x1a1a14:s=${w}x${h} -i $f \
		-filter_complex "[1]format=rgba[s];[0][s]overlay=format=auto,format=rgb24,xbr=2" -frames:v 1 $tmp/c.png
	ffmpeg -loglevel error -y -i $f -vf "format=rgba,alphaextract,format=rgb24,xbr=2,format=gray" $tmp/a.png
	ffmpeg -loglevel error -y -i $tmp/c.png -i $tmp/a.png -filter_complex "[0]format=rgb24[c];[1]format=gray[a];[c][a]alphamerge" -pix_fmt rgba $out
	rm -rf $tmp
}

units() {
	mkdir -p $OUT/units/images
	local files=($RES/units/images/*.png)
	echo "units: ${#files} sprites"
	# 6 sprites at a time, each through this script's "unit" command
	print -l $files | xargs -P 6 -n 1 "$SELF" unit
}

case $what in
	maps) maps ;;
	units) units ;;
	unit) unit $2 ;;
	all) units; maps ;;
	*) echo "usage: $0 [maps|units|all]"; exit 1 ;;
esac
