"use client";

import VideoCall from "../../pages/videoCall";
import MeetingJoinScreen from "./components/joinScreen";
import { useState } from "react";
import { useParams } from "next/navigation"; 

export default function MeetingPage() {
  const params = useParams();
  const roomName = (params.roomName as string) || ""; 

  const [allowedToJoin, setAllowedToJoin] = useState(false);

  const handleJoinSuccess = () => {
    setAllowedToJoin(true);
  };

  return (
    <div>
      {roomName.includes("-breakout-") ? (
        <VideoCall />
      ) : (
        <>
          {allowedToJoin ? (
            <VideoCall />
          ) : (
            <MeetingJoinScreen onJoinSuccess={handleJoinSuccess} />
          )}
        </>
      )}
    </div>
  );
}