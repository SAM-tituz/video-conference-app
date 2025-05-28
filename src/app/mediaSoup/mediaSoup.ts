import io, { Socket } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";
type Transport = mediasoupClient.types.Transport;
type Producer = mediasoupClient.types.Producer;
type Consumer = mediasoupClient.types.Consumer;
type RtpCapabilities = mediasoupClient.types.RtpCapabilities;
type Device = mediasoupClient.types.Device;
type DtlsParameters = mediasoupClient.types.DtlsParameters;
type RtpParameters = mediasoupClient.types.RtcpParameters;

type TransportParams = {
  id: string;
  iceParameters: mediasoupClient.types.IceParameters;
  iceCandidates: mediasoupClient.types.IceCandidate[];
  dtlsParameters: DtlsParameters;
  sctpParameters?: mediasoupClient.types.SctpParameters;
};
type ConsumerTransportData = {
  consumerTransport: Transport;
  serverConsumerTransportId: string;
  producerId: string;
  consumer: Consumer;
};
type MediaSoupClientOptions = {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (id:string,stream: MediaStream) => void;
   onRemoteStreamRemoved: (id: string) => void;
};


let socket: Socket | null = null;

export default function mediaSoupClient(
  roomName: string,
  options: MediaSoupClientOptions
) {
  let device: Device | null = null;
  let rtpCapabilities: RtpCapabilities | null = null;
  let producerTransport: Transport | null = null;
  let consumerTransports: ConsumerTransportData[] = [];
  let audioProducer: Producer | null = null;
  let videoProducer: Producer | null = null;
  let audioParams: { track?: MediaStreamTrack } = {};
  let videoParams: { track?: MediaStreamTrack; params?: any } = {};
  let consumingTransports: string[] = [];

  let params = {
    // mediasoup params
    encodings: [
      { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" },
      { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" },
      { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" },
    ],
    codecOptions: { videoGoogleStartBitrate: 1000 },
  };
  videoParams = { ...videoParams, params };
  const cleanup = () => {
    socket?.disconnect();
    producerTransport?.close();
    consumerTransports.forEach(({ consumerTransport, consumer }) => {
      consumerTransport.close();
      consumer.close();
    });
    audioProducer?.close();
    videoProducer?.close();
    socket = null;
  };
  if (!socket) {
    socket = io("http://localhost:8000/mediasoup", {
      autoConnect: true,
      reconnectionAttempts: 3,
    });
   

    //
    const getLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { min: 640, max: 1920 },
            height: { min: 400, max: 1080 },
          },
        });
        streamSuccess(stream);
      } catch (error) {
        console.error("Error getting media devices:", error);
      }
    };
    //
    const streamSuccess = (stream: MediaStream) => {
      // localVideo.srcObject = stream;
      options.onLocalStream(stream);

      audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
      videoParams = { track: stream.getVideoTracks()[0], ...videoParams };

      joinRoom();
    };
    //
    const joinRoom = () => {
      if (!socket) return;
      // console.log({roomName})
      socket.emit(
        "joinRoom",
        { roomName },
        (data: { rtpCapabilities: RtpCapabilities }) => {
          console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
          // we assign to local variable and will be used when
          // loading the client Device (see createDevice above)
          rtpCapabilities = data.rtpCapabilities;

          // once we have rtpCapabilities from the Router, create Device
          createDevice();
        }
      );
    };
    //
    const createDevice = async () => {
      try {
        if (!rtpCapabilities) {
          throw new Error("rtpCapabilities is null");
        }
        device = new mediasoupClient.Device();
        // Loads the device with RTP capabilities of the Router (server side)
        await device.load({
          // see getRtpCapabilities() below
          routerRtpCapabilities: rtpCapabilities,
        });
        console.log("Device RTP Capabilities", device.rtpCapabilities);

        // once the device loads, create transport
        createSendTransport();
      } catch (error) {
        console.log(error);
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          (error as { name?: string }).name === "UnsupportedError"
        )
          console.warn("browser not supported");
      }
    };
    //
    const createSendTransport = () => {
      // see server's socket.on('createWebRtcTransport', sender?, ...)
      // this is a call from Producer, so sender = true
      if (!socket) {
        console.error("Socket is null, cannot create WebRTC transport.");
        return;
      }
      socket.emit(
        "createWebRtcTransport",
        { consumer: false },
        ({ params }: { params: TransportParams }) => {
          // The server sends back params needed
          // to create Send Transport on the client side
          
          // if (params.error) {
          //   console.log(params.error);
          //   return;
          // }

          console.log("params", params);

          // creates a new WebRTC Transport to send media
          // based on the server's producer transport params
          // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
          if (!device) {
            console.error("Device is null, cannot create send transport.");
            return;
          }
          producerTransport = device.createSendTransport(params);

          // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
          // this event is raised when a first call to transport.produce() is made
          // see connectSendTransport() below
          producerTransport.on(
            "connect",
            ({ dtlsParameters }, callback, errback) => {
              try {
                // Signal local DTLS parameters to the server side transport
                // see server's socket.on('transport-connect', ...)
                if (socket) {
                  socket.emit("transport-connect", {
                    dtlsParameters,
                  });
                } else {
                  console.error(
                    "Socket is null, cannot emit transport-connect."
                  );
                }

                // Tell the transport that parameters were transmitted.
                callback();
              } catch (error) {
                errback(
                  error instanceof Error ? error : new Error(String(error))
                );
              }
            }
          );

          producerTransport.on("produce", (parameters, callback, errback) => {
            console.log(parameters);

            try {
              // tell the server to create a Producer
              // with the following parameters and produce
              // and expect back a server side producer id
              // see server's socket.on('transport-produce', ...)
              if (socket) {
                socket.emit(
                  "transport-produce",
                  {
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData,
                  },
                  ({
                    id,
                    producersExist,
                  }: {
                    id: string;
                    producersExist: boolean;
                  }) => {
                    // Tell the transport that parameters were transmitted and provide it with the
                    // server side producer's id.
                    callback({ id });

                    // if producers exist, then join room
                    if (producersExist) getProducers();
                  }
                );
              } else {
                console.error("Socket is null, cannot emit transport-produce.");
              }
            } catch (error) {
              errback(
                error instanceof Error ? error : new Error(String(error))
              );
            }
          });

          connectSendTransport();
        }
      );
    };
    //
    const getProducers = () => {
      if (!socket) {
        console.error("Socket is null, cannot get producers.");
        return;
      }
      socket.emit("getProducers", (producerIds: any) => {
        console.log("producerid", producerIds);
        // for each of the producer create a consumer
        // producerIds.forEach(id => signalNewConsumerTransport(id))
        producerIds.forEach(signalNewConsumerTransport);
      });
    };
    //
    const connectSendTransport = async () => {
      // we now call produce() to instruct the producer transport
      // to send media to the Router
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
      // this action will trigger the 'connect' and 'produce' events above

      if (!producerTransport) {
        console.error("producerTransport is null, cannot produce audio/video.");
        return;
      }
      audioProducer = await producerTransport.produce(audioParams);
      videoProducer = await producerTransport.produce(videoParams);

      audioProducer.on("trackended", () => {
        console.log("audio track ended");

        // close audio track
      });

      audioProducer.on("transportclose", () => {
        console.log("audio transport ended");

        // close audio track
      });

      videoProducer.on("trackended", () => {
        console.log("video track ended");

        // close video track
      });

      videoProducer.on("transportclose", () => {
        console.log("video transport ended");

        // close video track
      });
    };
    //
    const signalNewConsumerTransport = async (remoteProducerId: string) => {
      //check if we are already consuming the remoteProducerId
      if (consumingTransports.includes(remoteProducerId)) return;
      consumingTransports.push(remoteProducerId);

      if (!socket) {
        console.error("Socket is null, cannot create WebRTC transport.");
        return;
      }
       socket.emit(
        "createWebRtcTransport",
        { consumer: true },
        ({ params }: { params: any }) => {
          // The server sends back params needed
          // to create Send Transport on the client side
          if (params.error) {
            console.log(params.error);
            return;
          }
          console.log(`PARAMS... ${params}`);

          let consumerTransport;
          try {
            if (!device) {
              console.error("Device is null, cannot create receive transport.");
              return;
            }
            consumerTransport = device.createRecvTransport(params);
          } catch (error) {
            // exceptions:
            // {InvalidStateError} if not loaded
            // {TypeError} if wrong arguments.
            console.log(error);
            return;
          }

          consumerTransport.on(
            "connect",
            ({ dtlsParameters }, callback, errback) => {
              try {
                // Signal local DTLS parameters to the server side transport
                // see server's socket.on('transport-recv-connect', ...)
                if (socket) {
                  socket.emit("transport-recv-connect", {
                    dtlsParameters,
                    serverConsumerTransportId: params.id,
                  });
                } else {
                  console.error(
                    "Socket is null, cannot emit transport-recv-connect."
                  );
                }

                // Tell the transport that parameters were transmitted.
                callback();
              } catch (error) {
                // Tell the transport that something was wrong
                errback(
                  error instanceof Error ? error : new Error(String(error))
                );
              }
            }
          );

          connectRecvTransport(consumerTransport, remoteProducerId, params.id);
        }
      );
    };
    //
    // server informs the client of a new producer just joined
    socket.on("new-producer", ({ producerId }) =>
      signalNewConsumerTransport(producerId)
    );

  

    const connectRecvTransport = async (
      consumerTransport: Transport,
      remoteProducerId: string,
      serverConsumerTransportId: string
    ) => {
      // for consumer, we need to tell the server first
      // to create a consumer based on the rtpCapabilities and consume
      // if the router can consume, it will send back a set of params as below
      if (!socket) {
        console.error("Socket is null, cannot consume.");
        return;
      }
      if (!device) {
        console.error("Device is null, cannot consume.");
        return;
      }
      socket.emit(
        "consume",
        {
          rtpCapabilities: device.rtpCapabilities,
          remoteProducerId,
          serverConsumerTransportId,
        },
        async ({ params }: { params: any }) => {
          if (params.error) {
            console.log("Cannot Consume");
            return;
          }

          console.log(`Consumer Params ${params}`);
          // then consume with the local consumer transport
          // which creates a consumer
          const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters,
          });

          consumerTransports = [
            ...consumerTransports,
            {
              consumerTransport,
              serverConsumerTransportId: params.id,
              producerId: remoteProducerId,
              consumer,
            },
          ];
          // 
  // const stream = new MediaStream([consumer.track]);
  //         options.onRemoteStream(remoteProducerId, stream);
// \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\
          // create a new div element for the new consumer media
          const newElem = document.createElement("div");
          newElem.setAttribute("id", `td-${remoteProducerId}`);

          if (params.kind == "audio") {
            //append to the audio container
            newElem.innerHTML =
              '<audio id="' + remoteProducerId + '" autoplay></audio>';
          } else {
            //append to the video container
            newElem.setAttribute("class", "remoteVideo");
            newElem.innerHTML =
              '<video id="' +
              remoteProducerId +
              '" autoplay class="video" ></video>';
          }

          videoContainer.appendChild(newElem);

          // destructure and retrieve the video track from the producer
          const { track } = consumer;

          document.getElementById(remoteProducerId).srcObject = new MediaStream(
            [track]
          );
          const stream = new MediaStream([consumer.track]);
          options.onRemoteStream(remoteProducerId, stream);
// \\\\\\\\\\\\\\\\\\\\\\\\\\\\
          // the server consumer started with media paused
          // so we need to inform the server to resume
          if (socket) {
            socket.emit("consumer-resume", {
              serverConsumerId: params.serverConsumerId,
            });
          } else {
            console.error("Socket is null, cannot emit consumer-resume.");
          }
        }
      );
    };
    console.log("ct", consumingTransports);

    socket.on("producer-closed", ({ remoteProducerId }) => {
      // server notification is received when a producer is closed
      // we need to close the client-side consumer and associated transport
      const producerToClose = consumerTransports.find(
        (transportData) => transportData.producerId === remoteProducerId
      );
      if(producerToClose){
      producerToClose.consumerTransport.close();
      producerToClose.consumer.close();
      }
      // remove the consumer transport from the list
      consumerTransports = consumerTransports.filter(
        (transportData) => transportData.producerId !== remoteProducerId
      );
// options.onRemoteStreamRemoved(remoteProducerId)
      // remove the video div element
      videoContainer.removeChild(
        document.getElementById(`td-${remoteProducerId}`)
      );
    });
     socket.on("connection-success", ({ socketId }) => {
      console.log(socketId);
      getLocalStream();
    });
    socket.on("disconnect", () => {
      console.log("Disconnected");
      cleanup();
    });
    //
  }
  return { cleanup };
}
