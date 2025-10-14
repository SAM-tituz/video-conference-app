"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/provider/authprovider";
import { useMediaSoup } from "../mediaSoup/MediaSoupContext";
import { ControlBar } from "../meeting/[roomName]/components/ControlBar";

const VideoTile = ({
  stream,
  name,
  onClick,
  isMuted = false,
}: {
  stream: MediaStream;
  name: string;
  onClick: () => void;
  isMuted?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      console.log(
        "Setting video srcObject:",
        stream,
        "Tracks:",
        stream.getTracks()
      );
      videoRef.current.srcObject = stream;
      videoRef.current
        .play()
        .catch((e) => console.error("Video play failed:", e));
    }
  }, [stream]);

  if (!stream || stream.getVideoTracks().length === 0) {
    console.log("No video tracks in stream:", stream?.getTracks());
    return null;
  }

  return (
    <div
      className="relative aspect-video rounded-lg overflow-hidden bg-gray-900 cursor-pointer group"
      onClick={onClick}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 bg-black bg-opacity-60 text-white px-2 py-1 text-sm rounded-tr-lg transition-opacity opacity-100 group-hover:opacity-100 md:opacity-0">
        {name}
      </div>
    </div>
  );
};

export default function VideoCall() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const roomName = params.roomName as string;
  const participantId = user?.id;
  const {
    client,
    currentRoomName,
    localStream,
    setLocalStream,
    remoteStreams,
    participants,
    breakoutRooms,
    assignments,
    isOrganizer,
    initialize,
    toggleVideo, // From context
    toggleMute, // From context
    toggleScreenShare,
  } = useMediaSoup();
  const [presenterId, setPresenterId] = useState<string>("local");
 const presenterVideoRef = useRef<HTMLVideoElement>(null);
  const { isVideoOn, isMuted, isScreenSharing } = useMemo(
    () => ({
      isVideoOn: !!localStream?.getVideoTracks().length,
      isMuted:
        !localStream?.getAudioTracks().length ||
        !localStream?.getAudioTracks()[0]?.enabled,
      isScreenSharing: !!localStream
        ?.getVideoTracks()
        .find((t) => t.label.includes("screen")), // Adjust check as needed
    }),
    [localStream]
  );
useEffect(() => {
    if (!roomName || !user || !participantId) return;
    initialize(roomName, participantId);
  }, [roomName, user, participantId, initialize]);

  useEffect(() => {
    if (currentRoomName && currentRoomName !== roomName) {
      router.replace(`/meeting/${currentRoomName}`);
    }
  }, [currentRoomName, roomName, router]);

 
  const handleLeave = () => {
    client?.cleanup();
    router.push("/");
  };

  const handleCreateRooms = (numRooms: number) => {
    client?.createBreakoutRooms(numRooms);
  };

  const handleAssignPeer = (peerId: string, roomName: string) => {
    client?.assignPeerToRoom(peerId, roomName);
  };

  const handleStartBreakouts = () => client?.startBreakouts();
  const handleEndBreakouts = () => client?.endBreakouts();
  const handleExitBreakout = () => client?.exitBreakoutRoom();

  const allParticipants = useMemo(() => {
    const participantsMap = new Map<
      string,
      { stream: MediaStream; name: string }
    >();
    if (localStream) {
      const localUser = participants.find((p) => p.isLocal);
      participantsMap.set("local", {
        stream: localStream,
        name: localUser?.name || "You",
      });
    }
    remoteStreams.forEach((stream, id) =>
      participantsMap.set(id, {
        stream,
        name:
          participants.find((p) => p.id === id)?.name ||
          `Peer-${id.slice(0, 4)}`,
      })
    );
    return participantsMap;
  }, [localStream, remoteStreams, participants]);

  const presenterStream = allParticipants.get(presenterId);
  const sidebarParticipants = Array.from(allParticipants.entries()).filter(
    ([id]) => id !== presenterId
  );
useEffect(() => {
    const video = presenterVideoRef.current;
    if (!video || !presenterStream) return;

    video.pause();
    video.srcObject = null;

    console.log("Setting presenter srcObject:", presenterStream.stream);
    video.srcObject = presenterStream.stream;

    const playPromise = video.play();
    playPromise.catch((e) => console.error("Presenter video play failed:", e));

    return () => {
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [presenterStream]);
  return (
    <div className="bg-gray-800 text-white flex flex-col h-screen font-sans">
      <header className="px-4 py-2 text-sm flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z"
            clipRule="evenodd"
          />
        </svg>
        <p>
          {participants.find((p) => p.id === presenterId)?.name || "You"} is
          presenting
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 p-4 flex items-center justify-center">
          <div className="w-full h-full bg-black rounded-lg relative aspect-video">
            {presenterStream ? (
              <video
                key={presenterId}
                ref={(el) => {
                  if (el && presenterStream) {
                    console.log(
                      "Setting presenter srcObject:",
                      presenterStream.stream
                    );
                    el.srcObject = presenterStream.stream;
                    el.play().catch((e) =>
                      console.error("Presenter video play failed:", e)
                    );
                  }
                }}
                autoPlay
                playsInline
                muted={presenterId === "local"}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <p>Click a Video to view Big</p>
              </div>
            )}
          </div>
        </main>

        <aside className="w-64 bg-gray-900 p-2 overflow-y-auto">
          <div className="grid grid-cols-1 gap-2">
            {sidebarParticipants.map(([id, data]) => (
              <VideoTile
                key={id}
                stream={data.stream}
                name={id === "local" ? "You" : data.name}
                onClick={() => setPresenterId(id)}
                isMuted={id === "local"}
              />
            ))}
          </div>
        </aside>
      </div>

      {Array.from(remoteStreams.entries())
        .filter(([id]) => id !== presenterId)
        .map(
          ([id, stream]) =>
            stream.getAudioTracks().length > 0 && (
              <audio
                key={`${id}-audio`}
                ref={(el) => {
                  if (el) {
                    el.srcObject = stream;
                    el.play().catch((e) =>
                      console.error("Audio play failed:", e)
                    );
                  }
                }}
                autoPlay
              />
            )
        )}

      <ControlBar
        isMuted={isMuted}
        isVideoOn={isVideoOn}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        isTogglingVideo={false}
        isTogglingMute={false}
        onScreenShare={toggleScreenShare}
        onLeave={handleLeave}
        participants={participants}
        mainRoomParticipants={participants}
        isOrganizer={isOrganizer}
        breakoutRooms={breakoutRooms}
        assignments={assignments}
        onCreateRooms={handleCreateRooms}
        onAssignPeer={handleAssignPeer}
        onStartBreakouts={handleStartBreakouts}
        onEndBreakouts={handleEndBreakouts}
        onExitBreakout={handleExitBreakout}
        roomName={roomName}
      />
    </div>
  );
}
