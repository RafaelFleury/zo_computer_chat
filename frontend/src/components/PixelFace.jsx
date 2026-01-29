import { memo, useEffect, useState, useRef } from 'react';
import './PixelFace.css';

/**
 * PixelFace - A cute, minimal pixel art face inspired by the reference images
 *
 * States:
 * - idle: Square eyes only, gentle breathing animation
 * - waiting: Square eyes, blinking (idle waiting state)
 * - talking: Square eyes + animated mouth (opens/closes)
 * - thinking: Horizontal line eyes (squinting), eyes shift side to side
 * - sleeping: Closed eyes (horizontal lines), very slow breathing
 * - listening: Eyes follow mouse cursor (listening for user input)
 */
const PixelFace = memo(function PixelFace({ animationState = 'idle' }) {
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const faceRef = useRef(null);

  // Mouse tracking for listening state
  useEffect(() => {
    if (animationState !== 'listening') {
      // Reset eye position when not listening
      setEyePosition({ x: 0, y: 0 });
      return;
    }

    const handleMouseMove = (e) => {
      if (!faceRef.current) return;

      const faceRect = faceRef.current.getBoundingClientRect();
      const faceCenterX = faceRect.left + faceRect.width / 2;
      const faceCenterY = faceRect.top + faceRect.height / 2;

      // Calculate angle to mouse
      const deltaX = e.clientX - faceCenterX;
      const deltaY = e.clientY - faceCenterY;

      // Limit eye movement range (max 8px in any direction)
      const maxMove = 8;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const scale = Math.min(distance / 200, 1); // Normalize based on distance

      const eyeX = Math.max(-maxMove, Math.min(maxMove, (deltaX / distance) * maxMove * scale));
      const eyeY = Math.max(-maxMove, Math.min(maxMove, (deltaY / distance) * maxMove * scale));

      setEyePosition({ x: eyeX, y: eyeY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [animationState]);

  return (
    <div className={`pixel-face ${animationState}`} ref={faceRef}>
      {/* Eyes container */}
      <div className="eyes">
        <div
          className={`eye left ${animationState}`}
          style={animationState === 'listening' ? {
            transform: `translate(${eyePosition.x}px, ${eyePosition.y}px)`
          } : undefined}
        />
        <div
          className={`eye right ${animationState}`}
          style={animationState === 'listening' ? {
            transform: `translate(${eyePosition.x}px, ${eyePosition.y}px)`
          } : undefined}
        />
      </div>

      {/* Mouth - only visible when talking */}
      <div className={`mouth ${animationState}`} />
    </div>
  );
});

export default PixelFace;
