#!/bin/bash
# ROCSIM canlı görev sitesini yerel sunucuda açar (çift tıkla).
# sunucu.py: sitenin dosyaları + canlı uydu verisi vekili (CelesTrak, JPL Horizons) + önbellek
cd "$(dirname "$0")"
PORT=8765
# aynı kapıda eski bir sunucu varsa (ör. önceki python -m http.server) kapat
OLD=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$OLD" ]; then echo "Kapı $PORT'daki eski sunucu kapatılıyor ($OLD)"; kill $OLD 2>/dev/null; sleep 1; fi
echo "ROCSIM: http://localhost:$PORT  (kapatmak için bu pencerede Ctrl+C)"
( sleep 1; open "http://localhost:$PORT/index.html" ) &
exec python3 sunucu.py
