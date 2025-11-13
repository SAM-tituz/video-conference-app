// components/ControlBar.tsx
"use client";

import React, { useState } from "react";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { ChatPanel } from "./ChatPanel";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
} from "lucide-react";
import { BreakoutPanel } from "./BreakoutPanel";
import { usePeer } from "@/lib/provider/PeerContext";
import { useParticipant } from "@/lib/provider/ParticipantContext";
import { useBreakoutRoom } from "@/lib/provider/BreakoutRoomContext";

interface ControlBarProps {
  onLeave: () => void;
  roomName: string;
}

// Reusable circular button
export const ControlButton = ({
  onClick,
  children,
  className = "",
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors duration-200 ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);
// ////////////////////////////
export const ControlBar = ({ onLeave, roomName }: ControlBarProps) => {
  const { isMuted, isVideoOn, toggleMute, toggleVideo, toggleScreenShare } =
    usePeer();
  const { endMeeting, isOrganizer } = useParticipant();
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const { exitBreakoutRoom } = useBreakoutRoom();
  const isInBreakout = roomName.includes("-breakout-");

  const handleLeaveClick = () => {
    if (isOrganizer) {
      // Organizer: show the modal
      setShowLeaveModal(true);
    } else {
      // Regular peer: just leave
      onLeave();
    }
  };

  const handleEndMeeting = () => {
    if (endMeeting) {
      endMeeting(); // 1. Tell server to kick everyone
    }
    onLeave(); // 2. Clean up this client and leave
    setShowLeaveModal(false);
  };
  const handleJustLeave = () => {
    onLeave(); // Just clean up this client and leave
    setShowLeaveModal(false);
  };
  return (
    <div className="bg-gray-900 px-6 py-3 flex items-center justify-between">
      {/* Left Side: Meeting Title */}
      <span className="text-lg font-semibold w-1/4">Meeting</span>

      {/* Center Controls */}
      <div className="flex items-center justify-center gap-4 w-1/2">
        <ControlButton
          onClick={toggleMute}
          className={
            isMuted
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-700 hover:bg-gray-600"
          }
        >
          {isMuted ? <MicOff /> : <Mic />}
        </ControlButton>
        <ControlButton
          onClick={toggleVideo}
          className={
            !isVideoOn
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-700 hover:bg-gray-600"
          }
        >
          {isVideoOn ? <Video /> : <VideoOff />}
        </ControlButton>

        {isOrganizer && <BreakoutPanel roomName={roomName} />}
        <ControlButton
          onClick={toggleScreenShare}
          className="bg-gray-700 hover:bg-gray-600"
        >
          <ScreenShare />
        </ControlButton>
        {isInBreakout && (
          <ControlButton
            onClick={exitBreakoutRoom}
            className="bg-blue-600 hover:bg-blue-700 !w-auto px-4"
          >
            Return to Main Room
          </ControlButton>
        )}
        <ControlButton
          onClick={handleLeaveClick}
          className="bg-red-600 hover:bg-red-700 !w-16"
        >
          <PhoneOff />
        </ControlButton>
      </div>

      {/* Right Side Controls */}
      <div className="flex items-center justify-end gap-1 w-1/4">
        <ParticipantsPanel />
        <ChatPanel />
      </div>
      {showLeaveModal && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl text-white max-w-sm w-full">
            <h3 className="text-xl font-bold mb-4">Leave Meeting</h3>
            <p className="mb-6">
              As the organizer, you can either end the meeting for everyone or
              just leave.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleEndMeeting}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
              >
                End Meeting for All
              </button>
              <button
                onClick={handleJustLeave}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded"
              >
                Leave Meeting
              </button>
              <button
                onClick={() => setShowLeaveModal(false)}
                className="w-full text-gray-400 hover:text-white text-sm py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
