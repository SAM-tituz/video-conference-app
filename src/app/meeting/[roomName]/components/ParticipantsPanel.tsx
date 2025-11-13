"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MoreVertical,
  LogOut,
  Shield,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useParticipant, Participant } from "@/lib/provider/ParticipantContext";
import { useState } from "react";
import { useChat } from "@/lib/provider/ChatContext";

export const ParticipantsPanel = () => {
  const {
    participants,
    isOrganizer,
    kickPeer,
    remoteMutePeer,
    remoteStopVideoPeer,
    muteAllPeers,
    transferRole,
  } = useParticipant();

  const { setIsChatOpen, setCurrentChatTarget } = useChat();
  const [peerToPromote, setPeerToPromote] = useState<Participant | null>(null);

  const handleConfirmTransfer = () => {
    if (peerToPromote) {
      // ✅ FIX: Send the permanent userId, not the temporary socket.id
      transferRole(peerToPromote.userId);
      setPeerToPromote(null); // Close the dialog
    }
  };

  const handleStartPrivateChat = (p: Participant) => {
    setCurrentChatTarget(p); // Switch chat to this user
    setIsChatOpen(true); // Open the panel
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="w-12 h-12 rounded-full flex items-center justify-center text-white bg-transparent hover:bg-gray-700 transition-colors duration-200">
          <Users className="w-6 h-6" />
        </button>
      </SheetTrigger>
      <SheetContent className="bg-gray-900 border-l-gray-700 text-white">
        <SheetHeader>
          <SheetTitle className="text-white">
            Participants ({participants.length})
          </SheetTitle>
        </SheetHeader>
        <SheetDescription className="sr-only" />

        {isOrganizer && (
          <div className="mt-4">
            <button
              onClick={muteAllPeers}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <MicOff className="w-5 h-5" /> Mute All
            </button>
          </div>
        )}

        <ScrollArea className="h-[calc(100%-8rem)] mt-4">
          <div className="space-y-4">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar>
                    <AvatarFallback className="bg-indigo-600 text-white">
                      {p.name ? p.name.charAt(0).toUpperCase() : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col truncate">
                    <span className="truncate">
                      {p.name || `Peer-${p.id.slice(0, 4)}`}
                      {p.isLocal && " (You)"}
                    </span>
                    {p.isOrganizer && (
                      <span className="text-xs text-yellow-400 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Organizer
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {p.hasAudio ? (
                    <Mic className="w-4 h-4 text-green-400" />
                  ) : (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                  {p.hasVideo ? (
                    <Video className="w-4 h-4 text-green-400" />
                  ) : (
                    <VideoOff className="w-4 h-4 text-red-400" />
                  )}
                </div>

                {/* ✅ FIX: Show dropdown for everyone, but control items inside */}
                {!p.isLocal && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded-full text-gray-400 hover:bg-gray-700 transition-opacity">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 text-white border-gray-700">
                      {/* --- Item for EVERYONE --- */}
                      <DropdownMenuItem
                        onSelect={() => handleStartPrivateChat(p)}
                        className="hover:bg-gray-700 cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4 mr-2" /> Send Private
                        Message
                      </DropdownMenuItem>

                      {/* --- Items for ORGANIZER ONLY --- */}
                      {isOrganizer && (
                        <>
                          {!p.isOrganizer && (
                            <DropdownMenuItem
                              onSelect={() => setPeerToPromote(p)}
                              className="hover:bg-gray-700 cursor-pointer text-yellow-400 hover:text-yellow-300"
                            >
                              <ShieldAlert className="w-4 h-4 mr-2" /> Make
                              Organizer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={() => remoteMutePeer(p.id)}
                            className="hover:bg-gray-700 cursor-pointer"
                          >
                            <MicOff className="w-4 h-4 mr-2" /> Mute Audio
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => remoteStopVideoPeer(p.id)}
                            className="hover:bg-gray-700 cursor-pointer"
                          >
                            <VideoOff className="w-4 h-4 mr-2" /> Stop Video
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-gray-700" />
                          <DropdownMenuItem
                            onSelect={() => kickPeer(p.id)}
                            className="text-red-400 hover:bg-red-900 hover:text-red-300 cursor-pointer"
                          >
                            <LogOut className="w-4 h-4 mr-2" /> Kick Out
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <AlertDialog
          open={!!peerToPromote}
          onOpenChange={(isOpen) => !isOpen && setPeerToPromote(null)}
        >
          {/* ... (no changes to AlertDialog) ... */}
          <AlertDialogContent className="bg-gray-800 text-white border-gray-700">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Make {peerToPromote?.name} the organizer?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-400">
                You will no longer be the organizer and will lose all moderation
                controls.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => setPeerToPromote(null)}
                className="bg-gray-700 hover:bg-gray-600 border-none"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmTransfer}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};
