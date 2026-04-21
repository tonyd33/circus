import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ChimpActivity } from "./pages/ChimpActivity";
import { ChimpsList } from "./pages/ChimpsList";
import { DashboardHome } from "./pages/DashboardHome";
import { Profiles } from "./pages/Profiles";
import "./index.css";

function Header() {
  return (
    <nav className="border-b border-circus-crimson/20 bg-circus-navy p-4 shadow-md">
      <div className="container mx-auto flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="text-2xl group-hover:animate-bounce">🎪</span>
          <span className="font-bold text-xl tracking-wide text-circus-gold">
            Circus
          </span>
        </Link>
        <div className="flex gap-6">
          <Link
            to="/chimps"
            className="text-white/90 hover:text-circus-gold transition-colors text-sm font-medium"
          >
            Chimps
          </Link>
          <Link
            to="/profiles"
            className="text-white/90 hover:text-circus-gold transition-colors text-sm font-medium"
          >
            Profiles
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/chimps" element={<ChimpsList />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/chimps/:chimpId/activity" element={<ChimpActivity />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
