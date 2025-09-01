// components/ControlBar.tsx
'use client';

import React from 'react';

interface ControlBarProps {
  isMuted: boolean;
  isVideoOn: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onScreenShare: () => void;
  onLeave: () => void;
}

// Reusable button component for the control bar
const ControlButton = ({ onClick, children, className = '' }: { onClick: () => void; children: React.ReactNode; className?: string }) => (
  <button onClick={onClick} className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors duration-200 ${className}`}>
    {children}
  </button>
);

export const ControlBar = ({ isMuted, isVideoOn, onToggleMute, onToggleVideo, onScreenShare, onLeave }: ControlBarProps) => {
  return (
    <div className="bg-slate-900 bg-opacity-70 p-4 flex justify-center items-center gap-4">
      <ControlButton onClick={onToggleMute} className={isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'}>
        {isMuted ? <MicOffIcon /> : <MicOnIcon />}
      </ControlButton>
      <ControlButton onClick={onToggleVideo} className={!isVideoOn ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'}>
        {isVideoOn ? <VideoOnIcon /> : <VideoOffIcon />}
      </ControlButton>
      <ControlButton onClick={onScreenShare} className="bg-slate-700 hover:bg-slate-600">
        <ScreenShareIcon />
      </ControlButton>
      <button onClick={onLeave} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-full transition-colors duration-200">
        Leave
      </button>
    </div>
  );
};

// SVG Icons (you can place these in their own files if you prefer)
const MicOnIcon = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m0 0H9m4 0h2M5 3a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V3z" /></svg>;
const MicOffIcon = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.083A7.002 7.002 0 004 11v3m15-3a7 7 0 00-7-5.917M15 11a3 3 0 11-6 0m0 0a3 3 0 00-3 3v3m0 0H5m4 0v3m0-3h2m4-3a7.002 7.002 0 01-7 5.917m-7-5.917a7.002 7.002 0 017 5.917m-7-5.917L4 4m16 16l-4-4" /></svg>;
const VideoOnIcon = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const VideoOffIcon = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>;
const ScreenShareIcon = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;