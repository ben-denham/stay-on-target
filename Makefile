deps:
	npm install
	cd public && \
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
