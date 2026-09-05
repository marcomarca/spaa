import { expect, test } from "bun:test";
import { MediaSessionManager } from "../src/services/mediaSession";

test("MediaSessionManager runs safely in non-browser/test environments", () => {
  // Should not throw even when navigator.mediaSession is not present
  expect(() => {
    MediaSessionManager.setMetadata({
      title: "Capítulo 1: Introducción",
      artist: "Autor de Prueba",
      album: "Libro de Prueba",
    });
  }).not.toThrow();

  expect(() => {
    MediaSessionManager.setPlaybackState("playing");
    MediaSessionManager.setPlaybackState("paused");
  }).not.toThrow();

  expect(() => {
    MediaSessionManager.setPositionState({
      duration: 300,
      position: 45,
      playbackRate: 1.2,
    });
  }).not.toThrow();

  expect(() => {
    MediaSessionManager.setActionHandlers({
      onPlay: () => {},
      onPause: () => {},
    });
  }).not.toThrow();

  expect(() => {
    MediaSessionManager.clear();
  }).not.toThrow();
});
