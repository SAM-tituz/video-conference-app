"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mediaSoupClient from "../../app/mediaSoup/mediaSoup";
import { Socket } from "socket.io-client";

type MediaSoupClientInstance = ReturnType<typeof mediaSoupClient>;
import { PeerContext, PeerContextType } from "./PeerContext";
import {
  ParticipantContext,
  ParticipantContextType,
  Participant,
} from "./ParticipantContext";
import { ChatContext, ChatContextType, Message } from "./ChatContext";
import {
  BreakoutRoomContext,
  BreakoutRoomContextType,
} from "./BreakoutRoomContext";

export const MediaSoupProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const clientRef = useRef<MediaSoupClientInstance | null>(null);

  // === STATE ===
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // ✅ NEW: Ref to track stream without triggering re-renders in callbacks
  const localStreamRef = useRef<MediaStream | null>(null);

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const [isKicked, setIsKicked] = useState(false);
  const [currentRoomName, setCurrentRoomName] = useState<string>("");

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentChatTarget, setCurrentChatTarget] =
    useState<Participant | null>(null);
  const [publicMessages, setPublicMessages] = useState<Message[]>([]);
  const [privateMessages, setPrivateMessages] = useState<
    Map<string, Message[]>
  >(new Map());
  const [unreadMessages, setUnreadMessages] = useState(
    new Map<string, boolean>()
  );

  // Participant State
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [mainRoomParticipants, setMainRoomParticipants] = useState<
    Participant[]
  >([]);
  const [isOrganizer, setIsOrganizer] = useState(false);

  // Breakout State
  const [breakoutRooms, setBreakoutRooms] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Map<string, string>>(
    new Map()
  );

  const isMovingRef = useRef(false);
  const localTracksStore = useRef(new Set<MediaStreamTrack>());
  const socketRef = useRef<Socket | null>(null);
  const localUserIdRef = useRef<string | null>(null);
  const localUserNameRef = useRef<string | null>(null);

  // ✅ Sync Ref with State
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // === CALLBACKS ===

  const handleForceMute = useCallback(async (): Promise<void> => {
    console.log("Context: Handling force mute");
    try {
      setLocalStream((currentStream) => {
        if (!currentStream) return null;
        const audioTrack = currentStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.stop();
          localTracksStore.current.delete(audioTrack);
        }
        // Create new stream to trigger state update
        return new MediaStream(currentStream.getVideoTracks());
      });
    } catch (error) {
      console.error("Failed to handle force mute:", error);
    }
  }, []);

  const handleForceStopVideo = useCallback(async (): Promise<void> => {
    console.log("Context: Handling force stop video");
    try {
      setLocalStream((currentStream) => {
        if (!currentStream) return null;
        const videoTrack = currentStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          localTracksStore.current.delete(videoTrack);
        }
        return new MediaStream(currentStream.getAudioTracks());
      });
    } catch (error) {
      console.error("Failed to handle force stop video:", error);
    }
  }, []);

  const initialize = useCallback(
    (roomName: string, participantId: string, userName: string) => {
      // Cleanup previous instance if exists
      if (clientRef.current) {
        clientRef.current.cleanup();
        clientRef.current = null;
      }

      localUserIdRef.current = participantId;
      localUserNameRef.current = userName;
      setCurrentRoomName(roomName);

      const client = mediaSoupClient(roomName, participantId, userName, {
        onLocalStream: (stream) => {
          setLocalStream(stream); // This triggers the loop in the old code
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
            setIsOrganizer(!!localUser.isOrganizer);
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

          // ✅ FIXED: Use ref here instead of state dependency
          clientRef.current?.reinitialize(
            rtpCapabilities,
            localStreamRef.current || new MediaStream()
          );
        },
        onBreakoutState: (data) => {
          setBreakoutRooms(data.breakoutRoomNames);
          setAssignments(new Map(data.assignments));

          const localId = clientRef.current?.socket.id;
          if (data.mainRoomParticipants) {
            const localUser = data.mainRoomParticipants.find(
              (p) => p.id === localId
            );
            if (localUser) {
              setIsOrganizer(!!localUser.isOrganizer);
            }
            setMainRoomParticipants(
              data.mainRoomParticipants.map((p) => ({
                ...p,
                isLocal: p.id === localId,
              }))
            );
          }
        },
        onForceMute: handleForceMute,
        onForceStopVideo: handleForceStopVideo,
        onKicked: () => {
          setIsKicked(true);
        },
        onNewPublicMessage: (message: Message) => {
          setPublicMessages((prev) => [...prev, message]);
          if (message.senderId !== localUserIdRef.current) {
            setIsChatOpen((currentIsOpen) => {
              setCurrentChatTarget((currentTarget) => {
                if (!currentIsOpen || currentTarget !== null) {
                  setUnreadMessages((prev) =>
                    new Map(prev).set("public", true)
                  );
                }
                return currentTarget;
              });
              return currentIsOpen;
            });
          }
        },
        onNewPrivateMessage: (message: Message, otherUserId: string) => {
          setPrivateMessages((prevMap) => {
            const newMap = new Map(prevMap);
            const oldMessages = newMap.get(otherUserId) || [];
            newMap.set(otherUserId, [...oldMessages, message]);
            return newMap;
          });
          if (message.senderId !== localUserIdRef.current) {
            setIsChatOpen((currentIsOpen) => {
              setCurrentChatTarget((currentTarget) => {
                if (!currentIsOpen || currentTarget?.userId !== otherUserId) {
                  setUnreadMessages((prev) =>
                    new Map(prev).set(otherUserId, true)
                  );
                }
                return currentTarget;
              });
              return currentIsOpen;
            });
          }
        },
      });

      clientRef.current = client;
      socketRef.current = client.socket;
    },
    // ✅ FIXED: Removed localStream from dependency array
    [handleForceMute, handleForceStopVideo]
  );

  const cleanup = useCallback(() => {
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
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // ... (Toggle functions use state, which is fine because they don't trigger re-initialization)
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
        }
      }
    } catch (error) {
      console.error("Failed to toggle video:", error);
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
    }
  }, [localStream]);

  const sendPublicMessage = useCallback((text: string) => {
    clientRef.current?.sendPublicMessage(text);
  }, []);

  const sendPrivateMessage = useCallback(
    (text: string, targetUserId: string) => {
      clientRef.current?.sendPrivateMessage(text, targetUserId);
    },
    []
  );

  const clearUnreadMessages = useCallback((targetId: string) => {
    setUnreadMessages((prev) => {
      if (!prev.has(targetId)) return prev;
      const newMap = new Map(prev);
      newMap.delete(targetId);
      return newMap;
    });
  }, []);

  const peerValue: PeerContextType = useMemo(
    () => ({
      client: clientRef.current,
      currentRoomName,
      localStream,
      remoteStreams,
      isKicked,
      isMuted:
        !localStream?.getAudioTracks().length ||
        !localStream?.getAudioTracks()[0]?.enabled,
      isVideoOn: !!localStream?.getVideoTracks().length,
      isScreenSharing: !!localStream
        ?.getVideoTracks()
        .find((t) => t.label.includes("screen")),
      initialize,
      cleanup,
      toggleVideo,
      toggleMute,
      toggleScreenShare,
    }),
    [
      localStream,
      remoteStreams,
      isKicked,
      currentRoomName,
      toggleVideo,
      toggleMute,
      toggleScreenShare,
      initialize,
      cleanup,
    ]
  );

  const participantValue: ParticipantContextType = useMemo(
    () => ({
      participants,
      isOrganizer,
      remoteMutePeer: (peerId) => clientRef.current?.remoteMutePeer(peerId),
      remoteStopVideoPeer: (peerId) =>
        clientRef.current?.remoteStopVideoPeer(peerId),
      kickPeer: (peerId) => clientRef.current?.kickPeer(peerId),
      endMeeting: () => clientRef.current?.endMeeting(),
      muteAllPeers: () => clientRef.current?.muteAllPeers(),
      transferRole: (userId) => clientRef.current?.transferRole(userId),
    }),
    [participants, isOrganizer]
  );

  const chatValue: ChatContextType = useMemo(
    () => ({
      isChatOpen,
      setIsChatOpen,
      currentChatTarget,
      setCurrentChatTarget,
      publicMessages,
      privateMessages,
      sendPublicMessage,
      sendPrivateMessage,
      unreadMessages,
      clearUnreadMessages,
    }),
    [
      isChatOpen,
      setIsChatOpen,
      currentChatTarget,
      setCurrentChatTarget,
      publicMessages,
      privateMessages,
      sendPublicMessage,
      sendPrivateMessage,
      unreadMessages,
      clearUnreadMessages,
    ]
  );

  const breakoutValue: BreakoutRoomContextType = useMemo(
    () => ({
      breakoutRooms,
      assignments,
      createBreakoutRooms: (numRooms) =>
        clientRef.current?.createBreakoutRooms(numRooms),
      assignPeerToRoom: (peerId, roomName) =>
        clientRef.current?.assignPeerToRoom(peerId, roomName),
      startBreakouts: () => clientRef.current?.startBreakouts(),
      endBreakouts: () => clientRef.current?.endBreakouts(),
      exitBreakoutRoom: () => clientRef.current?.exitBreakoutRoom(),
      mainRoomParticipants: mainRoomParticipants,
    }),
    [breakoutRooms, assignments, mainRoomParticipants]
  );

  return (
    <PeerContext.Provider value={peerValue}>
      <ParticipantContext.Provider value={participantValue}>
        <ChatContext.Provider value={chatValue}>
          <BreakoutRoomContext.Provider value={breakoutValue}>
            {children}
          </BreakoutRoomContext.Provider>
        </ChatContext.Provider>
      </ParticipantContext.Provider>
    </PeerContext.Provider>
  );
};
