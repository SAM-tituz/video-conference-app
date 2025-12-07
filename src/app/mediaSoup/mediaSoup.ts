import "dotenv/config";
import io, { type Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

type Transport = mediasoupClient.types.Transport;
type Producer = mediasoupClient.types.Producer;
type Consumer = mediasoupClient.types.Consumer;
type Device = mediasoupClient.types.Device;
type rtpCapabilities = mediasoupClient.types.RtpCapabilities;
type TransportOptions = mediasoupClient.types.TransportOptions;
type ConsumerOptions = mediasoupClient.types.ConsumerOptions;
type param = {
  encodings?: { rid?: string; maxBitrate?: number }[];
  codecOptions?: { videoGoogleStartBitrate?: number };
};
import { Participant } from "@/lib/provider/ParticipantContext";
import { Message } from "@/lib/provider/ChatContext";

type MediaSoupClientOptions = {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (
    id: string,
    stream: MediaStream,
    kind: "audio" | "video"
  ) => void;
  onParticipantList: (participants: Participant[]) => void;
  onRemoteTrackRemoved: (peerId: string, track: MediaStreamTrack) => void;
  // onForceMove: (data: { roomName: string }) => void;
  onBreakoutState: (data: {
    breakoutRoomNames: string[];
    assignments: [string, string][];
    mainRoomParticipants?: Participant[];
  }) => void;
  onMoveConfirmed: (data: {
    newRoomName: string;
    rtpCapabilities: rtpCapabilities;
  }) => void;
  onForceMute: () => void;
  onForceStopVideo: () => void;
  onKicked: () => void;
  onNewPublicMessage: (message: Message) => void; // ✅ Renamed
  onNewPrivateMessage: (message: Message, otherUserId: string) => void;
};

export default function mediaSoupClient(
  roomName: string,
  participantId: string,
  userName: string,
  options: MediaSoupClientOptions
) {
  let isClosed = false;
  const serverUrl = process.env.NEXT_PUBLIC_MEDIASOUP_CLIENT_URL;
  const socket: Socket = io(`${serverUrl}/mediasoup`);
  const consumers = new Map<string, Consumer>();
  const producerToPeerMap = new Map<string, string>();
  let currentRoomName = roomName;
  let device: Device | null = null;
  let sendTransport: Transport | null = null;
  let recvTransport: Transport | null = null;
  let audioProducer: Producer | null = null;
  let videoProducer: Producer | null = null;
  const audioParams: { track?: MediaStreamTrack } = {};
  const videoParams: { track?: MediaStreamTrack; params?: param } = {
    params: {
      encodings: [
        { rid: "r0", maxBitrate: 100000 },
        { rid: "r1", maxBitrate: 300000 },
        { rid: "r2", maxBitrate: 900000 },
      ],
      codecOptions: { videoGoogleStartBitrate: 1000 },
    },
  };

  const closeAllConnection = () => {
    console.log("Closing all mediasoup objects and media tracks.");

    // 1. Stop the actual hardware tracks. This turns off the camera/mic light.
    videoParams.track?.stop();
    audioParams.track?.stop();

    // 2. Close all mediasoup objects.
    audioProducer?.close();
    videoProducer?.close();
    consumers.forEach((c) => c.close());
    sendTransport?.close();
    recvTransport?.close();

    // 3. Clear local state variables.
    audioProducer = null;
    videoProducer = null;
    sendTransport = null;
    recvTransport = null;
    consumers.clear();
    producerToPeerMap.clear();
  };

  const reinitialize = async (
    rtpCapabilities: rtpCapabilities,
    newLocalStream: MediaStream
  ) => {
    console.log("Re-initializing media for new room.");
    // Update local media tracks
    audioParams.track = newLocalStream.getAudioTracks()[0];
    videoParams.track = newLocalStream.getVideoTracks()[0];

    // If we don't have a device, create one.
    // This handles the very first connection.
    if (!device) {
      device = new mediasoupClient.Device();
    }

    // If the device is not loaded, load it.
    // The 'load' call is idempotent (safe to call multiple times).
    if (!device.loaded) {
      await device.load({ routerRtpCapabilities: rtpCapabilities });
    }

    // Now, just re-create the transports and producers
    await createSendTransport();
    await createRecvTransport();
    await connectSendTransport();
    getProducers();
  };

  //
  const prepareToMove = (newRoomName: string) => {
    console.log("CLIENT: Received prepare-to-move command. Cleaning up.");

    closeAllConnection();

    // Acknowledge readiness to the server
    console.log("CLIENT: Cleanup complete. Sending acknowledgment.");
    socket.emit("client:ready-for-new-room", { newRoomName });
  };

  //

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    options.onLocalStream(stream);
    audioParams.track = stream.getAudioTracks()[0];
    videoParams.track = stream.getVideoTracks()[0];

    socket.emit(
      "joinRoom",
      {
        roomName: currentRoomName,
        participantId: participantId,
        participantName: userName,
      },
      async (data: {
        rtpCapabilities: mediasoupClient.types.RtpCapabilities;
      }) => {
        // This is the first time we connect, so we initialize everything
        await reinitialize(data.rtpCapabilities, stream);
      }
    );
  };

  //  Listen for the server's command to move.
  socket.on("server:prepare-to-move", ({ newRoomName }) => {
    prepareToMove(newRoomName);
  });
  // Listen for the server's final confirmation and new room details.
  socket.on("server:you-are-moved", ({ newRoomName, rtpCapabilities }) => {
    console.log("CLIENT: Move confirmed by server. Ready to re-initialize.");
    currentRoomName = newRoomName;
    options.onMoveConfirmed({ newRoomName, rtpCapabilities });
  });
  socket.on("room-participants", (participants) => {
    options.onParticipantList(participants);
  });

  // It handles creation, assignments, and ending of breakouts all at once.
  socket.on(
    "organizer:breakoutState",
    (data: {
      breakoutRoomNames: string[];
      assignments: [string, string][];
      mainRoomParticipants: Participant[];
    }) => {
      console.log("Received synchronized breakout state:", data);
      options.onBreakoutState(data);
    }
  );

  const createBreakoutRooms = (numRooms: number) => {
    socket.emit("organizer:createBreakoutRooms", {
      roomName: currentRoomName,
      numRooms,
    });
  };

  const assignPeerToRoom = (peerId: string, targetRoomName: string) => {
    socket.emit("organizer:assignPeerToRoom", { peerId, targetRoomName });
  };

  const startBreakouts = () => {
    const mainRoomName = currentRoomName.split("-breakout-")[0];
    socket.emit("organizer:startBreakouts", { mainRoomName });
  };

  const endBreakouts = () => {
    const mainRoomName = currentRoomName.split("-breakout-")[0];
    socket.emit("organizer:endBreakouts", { mainRoomName });
  };

  const exitBreakoutRoom = () => {
    // We don't need to send any data; the server knows who we are from our socket.id
    socket.emit("peer:exitBreakoutRoom");
  };

  const createSendTransport = async () => {
    return new Promise<void>((resolve) => {
      socket.emit(
        "createWebRtcTransport",
        { consumer: false },
        (params: TransportOptions | { error: unknown }) => {
          if (!device || "error" in params) return;
          sendTransport = device.createSendTransport(params);
          sendTransport.on("connect", ({ dtlsParameters }, callback) => {
            socket.emit("transport-connect", {
              transportId: sendTransport!.id,
              dtlsParameters,
            });
            callback();
          });
          sendTransport.on("produce", (parameters, callback) => {
            socket.emit(
              "transport-produce",
              {
                transportId: sendTransport!.id,
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
              },
              ({ id }: { id: string }) => callback({ id })
            );
          });
          resolve();
        }
      );
    });
  };

  const createRecvTransport = async () => {
    return new Promise<void>((resolve) => {
      socket.emit(
        "createWebRtcTransport",
        { consumer: true },
        (params: TransportOptions | { error: unknown }) => {
          if (!device || "error" in params) return;
          recvTransport = device.createRecvTransport(params);
          recvTransport.on("connect", ({ dtlsParameters }, callback) => {
            socket.emit("transport-connect", {
              transportId: recvTransport!.id,
              dtlsParameters,
            });
            callback();
          });
          resolve();
        }
      );
    });
  };

  const connectSendTransport = async () => {
    if (!sendTransport) return;
    audioProducer = await sendTransport.produce(audioParams);
    videoProducer = await sendTransport.produce(videoParams);
  };

  const getProducers = () => {
    socket.emit(
      "getProducers",
      (data: { producerIds: string[]; peerId: string }[]) =>
        data.forEach(({ producerIds, peerId }) =>
          producerIds.forEach((producerId) => consumeStream(producerId, peerId))
        )
    );
  };

  const consumeStream = async (producerId: string, peerId: string) => {
    if (!device || !recvTransport) return;
    socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId: producerId,
        serverConsumerTransportId: recvTransport.id,
      },
      async (params: ConsumerOptions | { error: unknown }) => {
        if (!recvTransport || "error" in params) return;
        const consumer = await recvTransport.consume(params);
        consumers.set(producerId, consumer);
        producerToPeerMap.set(producerId, peerId);
        const stream = new MediaStream([consumer.track]);
        options.onRemoteStream(peerId, stream, consumer.kind);
        socket.emit("consumer-resume", { serverConsumerId: consumer.id });
      }
    );
  };

  // --- ADDED FUNCTION: stopVideoProducer ---
  const stopVideoProducer = () => {
    if (!videoProducer) return;
    console.log("Stopping video producer");

    // Stop the camera track
    videoParams.track?.stop();

    // Close the producer on the server
    videoProducer.close();

    // Inform the server to close the producer
    // Your server should listen for 'producer-close' and broadcast it
    socket.emit("producer-close", { producerId: videoProducer.id });

    videoProducer = null;
    videoParams.track = undefined;
  };
  // --- ADDED FUNCTION: resumeVideoProducer ---
  const resumeVideoProducer = async () => {
    if (!sendTransport) {
      console.error("Cannot resume video: sendTransport is not initialized.");
      return null;
    }
    if (videoProducer) {
      console.warn("Cannot resume video: a video producer already exists.");
      return videoParams.track || null;
    }

    console.log("Resuming video: getting new media track...");

    // 1. Get a new video track from the device.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newTrack = stream.getVideoTracks()[0];
    if (!newTrack) {
      console.error("Failed to get a new video track from getUserMedia.");
      return null;
    }

    // 2. Update our internal track reference.
    videoParams.track = newTrack;

    // 3. ✅ Create a completely fresh params object for the new producer.
    const producerParams = {
      track: newTrack,
      encodings: videoParams.params?.encodings, // Reuse encodings if they exist
      codecOptions: videoParams.params?.codecOptions,
    };

    // 4. Create the new producer.
    videoProducer = await sendTransport.produce(producerParams);
    console.log("track returned", newTrack);
    return newTrack;
  };

  // /////
  const stopAudioProducer = () => {
    if (!audioProducer) return;
    console.log("Stopping audio producer");
    audioParams.track?.stop(); // Stop the microphone track
    audioProducer.close();
    socket.emit("producer-close", { producerId: audioProducer.id });
    audioProducer = null;
  };

  const resumeAudioProducer = async () => {
    if (!sendTransport) return null;
    console.log("Resuming audio producer");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const newTrack = stream.getAudioTracks()[0];
    if (!newTrack) throw new Error("No audio track found");
    audioParams.track = newTrack;
    audioProducer = await sendTransport.produce(audioParams);
    return newTrack;
  };

  const startScreenShare = async () => {
    if (!sendTransport) return null; // Prevent multiple screen shares
    console.log("Starting screen share");
    if (videoProducer) {
      await stopVideoProducer();
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) return null;

    videoParams.track = track;
    videoProducer = await sendTransport.produce(videoParams);
    videoProducer.appData = { source: "screen" };

    // When the user clicks the browser's "Stop sharing" button
    track.onended = () => {
      console.log("Screen share track ended");
      stopScreenShare();
      resumeVideoProducer();
    };

    return stream; // Return the stream to display locally
  };

  const stopScreenShare = () => {
    if (videoParams.track) {
      videoParams.track.stop();
    }
    if (!videoProducer || videoProducer.appData.source !== "screen") return; // Add a flag to know it's a screen
    console.log("Stopping screen share");
    videoProducer.close();
    socket.emit("producer-close", { producerId: videoProducer.id });
    videoProducer = null;
  };
  ///
  // --- Organizer Actions ---
  const remoteMutePeer = (peerId: string) => {
    console.log(`Requesting server to mute peer: ${peerId}`);
    socket.emit("organizer:mute-peer", { targetPeerId: peerId });
  };

  const remoteStopVideoPeer = (peerId: string) => {
    console.log(`Requesting server to stop video for peer: ${peerId}`);
    socket.emit("organizer:stop-video-peer", { targetPeerId: peerId });
  };

  const kickPeer = (peerId: string) => {
    console.log(`Requesting server to kick peer: ${peerId}`);
    socket.emit("organizer:kick-peer", { targetPeerId: peerId });
  };
  const endMeeting = () => {
    const mainRoomName = currentRoomName.split("-breakout-")[0];
    console.log(`Requesting server to end meeting: ${mainRoomName}`);
    socket.emit("organizer:end-meeting", { mainRoomName });
  };

  const muteAllPeers = () => {
    console.log("Requesting server to mute all peers.");
    socket.emit("organizer:mute-all");
  };

  const transferRole = (targetUserId: string) => {
    console.log(`Requesting server to transfer role to: ${targetUserId}`);
    socket.emit("organizer:transfer-role", { targetUserId });
  };
  const sendPublicMessage = (text: string) => {
    socket.emit("peer:send-public-message", { text });
  };

  const sendPrivateMessage = (text: string, targetUserId: string) => {
    socket.emit("peer:send-private-message", { text, targetUserId });
  };
  // --- Listen for Server Commands ---
  socket.on("server:force-mute", () => {
    console.log("Received force mute command from server.");
    // stopAudioProducer();
    options.onForceMute();
    // Optional: Update local UI state immediately if not relying solely on context update
    // options.onLocalMuteChange?.(true); // Need to add this callback to options if needed
  });

  socket.on("server:force-stop-video", () => {
    console.log("Received force stop video command from server.");
    // stopVideoProducer();
    options.onForceStopVideo();
    // Optional: Update local UI state
    // options.onLocalVideoChange?.(false); // Need to add this callback to options if needed
  });

  socket.on("server:you-are-kicked", () => {
    console.log("Received kick command from server.");

    // cleanup(); // Perform full cleanup
    options.onKicked();

    // The VideoCall component should handle redirecting on cleanup/context change
  });

  socket.on("room:new-public-message", (message: Message) => {
    options.onNewPublicMessage(message);
  });

  socket.on("room:new-private-message", ({ message, targetUserId }) => {
    // This logic handles both sending and receiving
    if (targetUserId) {
      // I am the SENDER. The "other person" is the targetUserId.
      options.onNewPrivateMessage(message, targetUserId);
    } else {
      // I am the RECEIVER. The "other person" is the message.senderId.
      options.onNewPrivateMessage(message, message.senderId);
    }
  });
  // /
  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;

    console.log("Cleaning up mediasoup client...");
    closeAllConnection();
    device = null; // Nullify the device only on final cleanup
    // Finally socket
    socket.disconnect();
  };

  socket.on("connection-success", () => getLocalStream());
  socket.on("new-producer", ({ producerId, peerId }) =>
    consumeStream(producerId, peerId)
  );
  socket.on("producer-closed", ({ remoteProducerId }) => {
    const consumer = consumers.get(remoteProducerId);
    if (consumer) {
      const trackToRemove = consumer.track;
      consumer.close();
      consumers.delete(remoteProducerId);
      const peerId = producerToPeerMap.get(remoteProducerId);
      if (peerId) {
        options.onRemoteTrackRemoved(peerId, trackToRemove);
        producerToPeerMap.delete(remoteProducerId);
      }
    }
  });
  return {
    socket,
    cleanup,
    stopVideoProducer,
    resumeVideoProducer,
    stopAudioProducer,
    resumeAudioProducer,
    startScreenShare,
    stopScreenShare,
    reinitialize,
    createBreakoutRooms,
    assignPeerToRoom,
    endBreakouts,
    startBreakouts,
    exitBreakoutRoom,
    remoteMutePeer,
    remoteStopVideoPeer,
    kickPeer,
    sendPublicMessage,
    sendPrivateMessage,
    endMeeting,
    muteAllPeers,
    transferRole,
  };
}
