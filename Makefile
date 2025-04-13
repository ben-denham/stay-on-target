deps:
	npm install
dev:
	npm run dev

build:
	npm run build
serve:
	npm run serve

chrome:
	google-chrome --user-agent=stay-on-target --disable-web-security --user-data-dir=".chrome"
