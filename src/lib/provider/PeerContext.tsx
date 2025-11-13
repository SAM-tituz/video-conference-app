"use client";
import mediaSoupClient from "@/app/mediaSoup/mediaSoup";
import { createContext, useContext } from "react";

type MediaSoupClientInstance = ReturnType<typeof mediaSoupClient>;
export type PeerContextType = {
  client: MediaSoupClientInstance | null;
  currentRoomName: string;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isKicked: boolean;

  // Derived state for convenience
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;

  // Connection/Media functions
  initialize: (roomName: string, participantId: string, userName: string) => void;
  cleanup: () => void;
  toggleVideo: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
};

export const PeerContext = createContext<PeerContextType | undefined>(undefined);

export const usePeer = () => {
  const context = useContext(PeerContext);
  if (!context) {
    throw new Error("usePeer must be used within a MediaSoupProvider");
  }
  return context;
};