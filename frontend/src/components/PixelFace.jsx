import { memo } from 'react';
import './PixelFace.css';

/**
 * PixelFace - A cute, minimal pixel art face inspired by the reference images
 * 
 * States:
 * - idle: Square eyes only, gentle breathing animation
 * - talking: Square eyes + animated mouth (opens/closes)
 * - thinking: Horizontal line eyes (squinting), eyes shift side to side
 * - sleeping: Closed eyes (horizontal lines), very slow breathing
 */
const PixelFace = memo(function PixelFace({ animationState = 'idle' }) {
  return (
    <div className={`pixel-face ${animationState}`}>
      {/* Eyes container */}
      <div className="eyes">
        <div className={`eye left ${animationState}`} />
        <div className={`eye right ${animationState}`} />
      </div>
      
      {/* Mouth - only visible when talking */}
      <div className={`mouth ${animationState}`} />
    </div>
  );
});

export default PixelFace;
