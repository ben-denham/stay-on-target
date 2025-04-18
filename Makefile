.PHONY: deps dev build serve chrome chromium

deps:
	npm install
	cd app/assets/fonts && \
		wget https://aurekfonts.github.io/SceletAF/SceletAF.zip && \
		unzip SceletAF.zip -d SceletAF && \
		rm SceletAF.zip
dev:
	npm run dev

build:
	npm run build
serve:
	npm run serve

chrome:
	google-chrome --user-agent=stay-on-target --disable-web-security --user-data-dir=".chrome"
chromium:
	chromium-browser --user-agent=stay-on-target --disable-web-security --user-data-dir=".chromium"
