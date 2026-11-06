# LS19 (Look Star 19) — yerel sunucu kapsayıcısı: sitenin dosyaları (web/) + canlı veri vekili (web/sunucu.py).
# Yalnız Python standart kütüphanesi gerekir; derleme adımı yoktur. Kullanım: docker compose up  →  http://localhost:8765
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LS19_HOST=0.0.0.0 \
    LS19_PORT=8765

WORKDIR /app/web
# .dockerignore yalnız web/ klasörünü geçirir (testler, önbellek ve tarayıcının indirmediği tam JPL çekirdekleri hariç)
COPY web/ /app/web/

# root olmayan kullanıcı; önbellek klasörü ona ait (compose.yaml buraya adlandırılmış bir birim bağlar, birim bu sahipliği devralır)
RUN useradd --system --uid 10001 --no-create-home ls19 \
 && mkdir -p /app/web/data/cache \
 && chown ls19 /app/web/data/cache
USER ls19

EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/durum' % os.environ['LS19_PORT'], timeout=4)"

CMD ["python3", "sunucu.py"]
