#!/bin/bash
# LS19 (Look Star 19) sitesini yerel sunucuda açar (çift tıkla).
# sunucu.py: sitenin dosyaları + canlı veri vekili (CelesTrak, JPL Horizons, JPL SBDB/Sentry) + önbellek + 10 dk güncelleme
cd "$(dirname "$0")"
PORT=${LS19_PORT:-8765}
export LS19_PORT=$PORT
# aynı kapıda eski bir sunucu varsa (ör. önceki python -m http.server) kapat
OLD=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$OLD" ]; then echo "Kapı $PORT'daki eski sunucu kapatılıyor ($OLD)"; kill $OLD 2>/dev/null; sleep 1; fi
echo "LS19: http://localhost:$PORT  (kapatmak için bu pencerede Ctrl+C)"
# macOS: open · Linux: xdg-open (Linux'ta: bash baslat.command)
if [ "$(uname)" = Darwin ]; then OPENER=open; else OPENER=xdg-open; fi
( sleep 1; "$OPENER" "http://localhost:$PORT/index.html" >/dev/null 2>&1 ) &
exec python3 sunucu.py
