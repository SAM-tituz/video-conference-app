import io, {type Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
type Transport = mediasoupClient.types.Transport;
type Producer = mediasoupClient.types.Producer;
type Consumer = mediasoupClient.types.Consumer;
type Device = mediasoupClient.types.Device;
interface CreateBreakoutRoomsResponse {
  breakoutRoomNames: string[];
}

type MediaSoupClientOptions = {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (
    id: string,
    stream: MediaStream,
    kind: "audio" | "video"
  ) => void;
  onParticipantList: (
    participants: { id: string; name: string; isOrganizer: boolean }[]
  ) => void;
  onRemoteTrackRemoved: (peerId: string, track: MediaStreamTrack) => void;
  onForceMove: (data: { roomName: string }) => void;
  onBreakoutRoomsList: (rooms: string[]) => void;
  onAssignmentsUpdated: (assignments: [string, string][]) => void;
  onBreakoutsEnded: () => void;
};

let screenProducer: Producer | null = null;

export default function mediaSoupClient(
  roomName: string,
  participantId: string,
  options: MediaSoupClientOptions
) {
  let isClosed = false;
  const socket: Socket = io("http://localhost:8000/mediasoup");
  const consumers = new Map<string, Consumer>();
  const producerToPeerMap = new Map<string, string>();
  let currentRoomName = roomName;
  let device: Device | null = null;
  let sendTransport: Transport | null = null;
  let recvTransport: Transport | null = null;
  let audioProducer: Producer | null = null;
  let videoProducer: Producer | null = null;
  let audioParams: { track?: MediaStreamTrack } = {};
  let videoParams: { track?: MediaStreamTrack; params?: any } = {
    params: {
      encodings: [
        { rid: "r0", maxBitrate: 100000 },
        { rid: "r1", maxBitrate: 300000 },
        { rid: "r2", maxBitrate: 900000 },
      ],
      codecOptions: { videoGoogleStartBitrate: 1000 },
    },
  };

  const moveToRoom = async (newRoomName: string) => {
    console.log(`Moving from room ${currentRoomName} to ${newRoomName}`);

    // --- A. CLEAN UP EXISTING CONNECTION ---
    // 1. Close all local producers
    if (audioProducer) {
      audioProducer.close();
      audioProducer = null;
    }
    if (videoProducer) {
      videoProducer.close();
      videoProducer = null;
    }

    // 2. Close all consumers and transports
    // for (const consumer of consumers.values()) {
    //   consumer.close();
    // }
    consumers.clear();
    producerToPeerMap.clear();

    if (sendTransport) {
      sendTransport.close();
      sendTransport = null;
    }
    if (recvTransport) {
      recvTransport.close();
      recvTransport = null;
    }

    // 3. Clear the device
    device = null;

    try {
      //  B. RE-ACQUIRE MEDIA & JOIN NEW ROOM
      // Get a fresh stream with NEW, active tracks before joining
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      // Let the UI know about the new stream for local preview
      options.onLocalStream(stream);

      // Update params with the NEW tracks
      audioParams.track = stream.getAudioTracks()[0];
      videoParams.track = stream.getVideoTracks()[0];

      // Now, join the new room. This will use the FRESH tracks.
      currentRoomName = newRoomName;
      joinRoom(newRoomName);
    } catch (error) {
      console.error("Error re-acquiring media for room move:", error);
    }
  };

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    options.onLocalStream(stream);
    audioParams.track = stream.getAudioTracks()[0];
    videoParams.track = stream.getVideoTracks()[0];
    joinRoom(currentRoomName);
  };

  const joinRoom = (roomNameToJoin: string) => {
    socket.emit(
      "joinRoom",
      { roomName: roomNameToJoin, participantId: participantId },
      (data: { rtpCapabilities: mediasoupClient.types.RtpCapabilities }) => {
        createDevice(data.rtpCapabilities);
      }
    );
  };
  socket.on(
    "room-participants",
    (participants: { id: string; name: string; isOrganizer: boolean }[]) => {
      options.onParticipantList(participants);
    }
  );

  socket.on("server:forceMoveToRoom", (data) => {
    console.log("Received invitation to join room:", data.breakoutRoomName);
    // Pass the invitation details up to the React UI to display a modal
    options.onForceMove({
      roomName: data.breakoutRoomName,
    });
  });
  socket.on("organizer:assignmentsUpdated", (assignments) => {
    options.onAssignmentsUpdated(assignments);
  });

  socket.on("organizer:breakoutsEnded", () => {
    options.onBreakoutsEnded();
  });

  const createBreakoutRooms = (numRooms: number) => {
    socket.emit(
      "organizer:createBreakoutRooms",
      { roomName: currentRoomName, numRooms },
      (response: CreateBreakoutRoomsResponse) => {
        if (response.breakoutRoomNames) {
          options.onBreakoutRoomsList(response.breakoutRoomNames);
        }
      }
    );
  };

  const assignPeerToRoom = (peerId: string, targetRoomName: string) => {
    socket.emit("organizer:assignPeerToRoom", { peerId, targetRoomName });
  };
  socket.on("organizer:breakoutRoomsCreated", (data) => {
    options.onBreakoutRoomsList(data.breakoutRoomNames);
  });

  socket.on("organizer:breakoutState", (data) => {
    options.onBreakoutRoomsList(data.breakoutRooms);
    options.onAssignmentsUpdated(data.assignments);
  });

  const startBreakouts = () => {
    const mainRoomName = currentRoomName.split("-breakout-")[0];
    socket.emit("organizer:startBreakouts", { mainRoomName });
  };
  const requestBreakoutState = () => {
    socket.emit("organizer:requestBreakoutState", {
      roomName: currentRoomName,
    });
  };

  const endBreakouts = () => {
    const mainRoomName = currentRoomName.split("-breakout-")[0];
    socket.emit("organizer:endBreakouts", { mainRoomName });
  };

  const exitBreakoutRoom = () => {
    // We don't need to send any data; the server knows who we are from our socket.id
    socket.emit("peer:exitBreakoutRoom");
  };

  const createDevice = async (
    rtpCapabilities: mediasoupClient.types.RtpCapabilities
  ) => {
    if (isClosed) return;
    device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    if (isClosed) return;
    await createSendTransport();
    if (isClosed) return;
    await createRecvTransport();
    connectSendTransport();
    getProducers();
  };

  const createSendTransport = async () => {
    return new Promise<void>((resolve) => {
      socket.emit(
        "createWebRtcTransport",
        { consumer: false },
        (params: any) => {
          if (!device || params.error) return;
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
        (params: any) => {
          if (!device || params.error) return;
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
      async (params: any) => {
        if (params.error || !recvTransport) return;
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
    socket?.emit("producer-close", { producerId: videoProducer.id });

    videoProducer = null;
  };
  // --- ADDED FUNCTION: resumeVideoProducer ---
  const resumeVideoProducer = async () => {
    if (!sendTransport) {
      console.error("Producer transport is not initialized.");
      return null;
    }

    console.log("Resuming video producer");

    // Get a new video track
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newTrack = stream.getVideoTracks()[0];

    if (!newTrack) {
      throw new Error("No video track found");
    }

    videoParams = { ...videoParams, track: newTrack };

    // Create a new producer with the new track
    videoProducer = await sendTransport.produce(videoParams);

    videoProducer.on("trackended", () => {
      console.log("New video track ended");
    });
    videoProducer.on("transportclose", () => {
      console.log("Transport for new video closed");
    });

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
    if (!sendTransport || screenProducer) return null; // Prevent multiple screen shares
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
    if (!videoProducer || videoProducer.appData.source !== "screen") return; // Add a flag to know it's a screen
    console.log("Stopping screen share");
    videoProducer.close();
    socket.emit("producer-close", { producerId: videoProducer.id });
    videoProducer = null;
  };
  ///

  const cleanup = () => {
    isClosed = true;

    // Close producers first
    if (audioProducer) {
      audioProducer.close();
      audioProducer = null;
    }
    if (videoProducer) {
      videoProducer.close();
      videoProducer = null;
    }

    // Then consumers
    consumers.forEach((consumer) => consumer.close());
    consumers.clear();
    producerToPeerMap.clear();

    // Then transports
    if (sendTransport) {
      sendTransport.close();
      sendTransport = null;
    }
    if (recvTransport) {
      recvTransport.close();
      recvTransport = null;
    }

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
    moveToRoom,
    createBreakoutRooms,
    assignPeerToRoom,
    endBreakouts,
    startBreakouts,
    exitBreakoutRoom,
    requestBreakoutState,
  };
}
