import { useEffect, useState } from "react";

export function useWindowSize(): { width: number; height: number } {
    const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        function handleResize() {
            setSize({ width: window.innerWidth, height: window.innerHeight });
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return size;
}
