#!/bin/bash
# Build a self-contained Merlin SIP.app on a Mac.
# Usage: ./publish-macos.sh [osx-arm64|osx-x64]
set -euo pipefail
cd "$(dirname "$0")/.."
RID="${1:-osx-arm64}"
OUT="artifacts/macos/$RID"
APP="artifacts/macos/Merlin SIP.app"

dotnet publish MerlinSIP.Mac/MerlinSIP.Mac.csproj -c Release -r "$RID" --self-contained true -o "$OUT"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp -R "$OUT"/. "$APP/Contents/MacOS/"
cp MerlinSIP.Mac/Info.plist "$APP/Contents/Info.plist"
ICON="$APP/Contents/MacOS/Assets/CKMedia-Icon.png"
if [ -f "$ICON" ]; then
  cp "$ICON" "$APP/Contents/Resources/AppIcon.png"
fi
chmod +x "$APP/Contents/MacOS/MerlinSIP"
echo "Built $APP"
echo "First launch: open \"$APP\""
