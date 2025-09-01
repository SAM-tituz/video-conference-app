import io, { Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
type Transport = mediasoupClient.types.Transport;
type Producer = mediasoupClient.types.Producer;
type Consumer = mediasoupClient.types.Consumer;
type Device = mediasoupClient.types.Device;

type MediaSoupClientOptions = {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (
    id: string,
    stream: MediaStream,
    kind: "audio" | "video"
  ) => void;
  onRemoteStreamRemoved: (id: string) => void;
};

let screenProducer: Producer | null = null;

export default function mediaSoupClient(
  roomName: string,
  options: MediaSoupClientOptions
) {
  const socket: Socket = io("http://localhost:8000/mediasoup");
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
  const consumers = new Map<string, Consumer>();

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    options.onLocalStream(stream);
    audioParams.track = stream.getAudioTracks()[0];
    videoParams.track = stream.getVideoTracks()[0];
    joinRoom();
  };

  const joinRoom = () => {
    socket.emit(
      "joinRoom",
      { roomName },
      (data: { rtpCapabilities: mediasoupClient.types.RtpCapabilities }) => {
        createDevice(data.rtpCapabilities);
      }
    );
  };

  const createDevice = async (
    rtpCapabilities: mediasoupClient.types.RtpCapabilities
  ) => {
    device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    await createSendTransport();
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
    socket.emit("getProducers", (producerIds: string[]) =>
      producerIds.forEach(consumeStream)
    );
  };

  const consumeStream = async (producerId: string) => {
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
        const stream = new MediaStream([consumer.track]);
        options.onRemoteStream(producerId, stream, consumer.kind);
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
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) return null;

    screenProducer = await sendTransport.produce({ track });

    // When the user clicks the browser's "Stop sharing" button
    track.onended = () => {
      console.log("Screen share track ended");
      stopScreenShare();
    };

    return stream; // Return the stream to display locally
  };

  const stopScreenShare = () => {
    if (!screenProducer) return;
    console.log("Stopping screen share");
    screenProducer.close();
    socket.emit("producer-close", { producerId: screenProducer.id });
    screenProducer = null;
  };
  ///

  const cleanup = () => {
    socket.disconnect();
    sendTransport?.close();
    recvTransport?.close();
  };

  socket.on("connection-success", () => getLocalStream());
  socket.on("new-producer", ({ producerId }) => consumeStream(producerId));
  socket.on("producer-closed", ({ remoteProducerId }) => {
    const consumer = consumers.get(remoteProducerId);
    if (consumer) {
      consumer.close();
      consumers.delete(remoteProducerId);
      options.onRemoteStreamRemoved(remoteProducerId);
    }
  });
  return {
    cleanup,
    stopVideoProducer,
    resumeVideoProducer,
    stopAudioProducer,
    resumeAudioProducer,
    startScreenShare, 
    stopScreenShare,
  };
}
