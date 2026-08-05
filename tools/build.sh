#!/bin/bash
# Собирает папку dist/ — только то, что нужно самому сайту.
# Исходники (фотографии, сертификаты, спрайты персонажа, шрифты в .otf,
# расшифровки) остаются в проекте и на хостинг не уезжают.
#
#   bash tools/build.sh
#
# Дальше содержимое dist/ можно перетащить на любой статический хостинг.

set -e
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist

cp index.html dist/
cp -R css js assets dist/

# служебное
find dist -name '.DS_Store' -delete
find dist -name '*.json' -path '*headless*' -delete

echo "dist/ собран:"
echo "  файлов: $(find dist -type f | wc -l | tr -d ' ')"
echo "  размер: $(du -sh dist | cut -f1)"
echo
echo "Проверка ссылок из index.html:"
missing=0
for f in $(grep -ohE '(src|href)="[^"]+"' dist/index.html | sed -E 's/.*="([^"]+)".*/\1/' | grep -v '^mailto'); do
  if [ ! -e "dist/$f" ]; then echo "  ОТСУТСТВУЕТ: $f"; missing=1; fi
done
for f in $(grep -ohE "url\('[^']+'\)" dist/css/*.css | sed -E "s/url\('([^']+)'\)/\1/" | sed 's|\.\./||'); do
  if [ ! -e "dist/$f" ]; then echo "  ОТСУТСТВУЕТ: $f"; missing=1; fi
done
[ $missing -eq 0 ] && echo "  все файлы на месте"
