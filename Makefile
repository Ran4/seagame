.PHONY: run website

run:
	npm run dev

website:
	claude -p "Update website/website.html"
