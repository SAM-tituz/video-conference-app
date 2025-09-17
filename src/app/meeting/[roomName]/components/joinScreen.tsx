// components/MeetingJoinScreen.tsx

"use client";
import { useAuth } from "@/lib/provider/authprovider";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

// Define the props type for the MediaButton component
interface MediaButtonProps {
  onClick: () => void;
  isEnabled: boolean;
  enabledIcon: React.ReactNode;
  disabledIcon: React.ReactNode;
}

// This is a simple reusable button component for the media controls
const MediaButton: React.FC<MediaButtonProps> = ({
  onClick,
  isEnabled,
  enabledIcon,
  disabledIcon,
}) => (
  <button
    onClick={onClick}
    className={`p-3 rounded-full transition-colors ${
      isEnabled
        ? "bg-gray-700 hover:bg-gray-600"
        : "bg-red-600 hover:bg-red-700"
    }`}
  >
    {isEnabled ? enabledIcon : disabledIcon}
  </button>
);

export default function MeetingJoinScreen({
  onJoinSuccess,
}: {
  onJoinSuccess: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [participantName, setParticipantName] = useState("");

  const roomName = params.roomName as string;

  // 1. Get user media for the preview when the component loads
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing media devices.", error);
        alert(
          "Could not access your camera or microphone. Please check permissions."
        );
      }
    };

    getMedia();

    // Cleanup: stop media tracks when the component unmounts
    return () => {
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, []); // The empty dependency array ensures this runs only once

  // 2. Functions to toggle audio and video
  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled((prev) => !prev);
    }
  };

  // 3. Handle joining the meeting
  const handleJoinMeeting = () => {
    // Stop the preview stream before navigating
    localStream?.getTracks().forEach((track) => track.stop());

    onJoinSuccess();
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center font-sans p-4">
      <main className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center w-full max-w-6xl">
        {/* Left Side: Video Preview */}
        <div className="w-full max-w-2xl aspect-video bg-black rounded-lg overflow-hidden relative shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 flex gap-4 items-center justify-center w-full text-white">
            <MediaButton
              onClick={toggleAudio}
              isEnabled={isAudioEnabled}
              enabledIcon={<Mic size={24} />}
              disabledIcon={<MicOff size={24} />}
            />
            <MediaButton
              onClick={toggleVideo}
              isEnabled={isVideoEnabled}
              enabledIcon={<Video size={24} />}
              disabledIcon={<VideoOff size={24} />}
            />
          </div>
        </div>

        {/* Right Side: Join Panel */}
        <div className="flex flex-col gap-4 items-center justify-center text-center w-full max-w-sm">
          <h1 className="text-3xl font-bold">Ready to join?</h1>
          <p className="text-gray-400"> your name: {user?.name}</p>

          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2 rounded-lg text-white bg-transparent hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleJoinMeeting}
              className="px-6 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Join now
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
