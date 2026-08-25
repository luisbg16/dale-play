import { useEffect, useState } from 'react'

import {
  Users,
  Plus,
  LogIn,
  Copy,
  Crown
} from 'lucide-react'

import {
  useNavigate
} from 'react-router-dom'

import {
  supabase,
  supabaseReady
} from '../lib/supabase'


function generateRoomCode() {

  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  let code = ''

  for (let i = 0; i < 5; i++) {

    code += chars[
      Math.floor(
        Math.random() *
        chars.length
      )
    ]
  }

  return code
}


export default function RoomsPage() {

  const navigate =
    useNavigate()

  const [mode, setMode] =
    useState('menu')

  const [playerName, setPlayerName] =
    useState('')

  const [roomCode, setRoomCode] =
    useState('')

  const [room, setRoom] =
    useState(null)

  const [players, setPlayers] =
    useState([])

  const [
    currentPlayer,
    setCurrentPlayer
  ] = useState(null)

  const [message, setMessage] =
    useState('')

  const [busy, setBusy] =
    useState(false)


  /*
  ==========================================
  REALTIME
  ==========================================
  */

  useEffect(() => {

    if (!room?.id) {
      return
    }


    loadPlayers(
      room.id
    )


    const channel =
      supabase
        .channel(
          `lobby-${room.id}-${crypto.randomUUID()}`
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${room.id}`
          },
          () => {

            loadPlayers(
              room.id
            )
          }
        )

        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter:
              `id=eq.${room.id}`
          },
          payload => {

            const updatedRoom =
              payload.new

            setRoom(
              updatedRoom
            )


            if (
              updatedRoom.status ===
              'playing'
            ) {

              navigate(
                `/salas/${updatedRoom.code}/juego`
              )
            }
          }
        )

        .subscribe()


    return () => {

      supabase.removeChannel(
        channel
      )
    }

  }, [
    room?.id,
    navigate
  ])


  /*
  ==========================================
  JUGADORES
  ==========================================
  */

  async function loadPlayers(
    roomId
  ) {

    const {
      data,
      error
    } =
      await supabase
        .from('room_players')
        .select('*')
        .eq(
          'room_id',
          roomId
        )
        .order(
          'joined_at'
        )


    if (error) {

      console.error(
        error
      )

      return
    }


    setPlayers(
      data || []
    )
  }


  /*
  ==========================================
  GUARDAR JUGADOR EN ESTE NAVEGADOR
  ==========================================
  */

  function savePlayerSession(
    roomData,
    playerData
  ) {

    sessionStorage.setItem(
      `daleplay-room-${roomData.code}`,
      JSON.stringify({
        room_id:
          roomData.id,

        player_id:
          playerData.id,

        player_name:
          playerData.player_name,

        is_host:
          playerData.is_host
      })
    )
  }


  /*
  ==========================================
  CREAR SALA
  ==========================================
  */

  async function createRoom() {

    if (!playerName.trim()) {

      setMessage(
        'Escribe tu nombre.'
      )

      return
    }


    setBusy(true)
    setMessage('')


    try {

      const code =
        generateRoomCode()


      const {
        data: roomData,
        error: roomError
      } =
        await supabase
          .from('rooms')
          .insert({

            code,

            host_name:
              playerName
                .trim()
                .slice(
                  0,
                  25
                ),

            status:
              'waiting',

            current_round:
              0,

            current_song_id:
              null,

            total_rounds:
              5
          })
          .select()
          .single()


      if (roomError) {
        throw roomError
      }


      const {
        data: hostPlayer,
        error: playerError
      } =
        await supabase
          .from('room_players')
          .insert({

            room_id:
              roomData.id,

            player_name:
              playerName
                .trim()
                .slice(
                  0,
                  25
                ),

            is_host:
              true
          })
          .select()
          .single()


      if (playerError) {
        throw playerError
      }


      savePlayerSession(
        roomData,
        hostPlayer
      )


      setCurrentPlayer(
        hostPlayer
      )

      setRoom(
        roomData
      )

      setRoomCode(
        roomData.code
      )

      setMode(
        'lobby'
      )


    } catch (error) {

      console.error(
        error
      )

      setMessage(
        error.message ||
        'No se pudo crear la sala.'
      )

    } finally {

      setBusy(false)
    }
  }


  /*
  ==========================================
  ENTRAR A SALA
  ==========================================
  */

  async function joinRoom() {

    if (!playerName.trim()) {

      setMessage(
        'Escribe tu nombre.'
      )

      return
    }


    if (
      roomCode.trim().length < 4
    ) {

      setMessage(
        'Escribe el código de la sala.'
      )

      return
    }


    setBusy(true)
    setMessage('')


    try {

      const cleanCode =
        roomCode
          .trim()
          .toUpperCase()


      const {
        data: roomData,
        error: roomError
      } =
        await supabase
          .from('rooms')
          .select('*')
          .eq(
            'code',
            cleanCode
          )
          .single()


      if (
        roomError ||
        !roomData
      ) {

        throw new Error(
          'No encontré esa sala.'
        )
      }


      if (
        roomData.status !==
        'waiting'
      ) {

        throw new Error(
          'La partida ya comenzó.'
        )
      }


      const {
        count
      } =
        await supabase
          .from('room_players')
          .select(
            '*',
            {
              count: 'exact',
              head: true
            }
          )
          .eq(
            'room_id',
            roomData.id
          )


      if (
        count >=
        roomData.max_players
      ) {

        throw new Error(
          'La sala está llena.'
        )
      }


      const {
        data: joinedPlayer,
        error: joinError
      } =
        await supabase
          .from('room_players')
          .insert({

            room_id:
              roomData.id,

            player_name:
              playerName
                .trim()
                .slice(
                  0,
                  25
                ),

            is_host:
              false
          })
          .select()
          .single()


      if (joinError) {
        throw joinError
      }


      savePlayerSession(
        roomData,
        joinedPlayer
      )


      setCurrentPlayer(
        joinedPlayer
      )

      setRoom(
        roomData
      )

      setRoomCode(
        cleanCode
      )

      setMode(
        'lobby'
      )


    } catch (error) {

      console.error(
        error
      )

      setMessage(
        error.message ||
        'No pudimos entrar.'
      )

    } finally {

      setBusy(false)
    }
  }


  /*
  ==========================================
  INICIAR PARTIDA
  ==========================================
  */

  async function startGame() {

    if (
      !currentPlayer?.is_host
    ) {

      setMessage(
        'Solo el host puede iniciar.'
      )

      return
    }


    if (
      players.length < 2
    ) {

      setMessage(
        'Se necesitan al menos 2 jugadores.'
      )

      return
    }


    setBusy(true)
    setMessage('')


    try {

      /*
      Traemos canciones disponibles.
      */

      const {
        data: songs,
        error: songsError
      } =
        await supabase
          .from('songs')
          .select('id')
          .eq(
            'active',
            true
          )


      if (songsError) {
        throw songsError
      }


      if (!songs?.length) {

        throw new Error(
          'No hay canciones activas.'
        )
      }


      /*
      Elegimos la primera canción.
      */

      const randomSong =
        songs[
          Math.floor(
            Math.random() *
            songs.length
          )
        ]


      const {
        data: updatedRoom,
        error
      } =
        await supabase
          .from('rooms')
          .update({

            status:
              'playing',

            current_round:
              1,

            current_song_id:
              randomSong.id
          })
          .eq(
            'id',
            room.id
          )
          .select()
          .single()


      if (error) {
        throw error
      }


      setRoom(
        updatedRoom
      )


      /*
      El host entra inmediatamente.
      Los demás entran por Realtime.
      */

      navigate(
        `/salas/${room.code}/juego`
      )


    } catch (error) {

      console.error(
        error
      )

      setMessage(
        error.message ||
        'No se pudo iniciar la partida.'
      )

    } finally {

      setBusy(false)
    }
  }


  function copyCode() {

    navigator.clipboard
      .writeText(
        room.code
      )

    setMessage(
      'Código copiado.'
    )
  }


  if (!supabaseReady) {

    return (

      <section className="rooms-wrap">

        <div className="notice">
          Configura Supabase primero.
        </div>

      </section>
    )
  }


  /*
  ==========================================
  LOBBY
  ==========================================
  */

  if (
    mode === 'lobby' &&
    room
  ) {

    return (

      <section className="rooms-wrap">

        <div className="room-lobby-card">


          <span className="room-eyebrow">
            Sala privada
          </span>


          <h1>
            Código de sala
          </h1>


          <button
            className="room-code"
            onClick={
              copyCode
            }
          >

            {room.code}

            <Copy
              size={19}
            />

          </button>


          <p className="muted">
            Compartí este código con tus amigos.
          </p>


          <div className="room-player-header">

            <h2>

              <Users />

              Jugadores

            </h2>


            <span>

              {players.length}
              /
              {room.max_players}

            </span>

          </div>


          <div className="room-player-list">

            {players.map(
              player => (

                <div
                  className="room-player"
                  key={
                    player.id
                  }
                >

                  <div className="room-player-avatar">

                    {
                      player.player_name
                        .charAt(0)
                        .toUpperCase()
                    }

                  </div>


                  <strong>

                    {player.player_name}

                  </strong>


                  {player.is_host && (

                    <span className="host-badge">

                      <Crown
                        size={14}
                      />

                      Host

                    </span>

                  )}

                </div>

              )
            )}

          </div>


          {currentPlayer?.is_host ? (

            <div className="room-start-area">

              <button
                className="primary room-start-btn"
                disabled={
                  players.length < 2 ||
                  busy
                }
                onClick={
                  startGame
                }
              >

                {busy
                  ? 'Iniciando...'
                  : 'Iniciar partida'}

              </button>


              {players.length < 2 ? (

                <small>

                  Esperando al menos otro jugador...

                </small>

              ) : (

                <small className="room-ready">

                  ✓ Todo listo para jugar

                </small>

              )}

            </div>

          ) : (

            <div className="room-waiting">

              Esperando a que el host inicie la partida...

            </div>

          )}


          {message && (

            <div className="message">

              {message}

            </div>

          )}

        </div>

      </section>
    )
  }


  /*
  ==========================================
  MENÚ
  ==========================================
  */

  return (

    <section className="rooms-wrap">


      <div className="rooms-hero">

        <span className="room-eyebrow">

          Modo privado

        </span>


        <h1>

          Juega con tus amigos

        </h1>


        <p>

          Crea una sala privada
          o entra con un código.

        </p>

      </div>


      <div className="rooms-card">


        <label>

          Tu nombre

          <input
            maxLength={25}
            value={
              playerName
            }
            placeholder="Ej. Luis"
            onChange={
              e =>
                setPlayerName(
                  e.target.value
                )
            }
          />

        </label>


        <button
          className="primary room-main-btn"
          onClick={
            createRoom
          }
          disabled={
            busy
          }
        >

          <Plus />

          Crear sala

        </button>


        <div className="room-divider">

          <span>
            o
          </span>

        </div>


        <label>

          Código de sala

          <input
            maxLength={5}
            value={
              roomCode
            }
            placeholder="ABCDE"
            onChange={
              e =>
                setRoomCode(
                  e.target.value
                    .toUpperCase()
                )
            }
          />

        </label>


        <button
          className="room-secondary-btn"
          onClick={
            joinRoom
          }
          disabled={
            busy
          }
        >

          <LogIn />

          Entrar a sala

        </button>


        {message && (

          <div className="message">

            {message}

          </div>

        )}

      </div>

    </section>
  )
}