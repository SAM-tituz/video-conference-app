import { peers,rooms } from "../mediasoup-server";
type ActionResult = {
    success: boolean;
    roomName?: string; // Room where state changed, needed for broadcasting
    message?: string;  // Optional message for logging
};
export const handleMutePeer = (organizerSocketId: string, targetPeerId: string): ActionResult => {
    

    const targetPeer = peers[targetPeerId];
    if (targetPeer && targetPeer.hasAudio) {
        console.log(`Organizer ${organizerSocketId} requesting mute for ${targetPeerId}`);
        // Send command to the target client
        targetPeer.socket.emit('server:force-mute');

        // Update server state
        targetPeer.hasAudio = false;

        return { success: true, roomName: targetPeer.roomName }; // Return success and room name
    }else if (!targetPeer) {
        const message = `Mute request failed: Target peer ${targetPeerId} not found.`;
        console.log(message);
        return { success: false, message: message };
     } else {
        const message = `Mute request failed: Target ${targetPeerId} not found or already muted.`;
        console.log(message);
        return { success: false, message: message, roomName: targetPeer?.roomName }; // Return failure, include room if peer found
    }
};
export const handleStopVideoPeer = (organizerSocketId: string, targetPeerId: string): ActionResult => {
    const targetPeer = peers[targetPeerId];
    if (targetPeer && targetPeer.hasVideo) {
         console.log(`Action: Organizer ${organizerSocketId} requesting stop video for ${targetPeerId}`);
         targetPeer.socket.emit('server:force-stop-video');
         targetPeer.hasVideo = false;
         return { success: true, roomName: targetPeer.roomName };
    } else if (!targetPeer) {
        // ... handle error ...
        return { success: false, message: `Target peer ${targetPeerId} not found.`};
    } else {
        // ... handle already stopped video ...
         return { success: false, message: `Target ${targetPeerId} video already stopped.`, roomName: targetPeer.roomName };
    }
};
export const handleKickPeer = (organizerSocketId: string, targetPeerId: string): ActionResult => {
   
    const targetPeer = peers[targetPeerId];
    if (targetPeer) {
        const roomName = targetPeer.roomName; // Store room name before potential disconnect
        console.log(`Action: Organizer ${organizerSocketId} kicking peer ${targetPeerId}`);
        targetPeer.socket.emit('server:you-are-kicked');
        // Delay disconnect slightly to allow message delivery
       
        // Return success, but roomName isn't strictly needed here as disconnect handles broadcast
        return { success: true, roomName: roomName, message: "Kick initiated" };
    } else {
         // ... handle error ...
        return { success: false, message: `Target peer ${targetPeerId} not found.`};
    }
};