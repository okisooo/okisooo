# The same v3.34 renderer used by upstream latest, pinned to its public digest.
FROM ghcr.io/lowlighter/metrics@sha256:257392f90340f916cb8b815026f259399f6b246d3eb7de38b58bfe7a07bd5b65
COPY patch-metrics.mjs /tmp/patch-metrics.mjs
RUN node /tmp/patch-metrics.mjs /metrics/source/plugins/wakatime/index.mjs \
    && rm /tmp/patch-metrics.mjs
