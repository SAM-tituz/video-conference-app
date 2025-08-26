// components/VideoCall.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import mediaSoupClient from "../mediaSoup/mediaSoup";
type MediaSoupClientInstance = ReturnType<typeof mediaSoupClient>;
export default function VideoCall() {
  const params = useParams();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<MediaSoupClientInstance | null>(null);
  const remoteVideosRef = useRef<{ [id: string]: HTMLVideoElement }>({});
  const [remoteStreams, setRemoteStreams] = useState<
    { id: string; stream: MediaStream; kind: "audio" | "video" }[]
  >([]);
  const roomName = params.roomName as string;
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // MODIFIED: toggleVideo is now async and uses the client controls
  const toggleVideo = async () => {
    if (!clientRef.current) return;

    if (isVideoOn) {
      // --- Turn Video OFF ---
      clientRef.current.stopVideoProducer();

      // Update UI by removing the video track from the local stream
      const stream = localVideoRef.current?.srcObject as MediaStream;
      if (stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          stream.removeTrack(videoTrack);
        }
      }
    } else {
      // --- Turn Video ON ---
      const newTrack = await clientRef.current.resumeVideoProducer();

      // Update UI by adding the new video track to the local stream
      const stream = localVideoRef.current?.srcObject as MediaStream;
      if (stream && newTrack) {
        stream.addTrack(newTrack);
      }
    }
    setIsVideoOn(!isVideoOn);
  };
  const toggleMute = () => {
    const stream = localVideoRef.current?.srcObject as MediaStream;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const handleSetRemoteVideo = (id: string, stream: MediaStream) => {
    const video = remoteVideosRef.current[id];
    if (video) video.srcObject = stream;
  };

  useEffect(() => {
    const handleLocalStream = (stream: MediaStream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    };
    const handleRemoveRemoteVideo = (id: string) => {
      setRemoteStreams((prev) => prev.filter((stream) => stream.id !== id));
      delete remoteVideosRef.current[id];
    };

    const handleRemoteStream = (
      id: string,
      stream: MediaStream,
      kind: "audio" | "video"
    ) => {
      setRemoteStreams((prev) => [...prev, { id, stream, kind }]);
    };

    // const { cleanup } = mediaSoupClient(roomName, {
    //   onLocalStream: handleLocalStream,
    //   // onRemoteStream: (id: string, stream: MediaStream) => {
    //   //   setRemoteStreams(prev => [...prev, { id, stream }]);
    //   //   // Use timeout to ensure DOM update
    //   //   setTimeout(() => handleSetRemoteVideo(id, stream), 0);
    //   // },
    //   onRemoteStream: handleRemoteStream,
    //   onRemoteStreamRemoved: handleRemoveRemoteVideo,
    // });

    clientRef.current = mediaSoupClient(roomName, {
      onLocalStream: handleLocalStream,
      onRemoteStream: handleRemoteStream,
      onRemoteStreamRemoved: handleRemoveRemoteVideo,
    });

  return () => {
      clientRef.current?.cleanup();
      setRemoteStreams([]);
    };
  }, [roomName]);

  return (
    <div className="min-h-screen p-4 flex flex-wrap gap-4">
      <div className="relative w-60 h-48">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          className="w-full h-full bg-black rounded-lg shadow-lg"
        />
        <div className="absolute bottom-2 left-2 flex gap-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full ${
              isMuted ? "bg-red-500" : "bg-gray-800/70"
            } hover:bg-gray-700/90`}
          >
            {isMuted ? (
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            )}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-2 rounded-full ${
              !isVideoOn ? "bg-red-500" : "bg-gray-800/70"
            } hover:bg-gray-700/90`}
          >
            {isVideoOn ? (
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Remote videos */}
      {remoteStreams.map(({ id, stream, kind }) => {
        if (kind === "video") {
          return (
            <video
              key={id}
              ref={(videoEl) => {
                if (videoEl) videoEl.srcObject = stream;
              }}
              autoPlay
              className="w-60 h-48 object-cover bg-black rounded-lg shadow-lg"
            />
          );
        } else {
          return (
            <audio
              key={id}
              ref={(audioEl) => {
                if (audioEl) audioEl.srcObject = stream;
              }}
              autoPlay
            />
          );
        }
      })}
      {/* <div id="videoContainer"></div> */}
    </div>
  );
}
