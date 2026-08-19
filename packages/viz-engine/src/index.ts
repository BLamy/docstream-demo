// The bookshelf remains the canonical scene source during this migration. The
// library build bundles that source into a standalone NPM artifact, while the
// public package boundary keeps consumers independent from the bookshelf app.
export * from './engine';
