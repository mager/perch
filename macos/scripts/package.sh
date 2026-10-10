#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/macos/dist"
VERSION=0.2.1
MODE="${1:---development}"
if [[ "$MODE" != --development && "$MODE" != --release ]]; then
  echo 'Usage: macos/scripts/package.sh [--development|--release]' >&2; exit 1
fi
if [[ "$MODE" == --release ]]; then
  : "${PERCH_SIGNING_IDENTITY:?Set your Developer ID Application identity}"
  : "${PERCH_NOTARY_PROFILE:?Set a saved notarytool Keychain profile}"
fi
mkdir -p "$OUT"
STAGE="$(mktemp -d "$OUT/stage.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/Perch.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Universal binary; there is no bundled Node runtime or third-party package.
for ARCH in arm64 x86_64; do
  swift build --package-path "$ROOT/macos" -c release --arch "$ARCH"
  BIN="$(swift build --package-path "$ROOT/macos" -c release --arch "$ARCH" --show-bin-path)"
  cp "$BIN/Perch" "$STAGE/Perch-$ARCH"
done
lipo -create "$STAGE/Perch-arm64" "$STAGE/Perch-x86_64" -output "$APP/Contents/MacOS/Perch"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.perch.mac</string>
<key>CFBundleName</key><string>Perch</string>
<key>CFBundleDisplayName</key><string>Perch</string>
<key>CFBundleExecutable</key><string>Perch</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleVersion</key><string>3</string>
<key>CFBundleIconFile</key><string>Perch</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
<key>NSHumanReadableCopyright</key><string>Perch contributors. MIT licensed.</string>
</dict></plist>
PLIST
"$APP/Contents/MacOS/Perch" --render-icon "$STAGE/Perch.iconset"
iconutil -c icns "$STAGE/Perch.iconset" -o "$APP/Contents/Resources/Perch.icns"
cp "$ROOT/LICENSE" "$APP/Contents/Resources/LICENSE"
if [[ "$MODE" == --release ]]; then
  codesign --force --options runtime --timestamp --sign "$PERCH_SIGNING_IDENTITY" "$APP"
  ditto -c -k --keepParent "$APP" "$STAGE/Perch-notarize.zip"
  xcrun notarytool submit "$STAGE/Perch-notarize.zip" --keychain-profile "$PERCH_NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  spctl --assess --type execute "$APP"
  NAME="Perch-$VERSION"
else
  codesign --force --options runtime --sign - "$APP"
  NAME="Perch-$VERSION-developer-preview"
fi
codesign --verify --deep --strict "$APP"
# Keep the current app available locally as well as in the disk image.
if [[ -e "$OUT/Perch.app" ]]; then
  echo "macos/dist/Perch.app already exists; move it aside before packaging another build." >&2; exit 1
fi
ditto "$APP" "$OUT/Perch.app"
DMG_ROOT="$STAGE/disk"
mkdir "$DMG_ROOT"
ditto "$APP" "$DMG_ROOT/Perch.app"
ln -s /Applications "$DMG_ROOT/Applications"
cp "$ROOT/macos/INSTALL.txt" "$DMG_ROOT/Start here.txt"
if [[ "$MODE" == --release ]]; then
  python3 - "$DMG_ROOT/Start here.txt" <<'PYTHON'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text().replace('0.2.1 developer preview', '0.2.1')
s = s.replace('This development build is NOT Developer ID signed or notarized by Apple.\nIt is for local evaluation. Normal public distribution is pending Apple signing\nand notarization; do not disable Gatekeeper to use an untrusted download.',
              'This release is Developer ID signed and notarized by Apple.')
p.write_text(s)
PYTHON
fi
hdiutil create -volname Perch -srcfolder "$DMG_ROOT" -format UDZO -ov "$OUT/$NAME.dmg"
if [[ "$MODE" == --release ]]; then
  codesign --timestamp --sign "$PERCH_SIGNING_IDENTITY" "$OUT/$NAME.dmg"
  xcrun notarytool submit "$OUT/$NAME.dmg" --keychain-profile "$PERCH_NOTARY_PROFILE" --wait
  xcrun stapler staple "$OUT/$NAME.dmg"
fi
(cd "$OUT" && shasum -a 256 "$NAME.dmg" > "$NAME.dmg.sha256")
printf 'Built %s\n' "$OUT/$NAME.dmg"
