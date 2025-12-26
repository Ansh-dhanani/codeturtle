export function startViewTransition(callback: () => void) {
  if ('startViewTransition' in document) {
    (document as Document & {
      startViewTransition: (callback: () => void) => void
    }).startViewTransition(callback);
  } else {
    callback();
  }
}