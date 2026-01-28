import { memo } from 'react';
import './PixelFace.css';

/**
 * PixelFace - A cute, minimal pixel art face inspired by the reference images
 * 
 * States:
 * - idle: Square eyes only, gentle breathing animation
 * - talking: Square eyes + animated mouth (opens/closes)
 * - thinking: Horizontal line eyes (squinting), eyes shift side to side
 */
const PixelFace = memo(function PixelFace({ animationState = 'idle' }) {
  return (
    <div className={`pixel-face ${animationState}`}>
      <div className="face-screen">
        {/* Eyes container */}
        <div className="eyes">
          <div className={`eye left ${animationState}`}>
            <div className="pupil" />
          </div>
          <div className={`eye right ${animationState}`}>
            <div className="pupil" />
          </div>
        </div>
        
        {/* Mouth - only visible when talking */}
        <div className={`mouth ${animationState}`} />
        
        {/* Blush marks for extra cuteness */}
        <div className="blush left" />
        <div className="blush right" />
      </div>
      
      {/* Monitor frame elements */}
      <div className="monitor-chin">
        <div className="monitor-logo" />
      </div>
      <div className="monitor-stand" />
      <div className="monitor-base" />
    </div>
  );
});

export default PixelFace;

