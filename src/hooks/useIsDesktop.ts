import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

function readMatch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * True at >=1024px (the desktop breakpoint), false below it and in any
 * environment without matchMedia support (this project's jsdom test
 * environment has no matchMedia at all) -- safely defaulting to the
 * existing phone-first layout every current test was written against,
 * never throwing.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(readMatch);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
