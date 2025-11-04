// components/ControlBar.tsx
"use client";

import React, { useState } from "react";
import { ParticipantsPanel } from "./ParticipantsPanel";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Users,
  MessageSquare,
} from "lucide-react";

interface ControlBarProps {
  isMuted: boolean;
  isVideoOn: boolean;
  isOrganizer: boolean;
  breakoutRooms: string[];
  assignments: Map<string, string>;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onScreenShare: () => void;
  onLeave: () => void;
  onCreateRooms: (numRooms: number) => void;
  onAssignPeer: (peerId: string, roomName: string) => void;
  onStartBreakouts: () => void;
  onEndBreakouts: () => void;
  participants: any[];
  onExitBreakout: () => void;
  roomName: string;
  onRemoteMute: (peerId: string) => void;
  onRemoteStopVideo: (peerId: string) => void;
  onKickPeer: (peerId: string) => void;
}

// Reusable circular button
const ControlButton = ({
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
// /////////////////////////////
const BreakoutPanel = ({
  mainRoomParticipants,
  breakoutRooms,
  assignments,
  onAssignPeer,
  onCreateRooms,
  onStartBreakouts,
  onEndBreakouts,
  roomName,
}: {
  mainRoomParticipants: { id: string; name: string; isLocal: boolean }[];
  breakoutRooms: string[];
  assignments: Map<string, string>;
  onCreateRooms: (numRooms: number) => void;
  onAssignPeer: (peerId: string, roomName: string) => void;
  onStartBreakouts: () => void;
  onEndBreakouts: () => void;
  roomName: string;
}) => {
  const [numRooms, setNumRooms] = useState(2);
  const [isOpen, setIsOpen] = useState(false);
  const mainRoomName = roomName.split("-breakout-")[0];
  const assignableRooms = [
    { name: "Main Room", value: mainRoomName },
    ...breakoutRooms.map((r) => ({
      name: `Breakout ${r.split("-").pop()}`,
      value: r,
    })),
  ];
  // const mainRoomParticipants = mainRoomParticipants;

  return (
    <>
      <ControlButton
        onClick={() => setIsOpen(true)}
        className="bg-gray-700 hover:bg-gray-600"
      >
        <Users className="w-6 h-6" />
      </ControlButton>
      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          ></div>
          <div className="fixed top-0 right-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-700 text-white flex flex-col z-50 p-6 shadow-lg">
            <header className="flex items-center justify-between pb-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold">Breakout Rooms</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 text-2xl hover:text-white"
              >
                &times;
              </button>
            </header>

            {breakoutRooms.length === 0 ? (
              <div className="mt-6 space-y-4">
                <p className="text-gray-300">
                  Create rooms to assign participants.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={numRooms}
                    onChange={(e) =>
                      setNumRooms(parseInt(e.target.value, 10) || 1)
                    }
                    className="bg-gray-800 border-gray-700 text-white w-20 rounded-md p-2"
                  />
                  <button
                    onClick={() => onCreateRooms(numRooms)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col flex-1">
                <div className="space-x-2">
                  <button
                    onClick={onStartBreakouts}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md"
                  >
                    Start Breakouts
                  </button>
                  <button
                    onClick={onEndBreakouts}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md"
                  >
                    End Breakouts
                  </button>
                </div>
                <div className="flex-1 mt-6 overflow-y-auto">
                  <h3 className="font-semibold mb-2">Assignments</h3>
                  {mainRoomParticipants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded-md mb-2"
                    >
                      <span className="truncate">{p.name}</span>
                      <select
                        value={assignments.get(p.id) || "main"}
                        onChange={(e) => onAssignPeer(p.id, e.target.value)}
                        className="w-[180px] bg-gray-700 border-gray-600 text-white rounded p-2"
                      >
                        {assignableRooms.map((room) => (
                          <option key={room.value} value={room.value}>
                            {room.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

// ////////////////////////////
export const ControlBar = ({
  isMuted,
  isVideoOn,
  isOrganizer,
  breakoutRooms,
  assignments,
  onToggleVideo,
  onToggleMute,
  onScreenShare,
  onLeave,
  onCreateRooms,
  onAssignPeer,
  onStartBreakouts,
  onEndBreakouts,
  participants,
  mainRoomParticipants,
  onExitBreakout,
  roomName,
  onRemoteMute,
  onRemoteStopVideo,
  onKickPeer,
}: ControlBarProps & { mainRoomParticipants: any[] }) => {
  const isInBreakout = roomName.includes("-breakout-");

  return (
    <div className="bg-gray-900 px-6 py-3 flex items-center justify-between">
      {/* Left Side: Meeting Title */}
      <span className="text-lg font-semibold w-1/4">Meeting</span>

      {/* Center Controls */}
      <div className="flex items-center justify-center gap-4 w-1/2">
        <ControlButton
          onClick={onToggleMute}
          className={
            isMuted
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-700 hover:bg-gray-600"
          }
        >
          {isMuted ? <MicOff /> : <Mic />}
        </ControlButton>
        <ControlButton
          onClick={onToggleVideo}
          className={
            !isVideoOn
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-700 hover:bg-gray-600"
          }
        >
          {isVideoOn ? <Video /> : <VideoOff />}
        </ControlButton>

        {isOrganizer && (
          <BreakoutPanel
            mainRoomParticipants={mainRoomParticipants}
            breakoutRooms={breakoutRooms}
            assignments={assignments}
            onCreateRooms={onCreateRooms}
            onAssignPeer={onAssignPeer}
            onStartBreakouts={onStartBreakouts}
            onEndBreakouts={onEndBreakouts}
            roomName={roomName}
          />
        )}
        <ControlButton
          onClick={onScreenShare}
          className="bg-gray-700 hover:bg-gray-600"
        >
          <ScreenShare />
        </ControlButton>
        {isInBreakout && (
          <ControlButton
            onClick={onExitBreakout}
            className="bg-blue-600 hover:bg-blue-700 !w-auto px-4"
          >
            Return to Main Room
          </ControlButton>
        )}
        <ControlButton
          onClick={onLeave}
          className="bg-red-600 hover:bg-red-700 !w-16"
        >
          <PhoneOff />
        </ControlButton>
      </div>

      {/* Right Side Controls */}
      <div className="flex items-center justify-end gap-4 w-1/4">
        <ParticipantsPanel
          participants={participants}
          isCurrentUserOrganizer={isOrganizer} // Pass down organizer status
          onRemoteMute={onRemoteMute} // Pass down handler
          onRemoteStopVideo={onRemoteStopVideo} // Pass down handler
          onKickPeer={onKickPeer} // Pass down handler
        />
        <ControlButton
          onClick={() => {}}
          className="bg-transparent hover:bg-gray-700"
          disabled
        >
          <MessageSquare />
        </ControlButton>
      </div>
    </div>
  );
};
