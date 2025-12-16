// src/components/IncomingCall.jsx
import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

export default function IncomingCall({ currentUserId }) {
  const [incomingCall, setIncomingCall] = useState(null); // данные входящего вызова
  const [activeCall, setActiveCall] = useState(false);
  const [activeCallType, setActiveCallType] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callsChannelRef = useRef(null);

  // подписка на канал
  useEffect(() => {
    if (!currentUserId) return;

    callsChannelRef.current = supabase.channel("calls");

    const channel = callsChannelRef.current
      .on("broadcast", { event: "call" }, (payload) => {
        const { from, to, callType, fromName } = payload.payload;
        if (to === currentUserId) {
          setIncomingCall({ from, fromName, callType });
        }
      })
      .on("broadcast", { event: "offer" }, (payload) => {
        const { from, to, sdp, callType, fromName } = payload.payload;
        if (to === currentUserId) {
          setIncomingCall({ from, fromName, callType, sdp });
        }
      })
      .on("broadcast", { event: "answer" }, async (payload) => {
        const { to, sdp } = payload.payload;
        if (to === currentUserId && peerRef.current) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      })
      .on("broadcast", { event: "ice" }, async (payload) => {
        const { to, candidate } = payload.payload;
        if (to === currentUserId && peerRef.current && candidate) {
          try {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Ошибка ICE:", err);
          }
        }
      })
      .on("broadcast", { event: "endCall" }, (payload) => {
        const { to } = payload.payload;
        if (to === currentUserId) {
          endCall(false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      cleanupConnection();
    };
  }, [currentUserId]);

  async function acceptCall() {
    if (!incomingCall?.sdp) {
      console.warn("Нет SDP для принятия вызова");
      return;
    }

    const { from, callType, sdp } = incomingCall;
    setActiveCall(true);
    setActiveCallType(callType);

    peerRef.current = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });

    peerRef.current.ontrack = (event) => {
      const stream = event.streams[0];
      if (callType === "video") {
        remoteVideoRef.current.srcObject = stream;
      } else {
        remoteAudioRef.current.srcObject = stream;
      }
    };

    peerRef.current.onicecandidate = (event) => {
      if (event.candidate && callsChannelRef.current) {
        callsChannelRef.current.send({
          type: "broadcast",
          event: "ice",
          payload: { from: currentUserId, to: from, candidate: event.candidate },
        });
      }
    };

    const constraints = { audio: true, video: callType === "video" };
    try {
      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = localStream;
      localStream.getTracks().forEach(track => peerRef.current.addTrack(track, localStream));

      if (callType === "video") {
        localVideoRef.current.srcObject = localStream;
      }
    } catch (err) {
      console.error("Ошибка доступа к устройствам:", err);
    }

    await peerRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await peerRef.current.createAnswer();
    await peerRef.current.setLocalDescription(answer);

    callsChannelRef.current.send({
      type: "broadcast",
      event: "answer",
      payload: { from: currentUserId, to: from, sdp: answer },
    });

    setIncomingCall(null);
  }

  function declineCall() {
    if (incomingCall?.from && callsChannelRef.current) {
      callsChannelRef.current.send({
        type: "broadcast",
        event: "endCall",
        payload: { to: incomingCall.from },
      });
    }
    setIncomingCall(null);
    cleanupConnection();
    setActiveCall(false);
    setActiveCallType(null);
  }

  function endCall(notify = true) {
    if (notify && incomingCall?.from && callsChannelRef.current) {
      callsChannelRef.current.send({
        type: "broadcast",
        event: "endCall",
        payload: { to: incomingCall.from },
      });
    }
    cleanupConnection();
    setActiveCall(false);
    setActiveCallType(null);
    setIncomingCall(null);
  }

  function cleanupConnection() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }

  if (!incomingCall && !activeCall) return null;

  return (
    <div className="incoming-call">
      {incomingCall && (
        <>
          <p>
            📞 Входящий {incomingCall.callType === "video" ? "видеозвонок" : "аудиозвонок"} от{" "}
            <strong>{incomingCall.fromName}</strong>
          </p>
          <button onClick={acceptCall}>Принять</button>
          <button onClick={declineCall}>Отклонить</button>
        </>
      )}

      {activeCall && (
        <>
          <p>🔗 Звонок активен</p>
          <button onClick={() => endCall(true)}>Завершить звонок</button>
          <div className="media-container">
            {activeCallType === "video" && (
              <>
                <video ref={localVideoRef} autoPlay muted playsInline />
                <video ref={remoteVideoRef} autoPlay playsInline />
              </>
            )}
            {activeCallType === "audio" && (
              <audio ref={remoteAudioRef} autoPlay controls />
            )}
          </div>
        </>
      )}
    </div>
  );
}
