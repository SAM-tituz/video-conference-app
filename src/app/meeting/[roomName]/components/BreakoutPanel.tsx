// components/BreakoutPanel.tsx

"use client";
import { useState, useMemo } from "react";
import { ControlButton } from "./ControlBar";
import { Split, ChevronDown, ChevronRight } from "lucide-react"; // Import ChevronRight
import { useBreakoutRoom } from "@/lib/provider/BreakoutRoomContext";
import { Participant } from "@/lib/provider/ParticipantContext";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"; // Import Collapsible

// A small sub-component for each participant row
const ParticipantRow = ({
  participant,
  isSelected,
  onToggle,
}: {
  participant: Participant;
  isSelected: boolean;
  onToggle: (peerId: string) => void;
}) => (
  <div className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-800">
    <Checkbox
      id={`cb-${participant.id}`}
      checked={isSelected}
      onCheckedChange={() => onToggle(participant.id)}
      className="border-gray-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
    />
    <label htmlFor={`cb-${participant.id}`} className="truncate cursor-pointer">
      {participant.name}
    </label>
  </div>
);

export const BreakoutPanel = ({ roomName }: { roomName: string }) => {
  const {
    assignments,
    breakoutRooms,
    assignPeerToRoom,
    createBreakoutRooms,
    endBreakouts,
    startBreakouts,
    mainRoomParticipants,
  } = useBreakoutRoom();

  const [numRooms, setNumRooms] = useState(2);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set()
  );

  const mainRoomName = roomName.split("-breakout-")[0];

  const { unassignedParticipants, groupedRooms, assignableRooms } =
    useMemo(() => {
      const unassigned: Participant[] = [];
      const grouped = new Map<string, Participant[]>();

      // Prepare room groups
      const assignable = [
        { name: "Unassigned", value: mainRoomName },
        ...breakoutRooms.map((roomFullName, i) => {
          grouped.set(roomFullName, []);
          return {
            name: `Breakout ${i + 1}`,
            value: roomFullName,
          };
        }),
      ];

      // Sort participants
      for (const participant of mainRoomParticipants) {
        const assignedRoom = assignments.get(participant.userId);
        if (assignedRoom && assignedRoom !== mainRoomName) {
          grouped.get(assignedRoom)?.push(participant);
        } else {
          unassigned.push(participant);
        }
      }

      return {
        unassignedParticipants: unassigned,
        groupedRooms: grouped,
        assignableRooms: assignable,
      };
    }, [mainRoomParticipants, assignments, breakoutRooms, mainRoomName]);

  const handleToggleParticipant = (peerId: string) => {
    setSelectedParticipants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(peerId)) {
        newSet.delete(peerId);
      } else {
        newSet.add(peerId);
      }
      return newSet;
    });
  };

  const handleAssignSelected = (targetRoomName: string) => {
    selectedParticipants.forEach((peerId) => {
      assignPeerToRoom(peerId, targetRoomName);
    });
    setSelectedParticipants(new Set());
  };

  if (!isOpen) {
    return (
      <ControlButton
        onClick={() => setIsOpen(true)}
        className="bg-gray-700 hover:bg-gray-600"
      >
        <Split className="w-6 h-6" />
      </ControlButton>
    );
  }
  console.log(
    "Rendering BreakoutPanel with mainRoomParticipants:",
    mainRoomParticipants
  );

  return (
    <>
      <ControlButton
        onClick={() => setIsOpen(true)}
        className="bg-gray-700 hover:bg-gray-600"
      >
        <Split className="w-6 h-6" />
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
              // --- Panel for CREATING rooms ---
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
                    onClick={() => createBreakoutRooms(numRooms)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              // --- Panel for ASSIGNING rooms ---
              <div className="mt-6 flex flex-col flex-1 min-h-0">
                <div className="space-x-2 flex-shrink-0">
                  <button
                    onClick={startBreakouts}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md"
                  >
                    Start Breakouts
                  </button>
                  <button
                    onClick={endBreakouts}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-md"
                  >
                    End Breakouts
                  </button>
                </div>

                <div className="flex-1 mt-6 overflow-y-auto">
                  <ScrollArea className="h-full pr-3">
                    {/* --- Assign Button (Fix) --- */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={selectedParticipants.size === 0}
                        className="flex items-center justify-center gap-2 w-full p-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                      >
                        Assign
                        <ChevronDown className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-gray-800 text-white border-gray-700">
                        {assignableRooms.map((room) => (
                          <DropdownMenuItem
                            key={room.value}
                            onSelect={() => handleAssignSelected(room.value)}
                            className="hover:bg-gray-700 cursor-pointer"
                          >
                            {room.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* --- Unassigned List (Fix) --- */}
                    <Collapsible defaultOpen={true} className="mt-4">
                      <CollapsibleTrigger className="group flex items-center gap-2 w-full text-gray-400 hover:text-white">
                        <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                        <h3 className="font-semibold">
                          Unassigned ({unassignedParticipants.length})
                        </h3>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-6 pt-2">
                        <div className="flex flex-col gap-1">
                          {unassignedParticipants.map((p) => (
                            <ParticipantRow
                              key={p.id}
                              participant={p}
                              isSelected={selectedParticipants.has(p.id)}
                              onToggle={handleToggleParticipant}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* --- Assigned Rooms List (Fix) --- */}
                    <div className="mt-6 space-y-4">
                      {Array.from(groupedRooms.entries()).map(
                        ([roomName, participants]) => (
                          <Collapsible defaultOpen={true} key={roomName}>
                            <CollapsibleTrigger className="group flex items-center gap-2 w-full text-gray-200 hover:text-white">
                              <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                              <h3 className="font-semibold">
                                Breakout {roomName.split("-").pop()} (
                                {participants.length})
                              </h3>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pl-6 pt-2">
                              <div className="flex flex-col gap-1">
                                {participants.map((p) => (
                                  <ParticipantRow
                                    key={p.id}
                                    participant={p}
                                    isSelected={selectedParticipants.has(p.id)}
                                    onToggle={handleToggleParticipant}
                                  />
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};
