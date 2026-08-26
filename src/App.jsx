import {
  NavLink,
  Route,
  Routes
} from 'react-router-dom'

import {
  Gamepad2,
  Users
} from 'lucide-react'

import { Analytics } from '@vercel/analytics/react'

import GamePage
  from './pages/GamePage'

import AdminPage
  from './pages/AdminPage'

import RoomsPage
  from './pages/RoomsPage'

import RoomGamePage
  from './pages/RoomGamePage'

import SpotifyTestPage
  from './pages/SpotifyTestPage'


export default function App() {

  return (

    <div className="app-shell">


      <header className="topbar">


        <NavLink
          to="/"
          className="brand"
        >

          DALE PLAY

        </NavLink>


        <nav className="main-nav">


          <NavLink
            to="/"
            end
            className={
              ({ isActive }) =>
                isActive
                  ? 'nav-pill active'
                  : 'nav-pill'
            }
          >

            <Gamepad2
              size={18}
            />

            Jugar

          </NavLink>


          <NavLink
            to="/salas"
            className={
              ({ isActive }) =>
                isActive
                  ? 'nav-pill active'
                  : 'nav-pill'
            }
          >

            <Users
              size={18}
            />

            Sala privada

          </NavLink>


        </nav>


        <div className="topbar-spacer" />


      </header>


      <main>


        <Routes>


          <Route
            path="/"
            element={
              <GamePage />
            }
          />


          <Route
            path="/salas"
            element={
              <RoomsPage />
            }
          />


          <Route
            path="/salas/:code/juego"
            element={
              <RoomGamePage />
            }
          />


          <Route
            path="/admin"
            element={
              <AdminPage />
            }
          />


          <Route
            path="/spotify-test"
            element={
              <SpotifyTestPage />
            }
          />


        </Routes>


      </main>


      <Analytics />


    </div>
  )
}