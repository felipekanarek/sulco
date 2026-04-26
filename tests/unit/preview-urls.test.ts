import { describe, expect, it } from 'vitest';
import { spotifySearchUrl, youtubeSearchUrl } from '@/lib/preview/urls';

describe('spotifySearchUrl', () => {
  it('encoda artist + title básicos com %20', () => {
    expect(spotifySearchUrl('Spoon', 'Before Destruction')).toBe(
      'https://open.spotify.com/search/Spoon%20Before%20Destruction',
    );
  });

  it('encoda acentos pt-BR', () => {
    expect(spotifySearchUrl('Caetano Veloso', 'Pulsar')).toBe(
      'https://open.spotify.com/search/Caetano%20Veloso%20Pulsar',
    );
    expect(spotifySearchUrl('Mestre João', 'Coração')).toBe(
      'https://open.spotify.com/search/Mestre%20Jo%C3%A3o%20Cora%C3%A7%C3%A3o',
    );
  });

  it("encoda apóstrofo", () => {
    expect(spotifySearchUrl('Journey', "Don't Stop Believin'")).toBe(
      "https://open.spotify.com/search/Journey%20Don't%20Stop%20Believin'",
    );
  });

  it('encoda & e aspas duplas', () => {
    expect(spotifySearchUrl('Earth & Fire', 'Memories')).toBe(
      'https://open.spotify.com/search/Earth%20%26%20Fire%20Memories',
    );
  });
});

describe('youtubeSearchUrl', () => {
  it('encoda artist + title básicos com %20', () => {
    expect(youtubeSearchUrl('Spoon', 'Before Destruction')).toBe(
      'https://www.youtube.com/results?search_query=Spoon%20Before%20Destruction',
    );
  });

  it('encoda acentos pt-BR', () => {
    expect(youtubeSearchUrl('Caetano Veloso', 'Pulsar')).toBe(
      'https://www.youtube.com/results?search_query=Caetano%20Veloso%20Pulsar',
    );
  });

  it("encoda apóstrofo", () => {
    expect(youtubeSearchUrl('Journey', "Don't Stop Believin'")).toBe(
      "https://www.youtube.com/results?search_query=Journey%20Don't%20Stop%20Believin'",
    );
  });

  it('encoda & e aspas duplas', () => {
    expect(youtubeSearchUrl('Earth & Fire', 'Memories')).toBe(
      'https://www.youtube.com/results?search_query=Earth%20%26%20Fire%20Memories',
    );
  });
});
