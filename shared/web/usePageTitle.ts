import { useEffect } from "react";
import { pageTitle } from "../../site/shared/pageTitle";

export { pageTitle };

/** Names the tab for as long as the page is mounted, then puts back what was there. */
export function usePageTitle(title: string, section: string) {
  useExactTitle(pageTitle(title, section));
}

/**
 * Sets the tab to `title` as it stands, the forecast pages' own shape
 * (site/shared/pageTitle.ts `forecastTitle`). Null leaves whatever the HTML
 * already said, which is that same string while a spot page is still loading.
 */
export function useExactTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
