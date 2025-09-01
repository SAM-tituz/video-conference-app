// components/VideoCall.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import mediaSoupClient from "../mediaSoup/mediaSoup";
import { ControlBar } from "../meeting/[roomName]/components/ControlBar";

type MediaSoupClientInstance = ReturnType<typeof mediaSoupClient>;

export default function VideoCall() {
  const params = useParams();
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<MediaSoupClientInstance | null>(null);
  const initialized = useRef(false);

  const [remoteStreams, setRemoteStreams] = useState<{ id: string; stream: MediaStream; kind: 'audio' | 'video' }[]>([]);
  const roomName = params.roomName as string;

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenShareStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const onLocalStream = (stream: MediaStream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    };
    
    // Logic to handle and combine remote streams
    const onRemoteStream = (id: string, stream: MediaStream, kind: 'audio' | 'video') => {
      setRemoteStreams(prev => {
        const existing = prev.find(s => s.id === id && s.kind === kind);
        if (existing) return prev; // Avoid duplicates

        // Simple add for now, can be improved to merge streams later if needed
        return [...prev, { id, stream, kind }];
      });
    };
    
    const onRemoteStreamRemoved = (id: string) => {
        setRemoteStreams(prev => prev.filter(s => s.id !== id));
    };

    clientRef.current = mediaSoupClient(roomName, {
      onLocalStream,
      onRemoteStream,
      onRemoteStreamRemoved,
     
    });

    return () => {
      clientRef.current?.cleanup();
    };
  }, [roomName, router]);

  const handleToggleVideo = useCallback(async () => {
    if (!clientRef.current) return;
    if (isVideoOn) {
      await clientRef.current.stopVideoProducer();
    } else {
      const newTrack = await clientRef.current.resumeVideoProducer();
      if (newTrack && localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getVideoTracks().forEach(t => stream.removeTrack(t));
        stream.addTrack(newTrack);
      }
    }
    setIsVideoOn(prev => !prev);
  }, [isVideoOn]);
  
  // ✅ FIXED: Mute toggle now disconnects/reconnects the audio producer
  const handleToggleMute = useCallback(async () => {
    if (!clientRef.current) return;
    if (isMuted) {
      const newTrack = await clientRef.current.resumeAudioProducer();
       if (newTrack && localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.addTrack(newTrack);
      }
    } else {
      clientRef.current.stopAudioProducer();
    }
    setIsMuted(prev => !prev);
  }, [isMuted]);
  
  // ✅ ADDED: Screen share toggle logic
  const handleScreenShare = useCallback(async () => {
      if (!clientRef.current) return;
      if (isScreenSharing) {
          clientRef.current.stopScreenShare();
          // Optional: You might want to switch back to the main camera
          // await handleToggleVideo(); // if it was off
          setIsScreenSharing(false);
      } else {
          const stream = await clientRef.current.startScreenShare();
          if (stream) {
              screenShareStreamRef.current = stream;
              setIsScreenSharing(true);
              // Optional: You might want to stop the main camera video
              // if (isVideoOn) { await handleToggleVideo(); }
          }
      }
  }, [isScreenSharing, isVideoOn, handleToggleVideo]);

  const handleLeave = () => {
    clientRef.current?.cleanup();
    router.push('/');
  };

  return (
    <div className="bg-slate-900 min-h-screen flex flex-col">
        {/* Your original video layout */}
        <div className="flex-1 p-4 flex flex-wrap gap-4 justify-center items-center">
            {/* Local Video */}
            <div className="relative w-96 h-72">
                <video ref={localVideoRef} autoPlay muted className="w-full h-full object-cover bg-black rounded-lg" />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">You</div>
            </div>

            {/* Remote Videos */}
            {remoteStreams.filter(s => s.kind === 'video').map(({ id, stream }) => (
                <div key={id} className="relative w-96 h-72">
                    <video
                        ref={(videoEl) => { if (videoEl) videoEl.srcObject = stream; }}
                        autoPlay
                        className="w-full h-full object-cover bg-black rounded-lg"
                    />
                    <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">Peer-{id.slice(0, 4)}</div>
                </div>
            ))}
             {/* Remote Audio */}
            {remoteStreams.filter(s => s.kind === 'audio').map(({ id, stream }) => (
                <audio key={id} ref={(audioEl) => { if (audioEl) audioEl.srcObject = stream; }} autoPlay />
            ))}
        </div>

        {/* The New Control Bar */}
        <ControlBar
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            onToggleMute={handleToggleMute}
            onToggleVideo={handleToggleVideo}
            onScreenShare={handleScreenShare}
            onLeave={handleLeave}
        />
    </div>
  );
}