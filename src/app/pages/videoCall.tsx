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

  const [remoteStreams, setRemoteStreams] = useState(new Map<string, MediaStream>());
  const roomName = params.roomName as string;

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenShareStreamRef = useRef<MediaStream | null>(null);

   useEffect(() => {
    if (!roomName) return;

    const client = mediaSoupClient(roomName, {
      onLocalStream: (stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      },
      // ✅ LOGIC FIX: Intelligently combine audio/video into one stream per peer.
      onRemoteStream: (id, stream, kind) => {
        setRemoteStreams(prev => {
          const newPeers = new Map(prev);
          const peerStream = newPeers.get(id);
          const track = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];

          if (!track) return newPeers;

          if (peerStream) {
            // If peer's stream already exists, add the new track.
            peerStream.addTrack(track);
          } else {
            // If it's a new peer, create a new MediaStream with the track.
            const newStream = new MediaStream([track]);
            newPeers.set(id, newStream);
          }
          return newPeers;
        });
      },
      onRemoteStreamRemoved: (id) => {
        setRemoteStreams(prev => {
          const newPeers = new Map(prev);
          newPeers.delete(id);
          return newPeers;
        });
      },
    });

    clientRef.current = client;

    return () => {
      client.cleanup();
      clientRef.current = null;
    };
  }, [roomName]);

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
            {[...remoteStreams.values()].filter(s => s.getVideoTracks().length > 0).map((stream, id) => (
                <div key={id} className="relative w-96 h-72">
                    <video
                        ref={(videoEl) => { if (videoEl) videoEl.srcObject = stream; }}
                        autoPlay
                        className="w-full h-full object-cover bg-black rounded-lg"
                    />
                    <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">Peer-{String(id).slice(0, 4)}</div>
                </div>
            ))}
             {/* Remote Audio */}
            {[...remoteStreams.entries()].filter(([, stream]) => stream.getAudioTracks().length > 0).map(([id, stream]) => (
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