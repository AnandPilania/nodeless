import { useCallback, useRef } from "react";

interface UseResizeHandleOptions {
    currentValue: number;
    minValue: number;
    maxValue: number;
    onChange: (next: number) => void;
    axis: "horizontal" | "vertical";
    inverted?: boolean;
    containerRef?: React.RefObject<HTMLElement | null>;
}

export function useResizeHandle({
    currentValue,
    minValue,
    maxValue,
    onChange,
    axis,
    inverted = false,
    containerRef
}: UseResizeHandleOptions): { onPointerDown: (e: React.PointerEvent) => void } {
    const startPos = useRef(0);
    const startValue = useRef(0);
    const draggingRef = useRef(false);
    const containerSizeAtDragStart = useRef(1);

    const handlePointerMove = useCallback(
        (e: PointerEvent) => {
            if (!draggingRef.current) return;
            const pos = axis === "horizontal" ? e.clientX : e.clientY;
            const pixelDelta = pos - startPos.current;
            const signedPixelDelta = inverted ? -pixelDelta : pixelDelta;

            const delta = containerRef
                ? signedPixelDelta / containerSizeAtDragStart.current
                : signedPixelDelta;

            const next = Math.min(maxValue, Math.max(minValue, startValue.current + delta));
            onChange(next);
        },
        [axis, inverted, minValue, maxValue, onChange, containerRef]
    );

    const handlePointerUp = useCallback(() => {
        draggingRef.current = false;
        document.body.classList.remove("resizing-horizontal", "resizing-vertical");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
    }, [handlePointerMove]);

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            draggingRef.current = true;
            startPos.current = axis === "horizontal" ? e.clientX : e.clientY;
            startValue.current = currentValue;
            if (containerRef?.current) {
                const rect = containerRef.current.getBoundingClientRect();
                containerSizeAtDragStart.current = axis === "horizontal" ? rect.width : rect.height;
            }
            document.body.classList.add(axis === "horizontal" ? "resizing-horizontal" : "resizing-vertical");
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
        },
        [axis, currentValue, handlePointerMove, handlePointerUp, containerRef]
    );

    return { onPointerDown };
}
