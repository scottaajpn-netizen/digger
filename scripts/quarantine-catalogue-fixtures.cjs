// Narrow, recoverable migration for the confirmed Last.fm fallback fixture.
const fs = require('node:fs');
const path = require('node:path');
function isConfirmedFixture(e) {
  const chaining = [
    ['Niche fixture','Neighbour fixture','83795312'],
    ['Neighbour fixture','Next fixture','1419016756'],
  ].some(([anchor, neighbour, id]) => e.anchorArtist === anchor &&
    e.anchorArtistMbid === undefined && e.neighbourArtist === neighbour &&
    e.neighbourRank === 0 && e.similarity === 0.6 &&
    JSON.stringify(e.artistTags) === JSON.stringify(['electronic','broken beat']) &&
    ((e.trackRank === 0 && e.track?.id === `lastfm-crate:${id}` &&
      e.track.title === 'Catalogue cut' && e.track.artist === neighbour &&
      e.track.lastfmListeners === 600 && e.track.externalIds?.lastfm === 'https://www.last.fm/music/fixture') ||
     (e.trackRank === 1 && e.track?.id === 'lastfm-crate:963979690' &&
      e.track.title === 'Guest collaboration' && e.track.artist === 'Guest Feature' &&
      e.track.lastfmListeners === 900 && e.track.externalIds?.lastfm === 'https://www.last.fm/music/guest-feature')));
  if (chaining) return true;
  const roots = [
    ['Léon Phal', '8b8b8b8b-1111-4111-8111-111111111111', 'Jazz Root', '1418421032', '1418421033'],
    ['Jungle Jack', '9c9c9c9c-1111-4111-8111-111111111111', 'Rap Root', '980786598', '980786599'],
  ];
  return roots.some(([anchor, mbid, artist, first, second], neighbourRank) =>
    [0, 1].some(rank => e.anchorArtist === anchor && e.anchorArtistMbid === mbid &&
      e.neighbourArtist === artist && e.neighbourRank === neighbourRank && e.trackRank === rank &&
      e.similarity === 0.9 && Array.isArray(e.artistTags) && e.artistTags.length === 0 &&
      e.track?.artist === artist && e.track.title === `${artist} cut ${rank + 1}` &&
      e.track.id === `lastfm-crate:${rank ? second : first}` &&
      e.track.lastfmListeners === (rank ? 75 : 60) &&
      Object.keys(e.track.externalIds || {}).length === 0));
}
function quarantine(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(original);
  if (data.schemaVersion !== 1 || !Array.isArray(data.entries)) throw Error('Unsupported catalogue');
  const removed = data.entries.filter(isConfirmedFixture);
  if (!removed.length) return { removed: 0, preserved: data.entries.length };
  const backup = filePath + `.before-fixture-quarantine-${Date.now()}.json`;
  fs.writeFileSync(backup, original, { flag: 'wx' });
  const entries = data.entries.filter(e => !isConfirmedFixture(e));
  const temporary = filePath + `.quarantine-${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...data, entries }, null, 2), { flag: 'wx' });
  fs.renameSync(temporary, filePath);
  return { removed: removed.length, preserved: entries.length, backup };
}
module.exports = { quarantine, isConfirmedFixture };
if (require.main === module) {
  if (!process.argv[2]) throw Error('Pass the exact catalogue file to repair');
  console.log(JSON.stringify(quarantine(path.resolve(process.argv[2]))));
}
