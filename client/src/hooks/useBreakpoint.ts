import { useEffect, useState } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

function computeBreakpoint(width: number): Breakpoint {
    if (width < 640) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
}

export function useBreakpoint(): Breakpoint {
    const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => computeBreakpoint(window.innerWidth));

    useEffect(() => {
        function handleResize() {
            setBreakpoint(computeBreakpoint(window.innerWidth));
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return breakpoint;
}
