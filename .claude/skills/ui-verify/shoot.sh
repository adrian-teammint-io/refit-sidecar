#!/bin/bash
# Screenshot the built drawer (mock.html + content.js) and popup (popup.html) with stubbed chrome APIs (stub.js).
# Usage: npm run build && bash .claude/skills/ui-verify/shoot.sh [drawer|popup|all] [mode ...]   -> prints PNG paths
# Popup height defaults to 600 (Chrome's popup limit): H=600.
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
WHAT=${1:-all}; shift
MODES=${*:-results results-nav=failed results-nav=projects results-nav=projects-q=skin results-nav=project results-nav=project-sort=service results-nav=connections results-nav=fitting loading-nav=projects many-nav=projects many-nav=connections output never zero-nav=failed error-nav=failed offline missing settings many-nav=failed results-light results-nav=projects-light results-nav=project-light results-nav=fitting-light}
S=$(mktemp -d)
cp -R "$REPO/dist" "$S/x" && cp "$HERE/stub.js" "$HERE/mock.html" "$S/x/"
sed -i '' 's|<head>|<head><script src="/stub.js"></script>|' "$S/x/popup.html"
PORT=8766
(cd "$S/x" && python3 -m http.server $PORT >/dev/null 2>&1 &)
sleep 1
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shoot() { "$C" --headless=new --disable-gpu --hide-scrollbars --window-size=$1 --virtual-time-budget=${B:-8000} --screenshot="$2" "$3" >/dev/null 2>&1; }
for m in $MODES; do
  q=${m/-light/&light}; q=${q//-nav=/&nav=}; q=${q//-q=/&q=}; q=${q//-sort=/&sort=}
  [[ $WHAT != popup ]] && shoot 1280,860 "$S/drawer-$m.png" "http://localhost:$PORT/mock.html#$q"
  [[ $WHAT != drawer ]] && shoot 420,${H:-600} "$S/popup-$m.png" "http://localhost:$PORT/popup.html?m=$q"
done
# errors rendered into the mock page
"$C" --headless=new --virtual-time-budget=3000 --dump-dom "http://localhost:$PORT/mock.html#results" 2>/dev/null | grep -o '<pre id="e">[^<]*' | grep -v "' + m"
pkill -f "http.server $PORT"
ls "$S"/*.png
