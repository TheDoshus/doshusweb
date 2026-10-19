// The most one meme may weigh, in bytes. A video streams once it scrolls into view, so its weight is what a phone pays.
// bun run check fails a meme past it (bar the baseline it keeps), and bun run memes:convert re-encodes a WebM past it
module.exports = { video: 15e6, image: 3e6, VIDEO: /\.(webm|mp4|mov|mkv|avi)$/i };
