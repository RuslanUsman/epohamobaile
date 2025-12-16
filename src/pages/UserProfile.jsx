// src/pages/UserProfile.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import UserAvatar from '../components/UserAvatar';
import { FaRegCommentDots, FaPhoneAlt, FaVideo } from 'react-icons/fa';
import '../styles/global.css';

export default function UserProfile() {
  const { id } = useParams(); // id профиля собеседника из URL
  const [profile, setProfile] = useState(null);
  const [me, setMe] = useState(null); // текущий авторизованный пользователь
  const [loading, setLoading] = useState(true);
  const [showCallOptions, setShowCallOptions] = useState(false);
  const [inCall, setInCall] = useState(false);
  const navigate = useNavigate();

  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callsChannelRef = useRef(null);

  // получаем текущего юзера
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted) return;
      setMe(user || null);
    });
    return () => { mounted = false; };
  }, []);

  // загрузка профиля собеседника
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (err) {
        console.error("Ошибка загрузки профиля:", err.message);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [id]);

  // подписка на offer/answer/ice/call/endCall — один общий канал
  useEffect(() => {
    if (!me?.id) return; // ждём текущего пользователя

    callsChannelRef.current = supabase.channel("calls");

    const channel = callsChannelRef.current
      .on("broadcast", { event: "offer" }, async (payload) => {
        const { to, from, sdp, callType, fromName } = payload.payload;
        // принимаем входящий offer, если он адресован мне
        if (to === me.id) {
          // создаём PC c STUN
          peerRef.current = new RTCPeerConnection({
            iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
          });

          peerRef.current.ontrack = (event) => {
            remoteVideoRef.current.srcObject = event.streams[0];
          };

          peerRef.current.onicecandidate = (event) => {
            if (event.candidate) {
              callsChannelRef.current.send({
                type: "broadcast",
                event: "ice",
                payload: { from: me.id, to: from, candidate: event.candidate },
              });
            }
          };

          const constraints = { audio: true, video: callType === "video" };
          const localStream = await navigator.mediaDevices.getUserMedia(constraints);
          localStream.getTracks().forEach(track => peerRef.current.addTrack(track, localStream));
          localVideoRef.current.srcObject = localStream;

          await peerRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(answer);

          callsChannelRef.current.send({
            type: "broadcast",
            event: "answer",
            payload: { from: me.id, to: from, sdp: answer },
          });

          setInCall(true);
        }
      })
      .on("broadcast", { event: "answer" }, async (payload) => {
        const { to, sdp } = payload.payload;
        // инициатор получает answer, если он адресован ему
        if (to === me.id && peerRef.current) {
          try {
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
          } catch (err) {
            console.error("Ошибка setRemoteDescription(answer):", err);
          }
        }
      })
      .on("broadcast", { event: "ice" }, async (payload) => {
        const { to, candidate } = payload.payload;
        if (to === me.id && peerRef.current && candidate) {
          try {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Ошибка addIceCandidate:", err);
          }
        }
      })
      .on("broadcast", { event: "call" }, (payload) => {
        const { to, fromName, callType } = payload.payload;
        if (to === me.id) {
          alert(`Входящий ${callType} звонок от ${fromName}`);
        }
      })
      .on("broadcast", { event: "endCall" }, (payload) => {
        const { to } = payload.payload;
        if (to === me.id) {
          alert("Звонок завершён собеседником");
          endCall(false); // без отправки ответного endCall
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      endCall(false);
    };
  }, [me?.id]);

  async function startCall(type) {
    try {
      if (!me?.id || !profile?.id) return;

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('telegram_username')
        .eq('id', me.id)
        .single();

      // создаём PC c STUN
      peerRef.current = new RTCPeerConnection({
        iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
      });

      peerRef.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };

      peerRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          callsChannelRef.current?.send({
            type: "broadcast",
            event: "ice",
            payload: { from: me.id, to: profile.id, candidate: event.candidate },
          });
        }
      };

      const constraints = { audio: true, video: type === "video" };
      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.getTracks().forEach(track => peerRef.current.addTrack(track, localStream));
      localVideoRef.current.srcObject = localStream;

      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);

      // уведомление
      callsChannelRef.current?.send({
        type: "broadcast",
        event: "call",
        payload: {
          from: me.id,
          fromName: myProfile?.telegram_username || me.id,
          to: profile.id,
          callType: type,
        },
      });

      // offer
      callsChannelRef.current?.send({
        type: "broadcast",
        event: "offer",
        payload: {
          from: me.id,
          fromName: myProfile?.telegram_username || me.id,
          to: profile.id,
          callType: type,
          sdp: offer,
        },
      });

      setInCall(true);
    } catch (err) {
      console.error("Ошибка вызова:", err.message);
    }
  }

  // endCall: параметр notify управляет отправкой события собеседнику
  function endCall(notify = true) {
    try {
      if (peerRef.current) {
        peerRef.current.onicecandidate = null;
        peerRef.current.ontrack = null;
        peerRef.current.close();
        peerRef.current = null;
      }
      if (localVideoRef.current?.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current?.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
        remoteVideoRef.current.srcObject = null;
      }
      setInCall(false);
      setShowCallOptions(false);

      if (notify && callsChannelRef.current && profile?.id && me?.id) {
        callsChannelRef.current.send({
          type: "broadcast",
          event: "endCall",
          payload: { to: profile.id },
        });
      }
    } catch (e) {
      console.warn("Ошибка завершения вызова:", e);
    }
  }

  if (loading) return <p>Загрузка...</p>;
  if (!profile) return <p>Профиль не найден</p>;

  return (
    <div className="userProfile-container">
      <h1>Профиль пользователя</h1>
      <UserAvatar userId={profile.id} avatarPath={profile.avatar_path} size={120} />
      <p><strong>Имя:</strong> {profile.username}</p>

      <div className="userProfile-chat">
        <button onClick={() => navigate(`/chat/${profile.id}`)}>
          <FaRegCommentDots /> Написать
        </button>
      </div>

      <div className="userProfile-call">
        {!inCall ? (
          !showCallOptions ? (
            <button onClick={() => setShowCallOptions(true)}>📞 Вызов</button>
          ) : (
            <div className="call-options">
              <button onClick={() => startCall("audio")}>
                <FaPhoneAlt /> Аудио вызов
              </button>
              <button onClick={() => startCall("video")}>
                <FaVideo /> Видео вызов
              </button>
            </div>
          )
        ) : (
          <button onClick={() => endCall(true)} className="end-call-btn">❌ Завершить вызов</button>
        )}
      </div>

      <div className="video-container">
        <video ref={localVideoRef} autoPlay muted playsInline />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
    </div>
  );
}
