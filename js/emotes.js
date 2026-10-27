import { sfx } from './sfx.js';
// Emote catalog. Index = what goes over the network, so only ever APPEND (never reorder).
// pose: a World.emote() kind; no pose = a "moving" emote (icon + particles only, fine while running).
// price: Gems in the shop (none = free, owned from the start). Everything here is cosmetic.
export const EMOTES = [
  { n: 'Hello', ch: '👋', pose: 'wiggle' },
  { n: 'Haha', ch: '😂', pose: 'giggle' },
  { n: 'Party', ch: '🎉', pose: 'cheer', burst: '#ffd93d' },
  { n: 'Sad', ch: '😢', pose: 'sad' },
  { n: 'Grr', ch: '😡', pose: 'shake' },
  { n: 'Hmm', ch: '🤔', pose: 'tilt' },
  { n: 'Love', ch: '❤️', pose: 'love', burst: '#ff6b9d' },
  { n: 'Cool', ch: '😎', pose: 'cool' },
  { n: 'GG', ch: '🤝', pose: 'wiggle', price: 25 },
  { n: 'Clap', ch: '👏', pose: 'cheer', price: 25 },
  { n: 'Fire', ch: '🔥', burst: '#ff6a00', price: 40 },
  { n: 'Shock', ch: '😱', pose: 'shake', price: 30 },
  { n: 'Sleepy', ch: '😴', pose: 'sad', price: 30 },
  { n: 'Wink', ch: '😉', pose: 'tilt', price: 30 },
  { n: 'Dance', ch: '🕺', pose: 'cheer', burst: '#b28dff', price: 50 },
  { n: 'Star', ch: '⭐', burst: '#ffd93d', price: 40 },
  { n: 'Skull', ch: '💀', pose: 'sad', price: 45 },
  { n: 'Ghost', ch: '👻', pose: 'wiggle', burst: '#cfd8ff', price: 45 },
  { n: 'Rocket', ch: '🚀', pose: 'cheer', burst: '#4dd0e1', price: 50 },
  { n: 'Pizza', ch: '🍕', price: 35 },
  { n: 'Crown', ch: '👑', pose: 'cool', burst: '#ffd93d', price: 60 },
  { n: 'Money', ch: '🤑', pose: 'love', burst: '#7cf08a', price: 55 },
  { n: 'Brain', ch: '🧠', price: 40 },
  { n: 'Sweat', ch: '😅', pose: 'shake', price: 30 },
  { n: 'Mind blown', ch: '🤯', pose: 'shake', burst: '#ff9f1a', price: 55 },
  { n: 'Ninja', ch: '🥷', price: 50 },
  { n: 'Alien', ch: '👽', pose: 'tilt', burst: '#7cf08a', price: 50 },
  { n: 'Robot', ch: '🤖', pose: 'wiggle', price: 45 },
  { n: 'Cheers', ch: '🥂', pose: 'cheer', burst: '#ffd93d', price: 50 },
  { n: 'Diamond', ch: '💎', burst: '#77ddff', price: 60 },
  { n: 'Unicorn', ch: '🦄', pose: 'cool', burst: '#ff9ecb', price: 70 },
  { n: 'Eyes', ch: '👀', price: 30 },
  { n: 'Balloon', ch: '🎈', price: 30 },
  { n: 'Popcorn', ch: '🍿', price: 35 },
  { n: 'Zap', ch: '⚡', burst: '#ffd93d', price: 40 },
  { n: 'Rainbow', ch: '🌈', burst: '#4dd0e1', price: 55 },
  { n: 'Brr', ch: '🥶', pose: 'shake', burst: '#a5f3fc', price: 35 },
  { n: 'Music', ch: '🎵', pose: 'wiggle', burst: '#b28dff', price: 40 },
  { n: 'Flex', ch: '💪', pose: 'cool', burst: '#ff9f1a', price: 50 },
  { n: 'Please', ch: '🙏', pose: 'tilt', price: 30 },
  { n: 'Salute', ch: '🫡', pose: 'cool', price: 40 },
  { n: 'Party face', ch: '🥳', pose: 'cheer', burst: '#ff6b9d', price: 50 },
  { n: 'Bawl', ch: '😭', pose: 'sad', burst: '#4dd0e1', price: 35 },
  { n: 'Clown', ch: '🤡', pose: 'giggle', price: 45 },
  { n: 'Thumbs up', ch: '👍', pose: 'cheer', price: 25 },
  { n: 'Peace', ch: '✌️', pose: 'cool', price: 30 },
  { n: 'Splash', ch: '🌊', burst: '#4dd0e1', price: 35 },
  { n: 'Cake', ch: '🎂', pose: 'cheer', burst: '#ff9ecb', price: 45 },
  { n: 'Coffee', ch: '☕', price: 30 },
  { n: 'Gamer', ch: '🎮', pose: 'wiggle', price: 40 },
  { n: 'Lucky', ch: '🍀', pose: 'love', burst: '#7cf08a', price: 40 },
  { n: 'Zzz', ch: '💤', pose: 'sad', price: 30 },
  { n: 'Meow', ch: '🐱', pose: 'tilt', price: 35 },
  { n: 'Woof', ch: '🐶', pose: 'wiggle', price: 35 },
  { n: 'Bullseye', ch: '🎯', pose: 'cool', burst: '#ff4d6d', price: 45 },
  { n: 'Winner', ch: '🏆', pose: 'cheer', burst: '#ffd93d', price: 60 },
];
export function playEmote(world, id, i, mine) {
  const e = EMOTES[i], g = world.m.get(id)?.g; if (!e || !g) return;
  if (e.pose) world.emote(id, e.pose);
  world.popIcon(id, e.ch);
  if (e.burst) world.burst(g.position.x, g.position.y + 1.6, g.position.z, e.burst, 14);
  if (mine) sfx('click');
}
