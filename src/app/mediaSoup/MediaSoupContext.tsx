"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  SetStateAction,
  Dispatch,
  useCallback,
} from "react";
import mediaSoupClient from "./mediaSoup"; // Your existing mediaSoupClient
import { Socket } from "socket.io-client";

type MediaSoupClientInstance = ReturnType<typeof mediaSoupClient>;

type MediaSoupContextType = {
  client: MediaSoupClientInstance | null;
  currentRoomName: string;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  setLocalStream: Dispatch<SetStateAction<MediaStream | null>>;
  participants: {
    id: string;
    name: string;
    isLocal?: boolean;
    isOrganizer?: boolean;
    hasAudio?: boolean;
    hasVideo?: boolean;
  }[];
  breakoutRooms: string[];
  assignments: Map<string, string>;
  isOrganizer: boolean;
  setCurrentRoomName: (roomName: string) => void;
  initialize: (roomName: string, participantId: string) => void;
  cleanup: () => void;
  toggleVideo: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  remoteMutePeer: (peerId: string) => void;
  remoteStopVideoPeer: (peerId: string) => void;
  kickPeer: (peerId: string) => void;
  isKicked: boolean;
};

const MediaSoupContext = createContext<MediaSoupContextType | undefined>(
  undefined
);

export const MediaSoupProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isKicked, setIsKicked] = useState(false);
  const clientRef = useRef<MediaSoupClientInstance | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [currentRoomName, setCurrentRoomName] = useState<string>("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const [participants, setParticipants] = useState<
    { id: string; name: string; isLocal?: boolean; isOrganizer?: boolean }[]
  >([]);
  const [breakoutRooms, setBreakoutRooms] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Map<string, string>>(
    new Map()
  );
  const [isOrganizer, setIsOrganizer] = useState(false);
  const isMovingRef = useRef(false);
  const localTracksStore = useRef(new Set<MediaStreamTrack>());
  // ✅ STEP 1: DEFINE THE HANDLERS FIRST
  const handleForceMute = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client) return;

    console.log("Context: Handling force mute");
    try {
      client.stopAudioProducer(); // Use functional update to avoid stale localStream

      setLocalStream((currentStream) => {
        if (!currentStream) return null;

        const audioTrack = currentStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.stop();
          localTracksStore.current.delete(audioTrack);
        }
        const videoTracks = currentStream.getVideoTracks();
        return new MediaStream(videoTracks);
      });
    } catch (error) {
      console.error("Failed to handle force mute:", error);
    }
  }, []); // Empty dependency array makes this function stable

  const handleForceStopVideo = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client) return;

    console.log("Context: Handling force stop video");
    try {
      client.stopVideoProducer(); // Use functional update to avoid stale localStream

      setLocalStream((currentStream) => {
        if (!currentStream) return null;

        const videoTrack = currentStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          localTracksStore.current.delete(videoTrack);
        }
        const audioTracks = currentStream.getAudioTracks();
        return new MediaStream(audioTracks);
      });
    } catch (error) {
      console.error("Failed to handle force stop video:", error);
    }
  }, []);
  const initialize = (roomName: string, participantId: string) => {
    if (clientRef.current) return;
    setCurrentRoomName(roomName);

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
            const oldTracks = existingStream
              .getTracks()
              .filter((t) => t.kind !== kind);
            newStreams.set(peerId, new MediaStream([...oldTracks, newTrack]));
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
            if (existingStream.getTracks().length === 0) {
              newStreams.delete(peerId);
            } else {
              newStreams.set(
                peerId,
                new MediaStream(existingStream.getTracks())
              );
            }
          }
          return newStreams;
        });
      },
      onParticipantList: (participantList) => {
        const localId = client.socket.id;
        const localUser = participantList.find((p) => p.id === localId);
        if (localUser) {
          setIsOrganizer(localUser.isOrganizer);
        }
        setParticipants(
          participantList.map((p) => ({
            ...p,
            isLocal: p.id === localId,
          }))
        );
      },
      onMoveConfirmed: ({ newRoomName, rtpCapabilities }) => {
        isMovingRef.current = true;
        setCurrentRoomName(newRoomName);
        setRemoteStreams(new Map());
        clientRef.current?.reinitialize(
          rtpCapabilities,
          localStream || new MediaStream()
        );
      },
      onBreakoutState: (data) => {
        setBreakoutRooms(data.breakoutRoomNames);
        setAssignments(new Map(data.assignments));
      },
      onForceMute: handleForceMute,
      onForceStopVideo: handleForceStopVideo,
      onKicked: () => {
        setIsKicked(true); // Set the state flag
      },
    });

    clientRef.current = client;
    socketRef.current = client.socket;
  };

  const cleanup = () => {
    // if (isMovingRef.current) return;
    localTracksStore.current.forEach((track) => {
      if (track.readyState === "live") {
        track.stop();
      }
    });
    localTracksStore.current.clear();
    clientRef.current?.cleanup();
    clientRef.current = null;
    socketRef.current = null;
    setLocalStream(null);
    setRemoteStreams(new Map());
    setParticipants([]);
    setBreakoutRooms([]);
    setAssignments(new Map());
    setIsOrganizer(false);
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const toggleVideo = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client || !localStream) return;

    try {
      const isVideoOn = localStream.getVideoTracks().length > 0;
      if (isVideoOn) {
        client.stopVideoProducer();
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          localTracksStore.current.delete(videoTrack);
        }
        const audioTracks = localStream.getAudioTracks();
        setLocalStream(new MediaStream(audioTracks));
      } else {
        const newTrack = await client.resumeVideoProducer();
        if (newTrack) {
          localTracksStore.current.add(newTrack);
          const currentTracks = localStream.getTracks();
          const newStream = new MediaStream([...currentTracks, newTrack]);
          setLocalStream(newStream);
          console.log(
            "Resumed video track:",
            newTrack,
            "New stream tracks:",
            newStream.getTracks()
          );
        } else {
          throw new Error("Failed to resume video track");
        }
      }
    } catch (error) {
      console.error("Failed to toggle video:", error);
      alert(
        "Failed to toggle video: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }, [localStream]);

  const toggleMute = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client || !localStream) return;

    try {
      const isMuted =
        localStream.getAudioTracks().length === 0 ||
        !localStream.getAudioTracks()[0]?.enabled;
      if (isMuted) {
        const newTrack = await client.resumeAudioProducer();
        if (newTrack) {
          localTracksStore.current.add(newTrack);
          const currentTracks = localStream.getTracks();
          const newStream = new MediaStream([...currentTracks, newTrack]);
          setLocalStream(newStream);
        } else {
          throw new Error("Failed to resume audio track");
        }
      } else {
        client.stopAudioProducer();
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.stop();
          localTracksStore.current.delete(audioTrack);
        }
        const videoTracks = localStream.getVideoTracks();
        setLocalStream(new MediaStream(videoTracks));
      }
    } catch (error) {
      console.error("Failed to toggle mute:", error);
      alert(
        "Failed to toggle mute: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }, [localStream]);

  const toggleScreenShare = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    if (!client || !localStream) return;

    try {
      const isScreenSharing = !!localStream
        .getVideoTracks()
        .find((t) => t.label.includes("screen"));
      if (isScreenSharing) {
        client.stopScreenShare();
        const newCameraTrack = await client.resumeVideoProducer();
        if (newCameraTrack) {
          localTracksStore.current.add(newCameraTrack);
          const audioTracks = localStream.getAudioTracks();
          const newStream = new MediaStream([...audioTracks, newCameraTrack]);
          setLocalStream(newStream);
        }
      } else {
        const screenStream = await client.startScreenShare();
        if (screenStream) {
          const screenTrack = screenStream.getVideoTracks()[0];
          localTracksStore.current.add(screenTrack);
          const audioTracks = localStream.getAudioTracks();
          const newStream = new MediaStream([...audioTracks, screenTrack]);
          setLocalStream(newStream);
        }
      }
    } catch (error) {
      console.error("Failed to toggle screen share:", error);
      alert(
        "Failed to toggle screen share: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }, [localStream]);

  // ✅ Implement organizer action functions
  const remoteMutePeer = useCallback((peerId: string) => {
    clientRef.current?.remoteMutePeer(peerId);
  }, []);

  const remoteStopVideoPeer = useCallback((peerId: string) => {
    clientRef.current?.remoteStopVideoPeer(peerId);
  }, []);

  const kickPeer = useCallback((peerId: string) => {
    clientRef.current?.kickPeer(peerId);
  }, []);

  return (
    <MediaSoupContext.Provider
      value={{
        client: clientRef.current,
        currentRoomName,
        localStream,
        setLocalStream,
        remoteStreams,
        participants,
        breakoutRooms,
        assignments,
        isOrganizer,
        setCurrentRoomName,
        initialize,
        cleanup,
        toggleVideo,
        toggleMute,
        toggleScreenShare,
        remoteMutePeer,
        remoteStopVideoPeer,
        kickPeer,
        isKicked,
      }}
    >
      {children}
    </MediaSoupContext.Provider>
  );
};

export const useMediaSoup = () => {
  const context = useContext(MediaSoupContext);
  if (!context)
    throw new Error("useMediaSoup must be used within MediaSoupProvider");
  return context;
};
