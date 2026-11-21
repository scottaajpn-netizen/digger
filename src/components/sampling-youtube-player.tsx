"use client";

import { useEffect, useRef } from "react";

type YTPlayer = { destroy(): void };
type YTPlayerEvent = { data: number };
type YTApi = {
  Player: new (
    element: HTMLElement,
    options: { events: { onError: (event: YTPlayerEvent) => void } },
  ) => YTPlayer;
};
type YTWindow = Window & {
  YT?: YTApi;
  onYouTubeIframeAPIReady?: () => void;
};

let apiLoader: Promise<YTApi> | undefined;

function loadIframeApi(): Promise<YTApi> {
  const ytWindow = window as YTWindow;
  if (ytWindow.YT?.Player) return Promise.resolve(ytWindow.YT);
  if (apiLoader) return apiLoader;

  apiLoader = new Promise<YTApi>((resolve, reject) => {
    const previousReady = ytWindow.onYouTubeIframeAPIReady;
    ytWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (ytWindow.YT?.Player) resolve(ytWindow.YT);
      else reject(new Error("YouTube iframe API unavailable"));
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => reject(new Error("YouTube iframe API blocked"));
    document.head.appendChild(script);
  });
  return apiLoader;
}

export function SamplingYouTubePlayer({
  id,
  title,
  onPlaybackError,
}: {
  id: string;
  title: string;
  onPlaybackError: (code: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onPlaybackError);

  useEffect(() => {
    onErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Show the ordinary iframe immediately; if the API script is unavailable,
    // manual "Vidéo inaccessible" remains usable.
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
    iframe.title = title;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    container.appendChild(iframe);

    let disposed = false;
    let player: YTPlayer | undefined;

    void loadIframeApi().then(api => {
      if (disposed) return;
      player = new api.Player(iframe, {
        events: {
          onError: event => {
            if (!disposed) onErrorRef.current(event.data);
          },
        },
      });
    }).catch(() => {
      // The normal iframe can still play even if the Player API is blocked.
    });

    return () => {
      disposed = true;
      player?.destroy();
      iframe.remove();
    };
  }, [id, title]);

  return <div className="sampling-youtube-player" ref={containerRef} />;
}
