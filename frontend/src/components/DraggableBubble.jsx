import { useState, useRef, useEffect, useCallback } from "react";
import "./DraggableBubble.css";

/**
 * DraggableBubble - A wrapper component that makes its children draggable
 * Constrains movement within viewport with 20px padding
 */
export default function DraggableBubble({
  children,
  initialPosition = { x: 100, y: 100 },
  className = "",
  style = {},
}) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Clamp position to viewport bounds with padding
  const clampPosition = useCallback((x, y) => {
    const padding = 20;
    const element = dragRef.current;
    if (!element) return { x, y };

    const rect = element.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - padding;
    const maxY = window.innerHeight - rect.height - padding;

    return {
      x: Math.max(padding, Math.min(x, maxX)),
      y: Math.max(padding, Math.min(y, maxY)),
    };
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((clientX, clientY) => {
    const element = dragRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    offsetRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    setIsDragging(true);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback(
    (clientX, clientY) => {
      if (!isDragging) return;

      const newX = clientX - offsetRef.current.x;
      const newY = clientY - offsetRef.current.y;
      const clamped = clampPosition(newX, newY);
      setPosition(clamped);
    },
    [isDragging, clampPosition],
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse events
  const onMouseDown = (e) => {
    // Only drag on left click and not on interactive elements
    if (e.button !== 0) return;
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "TEXTAREA"
    )
      return;

    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  // Touch events
  const onTouchStart = (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "BUTTON" ||
      e.target.tagName === "TEXTAREA"
    )
      return;

    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  // Document-level move and end handlers
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e) => handleDragMove(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    };
    const onMouseUp = () => handleDragEnd();
    const onTouchEnd = () => handleDragEnd();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Re-clamp on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition]);

  return (
    <div
      ref={dragRef}
      className={`draggable-bubble ${isDragging ? "dragging" : ""} ${className}`}
      style={{
        ...style,
        left: position.x,
        top: position.y,
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {children}
    </div>
  );
}
