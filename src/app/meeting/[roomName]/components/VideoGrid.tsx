// components/VideoGrid.tsx
'use client';

import React from 'react';

// Define the shape of a participant
interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  isLocal?: boolean;
  isVideoEnabled?: boolean;
}

// A single video tile for a participant
const ParticipantTile = ({ participant }: { participant: Participant }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div className="relative aspect-video bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
      {participant.isVideoEnabled && participant.stream ? (
        <video ref={videoRef} autoPlay playsInline muted={participant.isLocal} className="w-full h-full object-cover" />
      ) : (
        <div className="w-24 h-24 bg-indigo-500 rounded-full flex items-center justify-center text-white text-4xl font-bold">
          {participant.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="absolute bottom-0 left-0 bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded-tr-lg">
        {participant.name} {participant.isLocal && '(You)'}
      </div>
    </div>
  );
};


// The main grid component
export const VideoGrid = ({ participants }: { participants: Participant[] }) => {
  return (
    <div className="flex-1 p-4 overflow-auto">
      <div 
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))` }}
      >
        {participants.map((p) => (
          <ParticipantTile key={p.id} participant={p} />
        ))}
      </div>
    </div>
  );
};