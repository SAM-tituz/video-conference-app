"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/provider/authprovider";
import mediaSoupClient from "../mediaSoup/mediaSoup";
import { ControlBar } from "../meeting/[roomName]/components/ControlBar";
type MediaSoupClientInstance = ReturnType<typeof mediaSoupClient>;

interface MediaSoupClientOptions {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (peerId: string, stream: MediaStream, kind: string) => void;
  onRemoteTrackRemoved: (peerId: string, track: MediaStreamTrack) => void;
  onParticipantList: (participantList: { id: string; name: string }[]) => void;
}

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
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (stream.getVideoTracks().length === 0) {
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
  const clientRef = useRef<MediaSoupClientInstance | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState(
    new Map<string, MediaStream>()
  );
  const roomName = params.roomName as string;
  const [presenterId, setPresenterId] = useState<string>("local");
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<
    { id: string; name: string; isLocal?: boolean; isOrganizer?: boolean }[]
  >([]);
  const participantId = user?.id;

  // State for Breakout Rooms
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [breakoutRooms, setBreakoutRooms] = useState<string[]>([]);
  const [assignments, setAssignments] = useState(new Map<string, string>());


  // In the VideoCall component, add:
useEffect(() => {
  if (isOrganizer && clientRef.current) {
    clientRef.current.requestBreakoutState();
  }

}, [isOrganizer]);
  useEffect(() => {
    if (!roomName || !user || !participantId) return;

    const client = mediaSoupClient(roomName, participantId, {
      onLocalStream: (stream) => {
        setLocalStream(stream);
      },
      onRemoteStream: (peerId, stream, kind) => {
        setRemoteStreams((prev) => {
          const newStreams = new Map(prev);
          const existingStream = newStreams.get(peerId);
          const newTrack = stream.getTracks()[0];

          if (!newTrack) return newStreams;
          if (existingStream) {
            const allTracks = [...existingStream.getTracks(), newTrack];
            const updatedStream = new MediaStream(allTracks);
            newStreams.set(peerId, updatedStream);
          } else {
            newStreams.set(peerId, new MediaStream([newTrack]));
          }
          return newStreams;
        });
      },
      onRemoteTrackRemoved: (peerId, track) => {
        setRemoteStreams((prev) => {
          const newStreams = new Map(prev);
          const existingStream = newStreams.get(peerId);

          if (existingStream) {
            existingStream.removeTrack(track);
            const updatedStream = new MediaStream(existingStream.getTracks());
            newStreams.set(peerId, updatedStream);
            return newStreams;
          }
          return prev;
        });
      },
      onParticipantList: (participantList) => {
        const localId = clientRef.current?.socket.id;
        const localUser = participantList.find((p) => p.id === localId);
        if (localUser) {
          setIsOrganizer(localUser.isOrganizer); // Set status from server data
        }
        setParticipants(
          participantList.map((p) => ({ ...p, isLocal: p.id === localId }))
        );
      },
      onForceMove: (data) => {
        handleMoveToRoom(data.roomName);
      },
      onBreakoutRoomsList: (rooms) => {
        setBreakoutRooms(rooms);
      },
      onAssignmentsUpdated: (updatedAssignments) => {
        setAssignments(new Map(updatedAssignments));
      },
      onBreakoutsEnded: () => {
        setBreakoutRooms([]);
        setAssignments(new Map());
      },
    });

    clientRef.current = client;

    return () => {
      clientRef.current?.cleanup();
      clientRef.current = null;
    };
  }, [roomName, user]);

  const handleMoveToRoom = (newRoomName: string) => {
    if (!clientRef.current) return;
    setRemoteStreams(new Map());
    setParticipants([]);
    setPresenterId("local");
    setBreakoutRooms([]); // Clear breakout rooms when moving
    setIsOrganizer(false);
    clientRef.current.moveToRoom(newRoomName);
    router.push(`/meeting/${newRoomName}`);
  };

  const handleToggleVideo = useCallback(async () => {
    if (!clientRef.current || !localStream) return;
    if (isVideoOn) {
      await clientRef.current.stopVideoProducer();
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) localStream.removeTrack(videoTrack);
    } else {
      const newTrack = await clientRef.current.resumeVideoProducer();
      if (newTrack) {
        localStream.addTrack(newTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));
      }
    }
    setIsVideoOn((prev) => !prev);
  }, [isVideoOn, localStream]);

  const handleToggleMute = useCallback(async () => {
    if (!clientRef.current || !localStream) return;
    if (isMuted) {
      const newTrack = await clientRef.current.resumeAudioProducer();
      if (newTrack) {
        localStream.addTrack(newTrack);
        setLocalStream(new MediaStream(localStream.getTracks()));
      }
    } else {
      await clientRef.current.stopAudioProducer();
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        localStream.removeTrack(audioTrack);
      }
    }
    setIsMuted((prev) => !prev);
  }, [isMuted, localStream]);

  const handleScreenShare = useCallback(async () => {
    if (!clientRef.current || !localStream) return;
    if (isScreenSharing) {
      clientRef.current.stopScreenShare();
      await clientRef.current.resumeVideoProducer();
      setIsScreenSharing(false);
    } else {
      const screenStream = await clientRef.current.startScreenShare();
      if (screenStream) {
        const newStream = new MediaStream(localStream.getAudioTracks());
        newStream.addTrack(screenStream.getVideoTracks()[0]);
        setLocalStream(newStream);
        setIsScreenSharing(true);
      }
    }
  }, [isScreenSharing, localStream]);

  const handleLeave = () => {
    clientRef.current?.cleanup();
    router.push("/");
  };

  // ✅ Handlers for Breakout Room actions
  const handleCreateRooms = (numRooms: number) => {
    clientRef.current?.createBreakoutRooms(numRooms);
  };

  const handleAssignPeer = (peerId: string, roomName: string) => {
    clientRef.current?.assignPeerToRoom(peerId, roomName);
  };
  const handleStartBreakouts = () => clientRef.current?.startBreakouts();
  const handleEndBreakouts = () => clientRef.current?.endBreakouts();
  const handleExitBreakout = () => {
    clientRef.current?.exitBreakoutRoom();
  };

  const allParticipants = new Map<
    string,
    { stream: MediaStream; name: string }
  >();
  if (localStream) {
    const localUser = participants.find((p) => p.isLocal);
    allParticipants.set("local", {
      stream: localStream,
      name: localUser?.name || "You",
    });
  }
  remoteStreams.forEach((stream, id) =>
    allParticipants.set(id, {
      stream,
      name:
        participants.find((p) => p.id === id)?.name || `Peer-${id.slice(0, 4)}`,
    })
  );

  const presenterStream = allParticipants.get(presenterId);
  const sidebarParticipants = Array.from(allParticipants.entries()).filter(
    ([id]) => id !== presenterId
  );

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
          {participants.find((p) => p.id === presenterId)?.name} is presenting
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 p-4 flex items-center justify-center">
          <div className="w-full h-full bg-black rounded-lg relative aspect-video">
            {presenterStream ? (
              <video
                key={presenterId}
                ref={(el) => {
                  if (el && presenterStream)
                    el.srcObject = presenterStream.stream;
                }}
                autoPlay
                playsInline
                muted={presenterId === "local"}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <p>Click a Video to view Big </p>
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
                  if (el) el.srcObject = stream;
                }}
                autoPlay
              />
            )
        )}

      {/* ✅ Pass all required props to ControlBar */}
      <ControlBar
        isMuted={isMuted}
        isVideoOn={isVideoOn}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
        onScreenShare={handleScreenShare}
        onLeave={handleLeave}
        participants={participants}
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
