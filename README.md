<p style="text-align:center">
  <img src="images/header.svg" width="100%">
  <br>
</p>
Live RSS Bookmarks is a Chrome extension that mimics Firefox's old live bookmarks feature (removed since 2018). It does this by creating bookmarks inside a folder for each RSS feed.

This extension was previously called [Foxish](https://chrome.google.com/webstore/detail/foxish-live-rss/nbhdikhnaigcdlamenbgkmllgmfnngoi?hl=en) but was re-written to support [Chrome Manifest v3](https://developer.chrome.com/docs/extensions/mv3/intro/). At this time it was simplified since Chrome no longer limits bookmark access like it did in the past and efforts were made to future proof it.

## Details
* Uses webpack for commonjs transpiling to esm modules for rss-parser.
* Uses [he](https://github.com/mathiasbynens/he) for HTML entity decoding (can't access DomParser in extension webworkers).
* Support Chrome Manifest v3

## Building
`yarn webpack`

## Packaging
`zip live-rss.zip build html images manifest.json styles`