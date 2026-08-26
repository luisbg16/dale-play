import {
  useEffect,
  useState
} from 'react'

import {
  useNavigate
} from 'react-router-dom'

import {
  Users,
  Plus,
  LogIn,
  Copy,
  Play,
  Crown,
  Gamepad2
} from 'lucide-react'

import {
  supabase
} from '../lib/supabase'


function generateRoomCode() {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  let code = ''

  for (
    let i = 0;
    i < 5;
    i += 1
  ) {
    code +=
      chars[
        Math.floor(
          Math.random() *
          chars.length
        )
      ]
  }

  return code
}


/*
Elegimos una posición compartida.

Todos los jugadores reciben
exactamente este mismo segundo.
*/
function generateClipStart() {
  const min = 10
  const max = 55

  return Math.floor(
    Math.random() *
    (max - min + 1)
  ) + min
}


export default function RoomsPage() {
  const navigate =
    useNavigate()


  const [hostName, setHostName] =
    useState('')

  const [totalRounds, setTotalRounds] =
    useState(5)

  const [creating, setCreating] =
    useState(false)


  const [joinName, setJoinName] =
    useState('')

  const [joinCode, setJoinCode] =
    useState('')

  const [joining, setJoining] =
    useState(false)


  const [room, setRoom] =
    useState(null)

  const [
    currentPlayer,
    setCurrentPlayer
  ] = useState(null)

  const [players, setPlayers] =
    useState([])

  const [message, setMessage] =
    useState('')


  /*
  =====================================
  CREAR SALA
  =====================================
  */

  async function createRoom() {
    if (!hostName.trim()) {
      setMessage(
        'Escribe tu nombre.'
      )

      return
    }


    const rounds =
      Math.min(
        30,
        Math.max(
          1,
          Number(totalRounds) ||
          5
        )
      )


    setCreating(true)

    setMessage('')


    try {
      let createdRoom =
        null


      for (
        let attempt = 0;
        attempt < 5;
        attempt += 1
      ) {
        const code =
          generateRoomCode()


        const {
          data,
          error
        } =
          await supabase
            .from('rooms')
            .insert({
              code,

              host_name:
                hostName
                  .trim()
                  .slice(
                    0,
                    30
                  ),

              status:
                'waiting',

              max_players:
                8,

              total_rounds:
                rounds,

              current_round:
                0,

              current_song_id:
                null,

              round_started_at:
                null,

              clip_start:
                0
            })
            .select()
            .single()


        if (!error) {
          createdRoom =
            data

          break
        }


        if (
          error.code !==
          '23505'
        ) {
          throw error
        }
      }


      if (!createdRoom) {
        throw new Error(
          'No se pudo generar la sala.'
        )
      }


      const {
        data: playerData,
        error: playerError
      } =
        await supabase
          .from('room_players')
          .insert({
            room_id:
              createdRoom.id,

            player_name:
              hostName
                .trim()
                .slice(
                  0,
                  30
                ),

            score:
              0,

            is_host:
              true
          })
          .select()
          .single()


      if (playerError) {
        throw playerError
      }


      const sessionData = {
        room_id:
          createdRoom.id,

        player_id:
          playerData.id,

        player_name:
          playerData.player_name,

        is_host:
          true
      }


      sessionStorage.setItem(
        `daleplay-room-${createdRoom.code}`,
        JSON.stringify(
          sessionData
        )
      )


      setRoom(
        createdRoom
      )

      setCurrentPlayer(
        sessionData
      )

      setPlayers([
        playerData
      ])


    } catch (error) {
      console.error(error)

      setMessage(
        error.message ||
        'No se pudo crear la sala.'
      )

    } finally {
      setCreating(false)
    }
  }


  /*
  =====================================
  UNIRSE
  =====================================
  */

  async function joinRoom() {
    if (!joinName.trim()) {
      setMessage(
        'Escribe tu nombre.'
      )

      return
    }


    const normalizedCode =
      joinCode
        .trim()
        .toUpperCase()


    if (
      normalizedCode.length <
      4
    ) {
      setMessage(
        'Escribe el código de la sala.'
      )

      return
    }


    setJoining(true)

    setMessage('')


    try {
      const {
        data: foundRoom,
        error: roomError
      } =
        await supabase
          .from('rooms')
          .select('*')
          .eq(
            'code',
            normalizedCode
          )
          .single()


      if (
        roomError ||
        !foundRoom
      ) {
        throw new Error(
          'No encontré esa sala.'
        )
      }


      if (
        foundRoom.status !==
        'waiting'
      ) {
        throw new Error(
          'La partida ya comenzó.'
        )
      }


      const {
        data: existingPlayers,
        error: playersError
      } =
        await supabase
          .from('room_players')
          .select('*')
          .eq(
            'room_id',
            foundRoom.id
          )


      if (playersError) {
        throw playersError
      }


      if (
        existingPlayers.length >=
        foundRoom.max_players
      ) {
        throw new Error(
          'La sala está llena.'
        )
      }


      const duplicatedName =
        existingPlayers.some(
          item =>
            item
              .player_name
              .trim()
              .toLowerCase() ===
            joinName
              .trim()
              .toLowerCase()
        )


      if (duplicatedName) {
        throw new Error(
          'Ya hay un jugador con ese nombre.'
        )
      }


      const {
        data: playerData,
        error: playerError
      } =
        await supabase
          .from('room_players')
          .insert({
            room_id:
              foundRoom.id,

            player_name:
              joinName
                .trim()
                .slice(
                  0,
                  30
                ),

            score:
              0,

            is_host:
              false
          })
          .select()
          .single()


      if (playerError) {
        throw playerError
      }


      const sessionData = {
        room_id:
          foundRoom.id,

        player_id:
          playerData.id,

        player_name:
          playerData.player_name,

        is_host:
          false
      }


      sessionStorage.setItem(
        `daleplay-room-${foundRoom.code}`,
        JSON.stringify(
          sessionData
        )
      )


      setRoom(
        foundRoom
      )

      setCurrentPlayer(
        sessionData
      )


      await loadPlayers(
        foundRoom.id
      )


    } catch (error) {
      console.error(error)

      setMessage(
        error.message ||
        'No se pudo entrar a la sala.'
      )

    } finally {
      setJoining(false)
    }
  }


  /*
  =====================================
  JUGADORES
  =====================================
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
          'joined_at',
          {
            ascending: true
          }
        )


    if (error) {
      console.error(error)

      return
    }


    setPlayers(
      data || []
    )
  }


  /*
  =====================================
  REALTIME
  =====================================
  */

  useEffect(() => {
    if (!room?.id) {
      return
    }


    const roomId =
      room.id


    const channel =
      supabase
        .channel(
          `daleplay-lobby-${roomId}`
        )

        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter:
              `room_id=eq.${roomId}`
          },
          () => {
            loadPlayers(
              roomId
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
              `id=eq.${roomId}`
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
  =====================================
  INICIAR PARTIDA
  =====================================
  */

  async function startGame() {
    if (
      !currentPlayer?.is_host ||
      !room
    ) {
      return
    }


    if (
      players.length < 2
    ) {
      setMessage(
        'Necesitas al menos 2 jugadores.'
      )

      return
    }


    setMessage('')


    const {
      data: availableSongs,
      error: songError
    } =
      await supabase
        .from('songs')
        .select(
          'id, spotify_id'
        )
        .eq(
          'active',
          true
        )
        .not(
          'spotify_id',
          'is',
          null
        )


    if (
      songError ||
      !availableSongs?.length
    ) {
      setMessage(
        'No hay canciones disponibles.'
      )

      return
    }


    const firstSong =
      availableSongs[
        Math.floor(
          Math.random() *
          availableSongs.length
        )
      ]


    /*
    ESTE valor queda guardado
    para TODOS los jugadores.
    */

    const clipStart =
      generateClipStart()


    const startAt =
      new Date(
        Date.now() +
        3000
      )
        .toISOString()


    const {
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
            firstSong.id,

          round_started_at:
            startAt,

          clip_start:
            clipStart
        })
        .eq(
          'id',
          room.id
        )


    if (error) {
      setMessage(
        error.message
      )
    }
  }


  async function copyCode() {
    try {
      await navigator.clipboard.writeText(
        room.code
      )

      setMessage(
        'Código copiado.'
      )

    } catch {
      setMessage(
        `Código: ${room.code}`
      )
    }
  }


  /*
  =====================================
  LOBBY
  =====================================
  */

  if (
    room &&
    currentPlayer
  ) {
    return (
      <section className="rooms-wrap">

        <div className="room-lobby-card">

          <span className="room-eyebrow">
            Sala privada
          </span>

          <h1>
            Esperando jugadores
          </h1>


          <div className="room-code-box">

            <span>
              CÓDIGO
            </span>

            <strong>
              {room.code}
            </strong>

            <button
              type="button"
              onClick={copyCode}
            >
              <Copy size={18} />
              Copiar
            </button>

          </div>


          <div className="room-settings-summary">

            <span>
              <Gamepad2 size={18} />

              {room.total_rounds}
              {' '}
              {room.total_rounds === 1
                ? 'ronda'
                : 'rondas'}
            </span>

            <span>
              <Users size={18} />

              {players.length}
              /
              {room.max_players}
            </span>

          </div>


          <div className="room-player-list">

            {players.map(
              item => (

                <div
                  className="room-player-row"
                  key={item.id}
                >

                  <span className="room-player-avatar">

                    {item
                      .player_name
                      .charAt(0)
                      .toUpperCase()}

                  </span>


                  <strong>
                    {item.player_name}
                  </strong>


                  {item.is_host && (

                    <span className="room-host-badge">

                      <Crown size={15} />

                      Host

                    </span>

                  )}

                </div>

              )
            )}

          </div>


          {message && (

            <div className="message">
              {message}
            </div>

          )}


          {currentPlayer.is_host ? (

            <button
              className="primary room-start-btn"
              onClick={startGame}
              disabled={
                players.length < 2
              }
            >

              <Play size={20} />

              {players.length < 2
                ? 'Esperando otro jugador...'
                : 'Comenzar partida'}

            </button>

          ) : (

            <p className="muted">
              El host iniciará la partida.
            </p>

          )}

        </div>

      </section>
    )
  }


  /*
  =====================================
  CREAR / ENTRAR
  =====================================
  */

  return (
    <section className="rooms-wrap">

      <div className="rooms-heading">

        <span className="room-eyebrow">
          MULTIJUGADOR
        </span>

        <h1>
          Juega con tus amigos
        </h1>

        <p>
          Crea una sala privada o entra con un código.
        </p>

      </div>


      <div className="rooms-grid">


        <div className="room-create-card">

          <div className="room-card-icon">
            <Plus />
          </div>

          <h2>
            Crear sala
          </h2>


          <label>
            Tu nombre
          </label>

          <input
            value={hostName}
            maxLength={30}
            placeholder="Ej. Luis"
            onChange={
              event =>
                setHostName(
                  event.target.value
                )
            }
          />


          <label>
            Cantidad de rondas
          </label>


          <div className="room-round-options">

            {[5, 10, 15, 20].map(
              amount => (

                <button
                  key={amount}
                  type="button"
                  className={
                    totalRounds === amount
                      ? 'active'
                      : ''
                  }
                  onClick={
                    () =>
                      setTotalRounds(
                        amount
                      )
                  }
                >
                  {amount}
                </button>

              )
            )}

          </div>


          <button
            className="primary"
            onClick={createRoom}
            disabled={creating}
          >

            <Plus size={19} />

            {creating
              ? 'Creando...'
              : 'Crear sala'}

          </button>

        </div>


        <div className="room-join-card">

          <div className="room-card-icon">
            <LogIn />
          </div>

          <h2>
            Unirse a una sala
          </h2>


          <label>
            Tu nombre
          </label>

          <input
            value={joinName}
            maxLength={30}
            placeholder="Ej. Ramón"
            onChange={
              event =>
                setJoinName(
                  event.target.value
                )
            }
          />


          <label>
            Código
          </label>

          <input
            value={joinCode}
            maxLength={5}
            placeholder="ABCDE"
            onChange={
              event =>
                setJoinCode(
                  event
                    .target
                    .value
                    .toUpperCase()
                )
            }
          />


          <button
            className="primary"
            onClick={joinRoom}
            disabled={joining}
          >

            <LogIn size={19} />

            {joining
              ? 'Entrando...'
              : 'Entrar a sala'}

          </button>

        </div>

      </div>


      {message && (

        <div className="message">
          {message}
        </div>

      )}

    </section>
  )
}