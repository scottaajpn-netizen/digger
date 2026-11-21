/** Differentiate broken videos from embedding setup problems.
 * https://developers.google.com/youtube/iframe_api_reference#onError
 */
export type SamplingPlaybackAction = "skip" | "configuration" | "unknown";

export function samplingPlaybackAction(errorCode: number): SamplingPlaybackAction {
  if (errorCode === 100 || errorCode === 101 || errorCode === 150 || errorCode === 5) return "skip";
  // 153 means the request lacks a Referer or equivalent client identification.
  // Skipping every video would only hide a site-level configuration problem.
  if (errorCode === 153) return "configuration";
  return "unknown";
}
