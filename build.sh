#!/usr/bin/env bash
# Compila el sitio (landing + documentación) en public/. Lo usa Cloudflare Pages: «bash build.sh», salida «public».
set -euo pipefail
pip install -r requirements-docs.txt
NO_MKDOCS_2_WARNING=1 mkdocs build --strict -d public/docs
cp -r landing/. public/
