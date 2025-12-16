// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

// Pages
import Register from './pages/Register';
import Login from './pages/Login';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import Friends from './pages/Friends';
import FriendsList from './pages/FriendsList';
import Requests from './pages/Requests';
import Chat from './pages/Chat';
import Dialogs from './pages/Dialogs';
import Admin from './pages/Admin';
import Shop from './pages/Shop';
import Cart from './pages/Cart';
import AdminShop from './pages/AdminShop';
import Orders from './pages/Orders';
import ServerRules from './pages/ServerRules';
import EditRules from './pages/EditRules';

// Layout
import Header from './components/Header';
import Footer from './components/Footer';

// Context
import { CartProvider } from './context/CartContext';

// Components
import IncomingCall from './components/IncomingCall';

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Получаем текущую сессию
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setChecking(false);
    }).catch(() => setChecking(false));

    // Подписка на изменения авторизации
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription?.unsubscribe();
    };
  }, []);

  if (checking) {
    return <div style={{ padding: 24 }}>Загрузка...</div>;
  }

  const isAuth = Boolean(session?.user?.id);
  const currentUserId = session?.user?.id || null;

  return (
    <CartProvider>
      <BrowserRouter>
        <Header session={session} />

        {/* Входящие вызовы — монтируем только при наличии валидного user.id */}
        {isAuth && currentUserId && (
          <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 1000 }}>
            {/* key фиксирует ремонт при смене пользователя */}
            <IncomingCall key={currentUserId} currentUserId={currentUserId} />
          </div>
        )}

        <main style={{ minHeight: 'calc(100vh - 120px)', padding: '16px' }}>
          <Routes>
            {/* Главная */}
            <Route
              path="/"
              element={<Navigate to={isAuth ? "/profile" : "/login"} replace />}
            />

            {/* Регистрация и вход */}
            <Route
              path="/register"
              element={isAuth ? <Navigate to="/profile" replace /> : <Register />}
            />
            <Route
              path="/login"
              element={isAuth ? <Navigate to="/profile" replace /> : <Login />}
            />

            {/* Профиль */}
            <Route
              path="/profile"
              element={isAuth ? <Profile /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/profile/:id"
              element={isAuth ? <UserProfile /> : <Navigate to="/login" replace />}
            />

            {/* Друзья */}
            <Route
              path="/friends"
              element={isAuth ? <Friends /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/friends-list"
              element={isAuth ? <FriendsList /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/requests"
              element={isAuth ? <Requests /> : <Navigate to="/login" replace />}
            />

            {/* Чаты */}
            <Route
              path="/chat/:partnerId"
              element={isAuth ? <Chat /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/dialogs"
              element={isAuth ? <Dialogs /> : <Navigate to="/login" replace />}
            />

            {/* Админка */}
            <Route
              path="/admin"
              element={isAuth ? <Admin /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/admin-shop"
              element={isAuth ? <AdminShop /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/admin-orders"
              element={isAuth ? <Orders /> : <Navigate to="/login" replace />}
            />

            {/* Магазин */}
            <Route
              path="/shop"
              element={isAuth ? <Shop /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/cart"
              element={isAuth ? <Cart session={session} /> : <Navigate to="/login" replace />}
            />

            {/* Правила */}
            <Route
              path="/server-rules"
              element={isAuth ? <ServerRules /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/edit-rules"
              element={isAuth ? <EditRules /> : <Navigate to="/login" replace />}
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <Footer />
      </BrowserRouter>
    </CartProvider>
  );
}
