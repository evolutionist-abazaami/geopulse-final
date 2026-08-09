import { useInView, type UseInViewOptions } from "framer-motion";
import { useRef } from "react";

export function useScrollReveal(options?: UseInViewOptions) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px", ...options });
  return { ref, isInView };
}
