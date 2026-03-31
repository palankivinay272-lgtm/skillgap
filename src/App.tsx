import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  Link, 
  useNavigate 
} from 'react-router-dom';
import { 
  LayoutDashboard, 
  User, 
  LogOut, 
  BarChart3, 
  Settings, 
  BookOpen,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';
import { cn } from './lib/utils';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { seedInitialData } from './seedData';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import MySkills from './pages/MySkills';

import { Toaster } from 'sonner';

const Layout = ({ children, user, onLogout }: { children: React.ReactNode, user: any, onLogout: () => void }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && <h1 className="font-bold text-xl text-blue-600">SkillGap</h1>}
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-slate-100 rounded">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <Link to="/" className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors">
            <LayoutDashboard size={20} />
            {isSidebarOpen && <span>Dashboard</span>}
          </Link>
          {user.role === 'student' && (
            <Link to="/skills" className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors">
              <BookOpen size={20} />
              {isSidebarOpen && <span>My Skills</span>}
            </Link>
          )}
          {user.role === 'admin' && (
            <Link to="/requirements" className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors">
              <Settings size={20} />
              {isSidebarOpen && <span>Industry Setup</span>}
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
              {user.name[0]}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 capitalize">{user.role}</p>
              </div>
            )}
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 p-3 mt-2 rounded-lg hover:bg-red-50 text-slate-600 hover:text-red-600 transition-colors"
          >
            <LogOut size={20} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-bottom border-slate-200 h-16 flex items-center px-8 sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-slate-800">
            {window.location.pathname === '/' ? 'Dashboard Overview' : 'Skill Management'}
          </h2>
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const fullUser = {
              id: firebaseUser.uid,
              name: userData.name,
              role: userData.role,
              target_role_id: userData.targetRoleId,
              batch: userData.batch
            };
            setUser(fullUser);
            localStorage.setItem('user', JSON.stringify(fullUser));
            const token = await firebaseUser.getIdToken();
            localStorage.setItem('token', token);

            // Seed data only if the user is an admin
            if (userData.role === 'admin') {
              seedInitialData();
            }
          } else {
            setUser(null);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setUser(null);
        }
      } else {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData.user);
    localStorage.setItem('token', userData.token);
    localStorage.setItem('user', JSON.stringify(userData.user));
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (loading) return null;

  return (
    <Router>
      <Toaster position="top-right" richColors />
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
          <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to="/" />} />
          <Route path="/" element={
            user ? (
              user.role === 'student' ? <StudentDashboard user={user} /> : <AdminDashboard />
            ) : <Navigate to="/login" />
          } />
          <Route path="/skills" element={
            user && user.role === 'student' ? <MySkills /> : <Navigate to="/login" />
          } />
          <Route path="/requirements" element={
            user && user.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" />
          } />
          {/* Add more routes as needed */}
        </Routes>
      </Layout>
    </Router>
  );
}
