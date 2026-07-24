import { useResizeHandle } from "../hooks/useResizeHandle";

interface ResizeHandleProps {
  currentValue: number;
  minValue: number;
  maxValue: number;
  onChange: (next: number) => void;
  axis: "horizontal" | "vertical";
  inverted?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
}

export function ResizeHandle({
  currentValue,
  minValue,
  maxValue,
  onChange,
  axis,
  inverted,
  containerRef
}: ResizeHandleProps) {
  const { onPointerDown } = useResizeHandle({
    currentValue,
    minValue,
    maxValue,
    onChange,
    axis,
    inverted,
    containerRef
  });

  return (
    <div
      className={`resize-handle resize-handle-${axis}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={axis === "horizontal" ? "vertical" : "horizontal"}
    >
      <div className="resize-handle-grip" />
    </div>
  );
}
